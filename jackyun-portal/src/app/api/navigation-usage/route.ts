import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NAVIGATION_ITEMS } from '@/lib/navigation';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { itemId?: string } | null;
  if (!body?.itemId || !NAVIGATION_ITEMS.some((item) => item.id === body.itemId)) return NextResponse.json({ ok: false, error: 'Invalid navigation item' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { error } = await supabase.rpc('increment_navigation_usage', { p_nav_item_id: body.itemId });
  return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
