import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/timetable-sync
 * Load the authenticated user's timetable hub data from Supabase.
 * Returns { ok, th_state, th_config } or { ok: false } if not found.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('timetable_hub_data')
      .select('th_state, th_config')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: 'Database query failed', detail: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: true, th_state: null, th_config: null });
    }

    return NextResponse.json({
      ok: true,
      th_state: data.th_state,
      th_config: data.th_config,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

/**
 * POST /api/timetable-sync
 * Save the authenticated user's timetable hub data to Supabase.
 * Body: { th_state?, th_config? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { th_state, th_config } = body as { th_state?: unknown; th_config?: unknown };

    // Build upsert payload — only include provided fields
    const upsertPayload: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (th_state !== undefined) upsertPayload.th_state = th_state;
    if (th_config !== undefined) upsertPayload.th_config = th_config;

    const { error } = await supabase
      .from('timetable_hub_data')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (error) {
      return NextResponse.json({ ok: false, error: 'Database upsert failed', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

/**
 * DELETE /api/timetable-sync
 * Clear the authenticated user's timetable hub data.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('timetable_hub_data')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: 'Database delete failed', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';