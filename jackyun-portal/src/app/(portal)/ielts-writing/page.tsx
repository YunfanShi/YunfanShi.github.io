import type { Metadata } from 'next';
import WritingWorkbench from '@/components/modules/ielts/writing-workbench';
import { isAdminIdentity } from '@/lib/admin-auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'IELTS Writing Lab · JackYun',
  description: 'Diagnose, self-revise, upgrade, and transfer IELTS Writing skills with the Correction → Transfer method.',
};

export default async function IeltsWritingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  return <WritingWorkbench personalIeltsPlan={Boolean(user && isAdminIdentity(user, profile?.role))} />;
}
