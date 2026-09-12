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
  const legacyFile = form.get('file');
  const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length && legacyFile instanceof File && legacyFile.size > 0) files.push(legacyFile);
  const legacyCover = form.get('cover');
  const covers = form.getAll('covers').filter((value): value is File => value instanceof File && value.size > 0);
  if (!covers.length && legacyCover instanceof File && legacyCover.size > 0) covers.push(legacyCover);
  const customTitle = String(form.get('title') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const category = String(form.get('category') ?? '未分类').trim() || '未分类';
  const tags = [...new Set(String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  const language = String(form.get('language') ?? 'zh');
  const minimumPlan = String(form.get('minimumPlan') ?? 'free');
  if (files.length < 1 || files.length > 20 || covers.length > files.length || customTitle.length > 160 || (files.length > 1 && customTitle.length > 0) || author.length > 120 || description.length > 1000 || category.length > 40 || tags.length > 20 || !['zh', 'en'].includes(language) || !isPlanCode(minimumPlan)) return NextResponse.json({ error: '请选择 1–20 本小说；批量时书名留空，封面数量不能超过小说数量。' }, { status: 400 });

  const failures: string[] = [];
  const uploadedIds: string[] = [];
  for (const [index, file] of files.entries()) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedNovelExtensions.has(extension)) { failures.push(`${file.name}：格式不受支持`); continue; }
    if (file.size < 1 || file.size > 50 * 1024 * 1024) { failures.push(`${file.name}：文件须小于 50 MB`); continue; }
    const cover = covers[index];
    if (cover && (!allowedCoverTypes.has(cover.type) || cover.size > 5 * 1024 * 1024)) { failures.push(`${file.name}：封面须为 5 MB 内的 JPG、PNG 或 WebP`); continue; }

    const novelId = randomUUID();
    const storagePath = `catalog/${novelId}/book.${extension}`;
    const title = (files.length === 1 && customTitle ? customTitle : file.name.replace(/\.[^.]+$/u, '').trim() || '未命名小说').slice(0, 160);
    const upload = await admin.storage.from('novel-files').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upload.error) { failures.push(`${file.name}：${upload.error.message}`); continue; }

    let coverPath: string | null = null;
    if (cover) {
      const coverExtension = cover.type === 'image/png' ? 'png' : cover.type === 'image/webp' ? 'webp' : 'jpg';
      coverPath = `catalog/${novelId}/cover.${coverExtension}`;
      const coverUpload = await admin.storage.from('novel-files').upload(coverPath, cover, { contentType: cover.type, upsert: false });
      if (coverUpload.error) { await admin.storage.from('novel-files').remove([storagePath]); failures.push(`${file.name}：${coverUpload.error.message}`); continue; }
    }

    const { error } = await admin.from('novel_catalog').insert({ id: novelId, title, author, description, category, tags, language, minimum_plan: minimumPlan, storage_path: storagePath, original_file_name: file.name.slice(0, 240), file_size: file.size, cover_path: coverPath, created_by: user.id });
    if (error) { await admin.storage.from('novel-files').remove([storagePath, ...(coverPath ? [coverPath] : [])]); failures.push(`${file.name}：${error.message}`); continue; }
    uploadedIds.push(novelId);
  }

  if (!uploadedIds.length) return NextResponse.json({ error: failures.join('；') || '上传失败。' }, { status: 400 });
  return NextResponse.json({ ok: failures.length === 0, uploaded: uploadedIds.length, ids: uploadedIds, failures }, { status: failures.length ? 207 : 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!isAdminIdentity(user, profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Storage service is unavailable' }, { status: 503 });
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return NextResponse.json({ error: '小说参数无效。' }, { status: 400 });
  const { data: novel, error: readError } = await admin.from('novel_catalog').select('*').eq('id', id).maybeSingle();
  if (readError || !novel) return NextResponse.json({ error: readError?.message ?? '小说不存在。' }, { status: 404 });
  const title = String(form.get('title') ?? novel.title).trim();
  const author = String(form.get('author') ?? novel.author).trim();
  const description = String(form.get('description') ?? novel.description).trim();
  const category = String(form.get('category') ?? novel.category ?? '未分类').trim() || '未分类';
  const tags = [...new Set(String(form.get('tags') ?? (novel.tags ?? []).join(',')).split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  if (!title || title.length > 160 || author.length > 120 || description.length > 1000 || category.length > 40) return NextResponse.json({ error: '书名、作者、简介或分类长度无效。' }, { status: 400 });
  const file = form.get('file');
  const cover = form.get('cover');
  const updates: Record<string, unknown> = { title, author, description, category, tags, updated_at: new Date().toISOString() };
  const removePaths: string[] = [];
  if (file instanceof File && file.size > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedNovelExtensions.has(extension) || file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '正文格式或大小无效。' }, { status: 400 });
    const path = `catalog/${id}/book.${extension}`;
    const upload = await admin.storage.from('novel-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 });
    if (novel.storage_path !== path) removePaths.push(novel.storage_path);
    Object.assign(updates, { storage_path: path, original_file_name: file.name.slice(0, 240), file_size: file.size });
  }
  if (cover instanceof File && cover.size > 0) {
    if (!allowedCoverTypes.has(cover.type) || cover.size > 5 * 1024 * 1024) return NextResponse.json({ error: '封面格式或大小无效。' }, { status: 400 });
    const extension = cover.type === 'image/png' ? 'png' : cover.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `catalog/${id}/cover.${extension}`;
    const upload = await admin.storage.from('novel-files').upload(path, cover, { contentType: cover.type, upsert: true });
    if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 });
    if (novel.cover_path && novel.cover_path !== path) removePaths.push(novel.cover_path);
    updates.cover_path = path;
  }
  const { error } = await admin.from('novel_catalog').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (removePaths.length) await admin.storage.from('novel-files').remove(removePaths);
  return NextResponse.json({ ok: true });
}
