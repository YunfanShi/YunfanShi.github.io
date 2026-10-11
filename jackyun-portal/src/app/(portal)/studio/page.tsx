import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PersonalSiteStudio from '@/components/modules/personal-site-studio';

export default async function StudioPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/studio');
  return <PersonalSiteStudio />;
}
