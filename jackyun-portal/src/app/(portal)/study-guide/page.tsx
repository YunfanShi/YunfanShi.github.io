import LegacyFrame from '@/components/modules/legacy-frame';
import { isAdminIdentity } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';

export default async function StudyGuidePage({ searchParams }: { searchParams: Promise<{ tab?: string; subTab?: string }> }) {
  const [params, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  return <LegacyFrame src="/StudyGuide.html" title="StudyGuide" runtimeContext={{
    tab: params.tab ?? null,
    subTab: params.subTab ?? null,
    personalIeltsPlan: Boolean(user && isAdminIdentity(user, profile?.role)),
  }} />;
}
