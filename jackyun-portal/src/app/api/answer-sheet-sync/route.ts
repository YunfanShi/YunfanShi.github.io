import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase admin client for broadcast operations
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/answer-sheet-sync
 * Broadcast a sync event to all connected devices
 * Body: {
 *   sessionId: string,
 *   senderDeviceId: string, 
 *   targetTime: number,
 *   payload: object
 * }
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

    const supabase = getSupabaseAdmin();

    // Method 1: Insert into broadcasts table (Supabase Realtime will push this)
    const { data: insertData, error: insertError } = await supabase
      .from('answer_sheet_broadcasts')
      .insert({
        session_id: sessionId || crypto.randomUUID(),
        sender_device_id: senderDeviceId || 'unknown',
        target_time: targetTime,
        payload: payload,
        expires_at: new Date(Date.now() + 30000).toISOString(), // 30 seconds
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[AnswerSheetSync] DB insert error:', insertError);
      // Fallback: return the data directly for polling clients
      return NextResponse.json({
        ok: true,
        warning: 'Realtime insert failed, clients should poll',
        targetTime,
        payload,
        sessionId: sessionId || crypto.randomUUID(),
      });
    }

    return NextResponse.json({
      ok: true,
      broadcastId: insertData?.id,
      targetTime,
      sessionId: sessionId || crypto.randomUUID(),
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
 * GET /api/answer-sheet-sync?sessionId=xxx
 * Poll for broadcast data (fallback method)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const sinceMs = searchParams.get('since'); // poll since this time

  if (!sessionId) {
    return NextResponse.json({ broadcasts: [] });
  }

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('answer_sheet_broadcasts')
    .select('*')
    .eq('session_id', sessionId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (sinceMs) {
    const sinceDate = new Date(parseInt(sinceMs)).toISOString();
    query = query.gte('created_at', sinceDate);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ broadcasts: [], error: error.message });
  }

  return NextResponse.json({
    broadcasts: (data || []).map(row => ({
      id: row.id,
      sessionId: row.session_id,
      senderDeviceId: row.sender_device_id,
      targetTime: row.target_time,
      payload: row.payload,
      createdAt: row.created_at,
    })),
  });
}

// Configure route segment
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';