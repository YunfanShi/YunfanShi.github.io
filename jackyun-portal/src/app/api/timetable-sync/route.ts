import { NextResponse } from 'next/server';
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
      return NextResponse.json({ ok: false, error: 'Database query failed' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: true, th_state: null, th_config: null });
    }

    return NextResponse.json({
      ok: true,
      th_state: data.th_state,
      th_config: data.th_config,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

/**
 * POST /api/timetable-sync
 * Save the authenticated user's timetable hub data to Supabase.
 * Body: { th_state?, th_config? }
 */
export async function POST() {
  return NextResponse.json({ok:false,error:{code:'SYNC_UPGRADE_REQUIRED',message:'Use versioned workspace sync; local changes are retained.'}},{status:426});
}
export const DELETE=POST;
export const dynamic='force-dynamic';
export const runtime='nodejs';
