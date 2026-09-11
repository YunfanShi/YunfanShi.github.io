import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminIdentity } from '@/lib/admin-auth';
import { isPlanCode } from '@/lib/redemption';

const allowedNovelExtensions = new Set(['txt', 'text', 'md', 'markdown', 'html', 'htm', 'epub']);
const allowedCoverTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!isAdminIdentity(user, profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Storage service is unavailable' }, { status: 503 });

  const form = await request.formData();
  const file = form.get('file');
  const cover = form.get('cover');
  const title = String(form.get('title') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const language = String(form.get('language') ?? 'zh');
  const minimumPlan = String(form.get('minimumPlan') ?? 'free');
  if (!(file instanceof File) || !title || title.length > 160 || author.length > 120 || description.length > 1000 || !['zh', 'en'].includes(language) || !isPlanCode(minimumPlan)) return NextResponse.json({ error: '请检查书名、文件和访问等级。' }, { status: 400 });
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!allowedNovelExtensions.has(extension)) return NextResponse.json({ error: '仅支持 TXT、Markdown、HTML 和 EPUB。' }, { status: 415 });
  if (file.size < 1 || file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '小说文件须小于 50 MB。' }, { status: 413 });
  if (cover instanceof File && cover.size && (!allowedCoverTypes.has(cover.type) || cover.size > 5 * 1024 * 1024)) return NextResponse.json({ error: '封面仅支持 5 MB 内的 JPG、PNG 或 WebP。' }, { status: 415 });

  const novelId = randomUUID();
  const storagePath = `catalog/${novelId}/book.${extension}`;
  const upload = await admin.storage.from('novel-files').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });
  let coverPath: string | null = null;
  if (cover instanceof File && cover.size) {
    const coverExtension = cover.type === 'image/png' ? 'png' : cover.type === 'image/webp' ? 'webp' : 'jpg';
    coverPath = `catalog/${novelId}/cover.${coverExtension}`;
    const coverUpload = await admin.storage.from('novel-files').upload(coverPath, cover, { contentType: cover.type, upsert: false });
    if (coverUpload.error) { await admin.storage.from('novel-files').remove([storagePath]); return NextResponse.json({ error: coverUpload.error.message }, { status: 500 }); }
  }
  const { error } = await admin.from('novel_catalog').insert({ id: novelId, title, author, description, language, minimum_plan: minimumPlan, storage_path: storagePath, original_file_name: file.name.slice(0, 240), file_size: file.size, cover_path: coverPath, created_by: user.id });
  if (error) { await admin.storage.from('novel-files').remove([storagePath, ...(coverPath ? [coverPath] : [])]); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true, id: novelId });
}
