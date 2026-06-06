import { NextRequest, NextResponse } from 'next/server';

// ============================================
// In-memory broadcast store (fallback)
// Shared across requests in same Node.js process
// ============================================
const broadcastStore: Array<{
  sessionId: string;
  senderDeviceId: string;
  targetTime: number;
  payload: any;
  createdAt: number;
}> = [];

// Cleanup old entries every 30 seconds
setInterval(() => {
  const cutoff = Date.now() - 60000;
  while (broadcastStore.length > 0 && broadcastStore[0].createdAt < cutoff) {
    broadcastStore.shift();
  }
}, 30000);

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

/**
 * POST /api/answer-sheet-sync
 * Broadcast a sync event
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, senderDeviceId, targetTime, payload } = body;

    if (!targetTime || !payload) {
      return NextResponse.json({ error: 'Missing targetTime or payload' }, { status: 400 });
    }

    // Always store in memory
    const record = {
      sessionId: sessionId || 'unknown',
      senderDeviceId: senderDeviceId || 'unknown',
      targetTime,
      payload,
      createdAt: Date.now(),
    };
    broadcastStore.push(record);
    if (broadcastStore.length > 1000) broadcastStore.splice(0, 100);

    // Also write to Supabase DB as durable storage
    try {
      const supabase = await tryGetSupabase();
      if (supabase) {
        await supabase.from('answer_sheet_broadcasts').insert({
          session_id: record.sessionId,
          sender_device_id: record.senderDeviceId,
          target_time: record.targetTime,
          payload: record.payload,
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }).select('id').single();
      }
    } catch (e) {
      // DB write is optional
    }

    return NextResponse.json({ ok: true, sessionId: record.sessionId, targetTime: record.targetTime });

  } catch (err) {
    console.error('[AnswerSheetSync] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/answer-sheet-sync?self=sender_device_id
 * Returns ALL recent broadcasts (not filtered by sessionId!)
 * Query params:
 *   self: exclude broadcasts from this device
 *   since: only return broadcasts created after this ms timestamp
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const selfDeviceId = searchParams.get('self') || '';
  const sinceMs = parseInt(searchParams.get('since') || '0', 10);
  const useDB = searchParams.get('db') === '1'; // optional: force DB query for test

  const results: Array<{
    sessionId: string;
    senderDeviceId: string;
    targetTime: number;
    payload: any;
    createdAt: number;
  }> = [];

  // Phase 1: In-memory store (non-DB mode or always)
  if (!useDB) {
    for (const r of broadcastStore) {
      if (sinceMs > 0 && r.createdAt < sinceMs) continue;
      if (selfDeviceId && r.senderDeviceId === selfDeviceId) continue;
      results.push(r);
    }
  }

  // Phase 2: Supabase DB
  try {
    const supabase = await tryGetSupabase();
    if (supabase) {
      let query = supabase
        .from('answer_sheet_broadcasts')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (sinceMs > 0) {
        query = query.gte('created_at', new Date(sinceMs).toISOString());
      }

      const { data, error } = await query;
      if (!error && data) {
        for (const row of data) {
          if (selfDeviceId && row.sender_device_id === selfDeviceId) continue;
          // Dedup by targetTime
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
    // DB query failed
  }

  // Sort newest first
  results.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({
    broadcasts: results.slice(0, 10).map(r => ({
      sessionId: r.sessionId,
      senderDeviceId: r.senderDeviceId,
      targetTime: r.targetTime,
      payload: r.payload,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';