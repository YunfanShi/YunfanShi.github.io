import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { createAzureRecordClient } from './azure-records';

export async function azureBackupSource(supabase: Awaited<ReturnType<typeof createClient>>) {
  const endpoint = process.env.AZURE_SYNC_API_URL;
  if (!endpoint) return null;
  const { data: { session }, error } = await supabase.auth.getSession();
  // The session transports a token; Azure verifies identity and current status.
  if (error || !session?.access_token) throw Error('登录会话已失效，请重新登录。');
  return createAzureRecordClient({ endpoint, token: session.access_token });
}
