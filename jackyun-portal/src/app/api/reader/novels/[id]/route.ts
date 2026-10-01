import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasPlanAccess } from '@/lib/redemption';
import { novelToTxt, novelTxtFileName } from '@/lib/novel-export';
import { parseNovelFile } from '@/lib/novel-import';
import { splitNovelIntoChapters } from '@/lib/novel-reader';

export async function GET(request: Request, context: RouteContext<'/api/reader/novels/[id]'>) {
  const downloadTxt = new URL(request.url).searchParams.get('download') === 'txt';
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return NextResponse.json({ error: '小说参数无效。' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Reader service is unavailable' }, { status: 503 });

  const now = new Date().toISOString();
  const [novelResult, entitlementResult, ownershipResult] = await Promise.all([
    admin.from('novel_catalog').select('id, title, author, enabled, minimum_plan, chapters_ready, content_revision, storage_path, original_file_name').eq('id', id).maybeSingle(),
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', user.id).maybeSingle(),
    admin.from('user_novel_entitlements').select('novel_id').eq('user_id', user.id).eq('novel_id', id).maybeSingle(),
  ]);
  if (novelResult.error || !novelResult.data || !novelResult.data.enabled) return NextResponse.json({ error: '小说不存在或未上架。' }, { status: 404 });
  const entitlement = entitlementResult.data;
  const plan = entitlement && (!entitlement.expires_at || entitlement.expires_at > now) ? entitlement.plan_code : 'free';
  if (!hasPlanAccess(plan, novelResult.data.minimum_plan) && !ownershipResult.data) return NextResponse.json({ error: '当前账号没有阅读权限。' }, { status: 403 });
  if (downloadTxt && !novelResult.data.chapters_ready) {
    const { data: file, error } = await admin.storage.from('novel-files').download(novelResult.data.storage_path);
    if (error || !file) return NextResponse.json({ error: '图书正文读取失败。' }, { status: 500 });
    try {
      const parsed = await parseNovelFile(new File([file], novelResult.data.original_file_name), 'auto');
      return txtResponse(novelResult.data, parsed.chapters ?? splitNovelIntoChapters(parsed.text));
    } catch {
      return NextResponse.json({ error: '图书正文无法转换为 TXT。' }, { status: 422 });
    }
  }
  if (!novelResult.data.chapters_ready) return NextResponse.json({ error: '这本书尚未生成托管章节。' }, { status: 404 });

  const query = admin.from('novel_catalog_chapters').select('chapter_index, title, content, character_count', downloadTxt ? { count: 'exact' } : undefined).eq('novel_id', id).order('chapter_index');
  const { data, error, count } = await (downloadTxt ? query.range(0, 499) : query);
  if (error) return NextResponse.json({ error: '章节读取失败。' }, { status: 500 });
  if (downloadTxt) {
    if (!data?.length || !data.some((chapter) => chapter.content.trim())) return NextResponse.json({ error: '没有可下载的正文。' }, { status: 404 });
    if (count === null) return NextResponse.json({ error: '无法确认完整章节，请稍后重试。' }, { status: 500 });
    while (data.length < count) {
      const batch = await admin.from('novel_catalog_chapters').select('chapter_index, title, content, character_count').eq('novel_id', id).order('chapter_index').range(data.length, data.length + 499);
      if (batch.error || !batch.data?.length) return NextResponse.json({ error: '章节下载不完整，请稍后重试。' }, { status: 500 });
      data.push(...batch.data);
    }
    return txtResponse(novelResult.data, data.map((chapter) => ({ index: chapter.chapter_index, title: chapter.title, content: chapter.content, characterCount: chapter.character_count })));
  }
  return NextResponse.json({
    revision: Number(novelResult.data.content_revision),
    chapters: (data ?? []).map((chapter) => ({ index: chapter.chapter_index, title: chapter.title, content: chapter.content, characterCount: chapter.character_count })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

function txtResponse(book: { title: string; author: string }, chapters: Parameters<typeof novelToTxt>[1]) {
  const filename = encodeURIComponent(novelTxtFileName(book.title)).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Blob([novelToTxt(book, chapters)]).stream(), { headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename="book.txt"; filename*=UTF-8''${filename}`,
    'Cache-Control': 'private, no-store',
  } });
}
