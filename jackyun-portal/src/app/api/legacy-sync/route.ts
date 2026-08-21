import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSyncableStorageKey, storageValueToString } from '@/lib/local-workspace';

const TAG = 'API/LegacySync';

/** Helper to log and return error */
function apiError(message: string, status: number, detail?: unknown) {
  console.error(`[${TAG}] ${message}`, detail ?? '');
  return NextResponse.json({ ok: false, error: message, detail, timestamp: new Date().toISOString() }, { status });
}

// GET /api/legacy-sync — load all legacy data for the current user
// Each value is wrapped with its updated_at timestamp so the client can
// decide whether the cloud copy is newer than the local copy.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', 401);

    const { data, error } = await supabase
      .from('legacy_sync_data')
      .select('storage_key, storage_value, updated_at')
      .eq('user_id', user.id);

    if (error) return apiError('Database query failed', 500, error);

    // Backwards-compatible shape: { key: value } as before, plus a
    // parallel _ts map { key: updated_at } for timestamp comparison.
    const result: Record<string, unknown> = {};
    const timestamps: Record<string, string> = {};
    for (const row of data ?? []) {
      if (!isSyncableStorageKey(row.storage_key)) continue;
      result[row.storage_key] = row.storage_value;
      if (row.updated_at) timestamps[row.storage_key] = row.updated_at;
    }
    return NextResponse.json({ ok: true, data: result, timestamps });
  } catch (err) {
    return apiError('Internal server error', 500, err instanceof Error ? err.message : String(err));
  }
}

// POST /api/legacy-sync — upsert a single key/value
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', 401);

    const body = await request.json() as { key?: string; value?: unknown; entries?: Array<{ key?: string; value?: unknown }> };
    const entries = Array.isArray(body.entries) ? body.entries : [{ key: body.key, value: body.value }];
    if (!entries.length || entries.length > 200) return apiError('Invalid entry count', 400);
    const now = new Date().toISOString();
    const rows = entries.map(({ key, value }) => {
      if (!key || !isSyncableStorageKey(key)) throw new Error('Storage key is not syncable');
      const storageValue = storageValueToString(value);
      if (storageValue.length > 100_000) throw new Error('Storage value is too large');
      return { user_id: user.id, storage_key: key, storage_value: storageValue, updated_at: now };
    });

    const { error } = await supabase.from('legacy_sync_data').upsert(rows, { onConflict: 'user_id,storage_key' });

    if (error) return apiError('Database upsert failed', 500, error);

    return NextResponse.json({ ok: true, timestamp: now, count: rows.length });
  } catch (err) {
    return apiError('Internal server error', 500, err instanceof Error ? err.message : String(err));
  }
}

// PUT /api/legacy-sync — upsert a single key/value (alias for POST)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', 401);

    const body = await request.json();
    const { key, value } = body as { key: string; value: unknown };
    if (!key || !isSyncableStorageKey(key)) return apiError('Storage key is not syncable', 400);

    const storageValue =
      typeof value === 'string'
        ? (() => { try { return JSON.parse(value); } catch { return value; } })()
        : value;

    const { error } = await supabase.from('legacy_sync_data').upsert(
      {
        user_id: user.id,
        storage_key: key,
        storage_value: storageValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,storage_key' },
    );

    if (error) return apiError('Database upsert failed', 500, error);

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return apiError('Internal server error', 500, err instanceof Error ? err.message : String(err));
  }
}

// DELETE /api/legacy-sync — remove a single key
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', 401);

    const body = await request.json();
    const { key } = body as { key: string };
    if (!key || !isSyncableStorageKey(key)) return apiError('Storage key is not syncable', 400);

    const { error } = await supabase
      .from('legacy_sync_data')
      .delete()
      .eq('user_id', user.id)
      .eq('storage_key', key);

    if (error) return apiError('Database delete failed', 500, error);

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return apiError('Internal server error', 500, err instanceof Error ? err.message : String(err));
  }
}
