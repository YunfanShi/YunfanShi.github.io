import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/legacy-sync — load all legacy data for the current user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({}, { status: 401 });

  const { data } = await supabase
    .from('legacy_sync_data')
    .select('storage_key, storage_value')
    .eq('user_id', user.id);

  const result: Record<string, unknown> = {};
  for (const row of data ?? []) {
    result[row.storage_key] = row.storage_value;
  }
  return NextResponse.json(result);
}

// POST /api/legacy-sync — upsert a single key/value
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { key, value } = body as { key: string; value: unknown };
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const storageValue =
    typeof value === 'string'
      ? (() => { try { return JSON.parse(value); } catch { return value; } })()
      : value;

  await supabase.from('legacy_sync_data').upsert(
    {
      user_id: user.id,
      storage_key: key,
      storage_value: storageValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,storage_key' },
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/legacy-sync — remove a single key
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { key } = body as { key: string };
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  await supabase
    .from('legacy_sync_data')
    .delete()
    .eq('user_id', user.id)
    .eq('storage_key', key);

  return NextResponse.json({ ok: true });
}
