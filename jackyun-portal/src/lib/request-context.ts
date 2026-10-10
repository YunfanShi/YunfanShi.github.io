import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/** Request-local only: never retain an identity or permissions across requests. */
export const getRequestIdentity = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
});

export const getRequestProfile = cache(async () => {
  const { supabase, user } = await getRequestIdentity();
  const { data, error } = await supabase.from('profiles')
    .select('role, account_status, deleted_at').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Authorization unavailable');
  return data;
});
