import { NextRequest, NextResponse } from 'next/server';

// ============================================
// Answer Sheet Sync API
// Uses Supabase DB as single source of truth
// Each broadcast has a broadcast_id for dedup
// Devices mark broadcasts as consumed to prevent replay
// ============================================

// Lazy Supabase client
let _supabaseClient: any = null;

async function tryGetSupabase() {
  if (_supabaseClient) return _supabaseClient;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const { createClient } = await import('@supabase/supabase-js');
    _supabaseClient = createClient(url, key);
    return _supabaseClient;
  } catch (e) {
    return null;
  }
}

function generateBroadcastId() {
  return 'bc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * POST /api/answer-sheet-sync
 * Broadcast a sync event - writes to Supabase DB
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, senderDeviceId, targetTime, payload } = body;

    if (!targetTime || !payload) {
      return NextResponse.json({ error: 'Missing targetTime or payload' }, { status: 400 });
    }

    // Ensure payload is a plain object (defend against double-encoding)
    let normalizedPayload = payload;
    if (typeof normalizedPayload === 'string') {
      try {
        normalizedPayload = JSON.parse(normalizedPayload);
      } catch (e) {
        return NextResponse.json({ error: 'payload is string but not valid JSON' }, { status: 400 });
      }
    }

    const broadcastId = generateBroadcastId();

    // Write to Supabase DB as durable storage
    const supabase = await tryGetSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const { error } = await supabase.from('answer_sheet_broadcasts').insert({
      session_id: sessionId || 'unknown',
      sender_device_id: senderDeviceId || 'unknown',
      target_time: targetTime,
      payload: normalizedPayload,
      broadcast_id: broadcastId,
      expires_at: new Date(Date.now() + 15000).toISOString(),
      consumed_by: [],
    }).select('id').single();

    if (error) {
      console.error('[AnswerSheetSync] DB insert error:', error);
      // Return real error instead of fake ok:true
      return NextResponse.json({ 
        error: 'DB insert failed', 
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, broadcastId, sessionId, targetTime });

  } catch (err) {
    console.error('[AnswerSheetSync] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/answer-sheet-sync
 * Returns ONLY un-consumed broadcasts for the requesting device
 * Query params:
 *   self: device ID - broadcasts from this device are excluded
 *   since: only return broadcasts created after this ms timestamp
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const selfDeviceId = searchParams.get('self') || '';
  const sinceMs = parseInt(searchParams.get('since') || '0', 10);
  const sinceDate = sinceMs > 0 ? new Date(sinceMs).toISOString() : new Date(Date.now() - 5000).toISOString();

  const supabase = await tryGetSupabase();
  if (!supabase) {
    return NextResponse.json({ broadcasts: [], error: 'Database not available' });
  }

  try {
    // Get broadcasts that:
    // 1. Haven't expired
    // 2. Weren't sent by self
    // 3. Haven't been consumed by this device yet
    // 4. Are newer than since Date
    const { data, error } = await supabase
      .from('answer_sheet_broadcasts')
      .select('*')
      .gte('expires_at', new Date().toISOString())
      .gte('created_at', sinceDate)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[AnswerSheetSync] GET error:', error);
      return NextResponse.json({ broadcasts: [], error: error.message });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ broadcasts: [] });
    }

    // Filter out self-sent and already-consumed
    const results = [];
    for (const row of data) {
      // Skip self-sent
      if (selfDeviceId && row.sender_device_id === selfDeviceId) continue;

      // Skip if already consumed by this device
      const consumedBy = row.consumed_by || [];
      if (selfDeviceId && consumedBy.includes(selfDeviceId)) continue;

      // Normalize payload: DB stores it as JSON, but Supabase may return as string
      let payload = row.payload;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = { _raw: payload };
        }
      }

      results.push({
        broadcastId: row.broadcast_id,
        sessionId: row.session_id,
        senderDeviceId: row.sender_device_id,
        targetTime: row.target_time,
        payload: payload,
        createdAt: new Date(row.created_at).toISOString(),
        // Include the DB row id so the client can mark as consumed
        rowId: row.id,
      });
    }

    return NextResponse.json({ broadcasts: results.slice(0, 5) });

  } catch (e) {
    console.error('[AnswerSheetSync] GET exception:', e);
    return NextResponse.json({ broadcasts: [], error: e instanceof Error ? e.message : 'Unknown error' });
  }
}

/**
 * PATCH /api/answer-sheet-sync
 * Mark a broadcast as consumed by a device
 * Body: { rowId: number, deviceId: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { rowId, deviceId } = body;

    if (!rowId || !deviceId) {
      return NextResponse.json({ error: 'Missing rowId or deviceId' }, { status: 400 });
    }

    const supabase = await tryGetSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // Use Supabase's jsonb append to add device to consumed_by
    const { error } = await supabase.rpc('append_consumed_by', {
      row_id: rowId,
      device_id: deviceId,
    });

    if (error) {
      // If function doesn't exist, do manual update
      const { data: current } = await supabase
        .from('answer_sheet_broadcasts')
        .select('consumed_by')
        .eq('id', rowId)
        .single();

      if (current) {
        const consumed = current.consumed_by || [];
        if (!consumed.includes(deviceId)) {
          consumed.push(deviceId);
          const { error: updateError } = await supabase
            .from('answer_sheet_broadcasts')
            .update({ consumed_by: consumed })
            .eq('id', rowId);
          if (updateError) {
            console.error('[AnswerSheetSync] PATCH update error:', updateError);
            return NextResponse.json({ error: 'Update failed' }, { status: 500 });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[AnswerSheetSync] PATCH error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';