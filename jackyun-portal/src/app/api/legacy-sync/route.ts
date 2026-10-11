import { NextRequest, NextResponse } from 'next/server';
import { forwardAzureSync } from '@/lib/sync/azure-proxy';
import { createClient } from '@/lib/supabase/server';
import { isSyncableStorageKey } from '@/lib/local-workspace';

const TAG = 'API/LegacySync';

/** Helper to log and return error */
function apiError(message: string, status: number, detail?: unknown) {
  console.error(`[${TAG}] ${message}`, detail ?? '');
  return NextResponse.json({ ok: false, error: message, timestamp: new Date().toISOString() }, { status });
}

// GET /api/legacy-sync — load all legacy data for the current user
// Each value is wrapped with its updated_at timestamp so the client can
// decide whether the cloud copy is newer than the local copy.
export async function GET(request: NextRequest) {
  const azureResponse = await forwardAzureSync(request);
  if (azureResponse) return azureResponse;
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
export async function POST() {
  return NextResponse.json({ok:false,error:{code:'SYNC_UPGRADE_REQUIRED',message:'Use versioned workspace sync; local changes are retained.'}},{status:426});
}
export const PUT=POST;
export const DELETE=POST;
export const dynamic='force-dynamic';
export const runtime='nodejs';
