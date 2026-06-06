import { NextRequest, NextResponse } from 'next/server';

// ============================================
// In-memory broadcast store (fallback)
// Used when Supabase table doesn't exist yet
// ============================================
const broadcastStore: Array<{
  sessionId: string;
  senderDeviceId: string;
  targetTime: number;
  payload: any;
  createdAt: number; // epoch ms
}> = [];

// Cleanup old entries every 30 seconds
setInterval(() => {
  const cutoff = Date.now() - 60000; // 1 minute TTL
  while (broadcastStore.length > 0 && broadcastStore[0].createdAt < cutoff) {
    broadcastStore.shift();
  }
}, 30000);

/**
 * POST /api/answer-sheet-sync
 * Broadcast a sync event to all connected devices
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, senderDeviceId, targetTime, payload } = body;

    if (!targetTime || !payload) {
      return NextResponse.json(
        { error: 'Missing required fields: targetTime, payload' },
        { status: 400 }
      );
    }

    // Always store in memory regardless of DB status
    const record = {
      sessionId: sessionId || crypto.randomUUID(),
      senderDeviceId: senderDeviceId || 'unknown',
      targetTime,
      payload,
      createdAt: Date.now(),
    };
    broadcastStore.push(record);
    // Limit store size
    if (broadcastStore.length > 1000) broadcastStore.splice(0, 100);

    // Try Supabase DB insert (for Realtime subscribers)
    const supabase = await tryGetSupabase();
    if (supabase) {
      const { error: insertError } = await supabase
        .from('answer_sheet_broadcasts')
        .insert({
          session_id: record.sessionId,
          sender_device_id: record.senderDeviceId,
          target_time: record.targetTime,
          payload: record.payload,
          expires_at: new Date(Date.now() + 30000).toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.warn('[AnswerSheetSync] DB insert failed (non-fatal):', insertError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId: record.sessionId,
      targetTime: record.targetTime,
    });

  } catch (err) {
    console.error('[AnswerSheetSync] Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/answer-sheet-sync?sessionId=xxx&since=xxx
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const sinceMs = parseInt(searchParams.get('since') || '0', 10);

  if (!sessionId) {
    return NextResponse.json({ broadcasts: [] });
  }

  // --- Phase 1: Check in-memory store ---
  const results = broadcastStore.filter(r => {
    if (r.sessionId !== sessionId) return false;
    if (sinceMs > 0 && r.createdAt < sinceMs) return false;
    return true;
  });

  // --- Phase 2: Try Supabase DB for any additional records ---
  try {
    const supabase = await tryGetSupabase();
    if (supabase) {
      let query = supabase
        .from('answer_sheet_broadcasts')
        .select('*')
        .eq('session_id', sessionId)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (sinceMs > 0) {
        query = query.gte('created_at', new Date(sinceMs).toISOString());
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        // Merge DB results with memory results (dedup by targetTime)
        for (const row of data) {
          if (!results.some(r => r.targetTime === row.target_time)) {
            results.push({
              sessionId: row.session_id,
              senderDeviceId: row.sender_device_id,
              targetTime: row.target_time,
              payload: row.payload,
              createdAt: new Date(row.created_at).getTime(),
            });
          }
        }
      }
    }
  } catch (e) {
    // DB query failed, that's fine - we have memory store
  }

  // Sort by newest first
  results.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({
    broadcasts: results.slice(0, 5).map(r => ({
      sessionId: r.sessionId,
      senderDeviceId: r.senderDeviceId,
      targetTime: r.targetTime,
      payload: r.payload,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  });
}

// Lazy Supabase client (won't throw if env missing)
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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';