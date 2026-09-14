import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasPlanAccess } from '@/lib/redemption';

export async function GET(_request: Request, context: RouteContext<'/api/reader/novels/[id]'>) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return NextResponse.json({ error: '小说参数无效。' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Reader service is unavailable' }, { status: 503 });

  const now = new Date().toISOString();
  const [novelResult, entitlementResult, ownershipResult] = await Promise.all([
    admin.from('novel_catalog').select('id, enabled, minimum_plan, chapters_ready, content_revision').eq('id', id).maybeSingle(),
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', user.id).maybeSingle(),
    admin.from('user_novel_entitlements').select('novel_id').eq('user_id', user.id).eq('novel_id', id).maybeSingle(),
  ]);
  if (novelResult.error || !novelResult.data || !novelResult.data.enabled) return NextResponse.json({ error: '小说不存在或未上架。' }, { status: 404 });
  const entitlement = entitlementResult.data;
  const plan = entitlement && (!entitlement.expires_at || entitlement.expires_at > now) ? entitlement.plan_code : 'free';
  if (!hasPlanAccess(plan, novelResult.data.minimum_plan) && !ownershipResult.data) return NextResponse.json({ error: '当前账号没有阅读权限。' }, { status: 403 });
  if (!novelResult.data.chapters_ready) return NextResponse.json({ error: '这本书尚未生成托管章节。' }, { status: 404 });

  const { data, error } = await admin.from('novel_catalog_chapters').select('chapter_index, title, content, character_count').eq('novel_id', id).order('chapter_index');
  if (error) return NextResponse.json({ error: '章节读取失败。' }, { status: 500 });
  return NextResponse.json({
    revision: Number(novelResult.data.content_revision),
    chapters: (data ?? []).map((chapter) => ({ index: chapter.chapter_index, title: chapter.title, content: chapter.content, characterCount: chapter.character_count })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
