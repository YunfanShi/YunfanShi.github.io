import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminIdentity } from '@/lib/admin-auth';

const allowedNovelExtensions = new Set(['txt', 'text', 'md', 'markdown', 'html', 'htm', 'epub']);
const allowedCoverTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const preparedPath = /^catalog\/[0-9a-f-]{36}\/(?:book\.(?:txt|text|md|markdown|html|htm|epub)|cover\.(?:jpg|png|webp))$/iu;

type FileDescriptor = { name?: unknown; size?: unknown; type?: unknown };

async function authenticatedAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!isAdminIdentity(user, profile?.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: 'Storage service is unavailable' }, { status: 503 }) };
  return { admin };
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  const auth = await authenticatedAdmin();
  if ('error' in auth) return auth.error;
  let body: { file?: FileDescriptor; cover?: FileDescriptor };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: '上传参数无效。' }, { status: 400 }); }
  const fileName = typeof body.file?.name === 'string' ? body.file.name : '';
  const fileSize = Number(body.file?.size);
  const fileType = typeof body.file?.type === 'string' ? body.file.type : 'application/octet-stream';
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!allowedNovelExtensions.has(extension) || !Number.isFinite(fileSize) || fileSize < 1 || fileSize > 50 * 1024 * 1024) return NextResponse.json({ error: '小说格式不受支持或超过 50 MB。' }, { status: 400 });
  const coverName = typeof body.cover?.name === 'string' ? body.cover.name : '';
  const coverSize = Number(body.cover?.size ?? 0);
  const coverType = typeof body.cover?.type === 'string' ? body.cover.type : '';
  if (body.cover && (!allowedCoverTypes.has(coverType) || !Number.isFinite(coverSize) || coverSize < 1 || coverSize > 5 * 1024 * 1024)) return NextResponse.json({ error: '封面须为 5 MB 内的 JPG、PNG 或 WebP。' }, { status: 400 });

  const novelId = randomUUID();
  const storagePath = `catalog/${novelId}/book.${extension}`;
  const signedFile = await auth.admin.storage.from('novel-files').createSignedUploadUrl(storagePath);
  if (signedFile.error || !signedFile.data) return NextResponse.json({ error: signedFile.error?.message ?? '无法创建上传凭证。' }, { status: 503 });
  let cover: { path: string; token: string; name: string; type: string } | null = null;
  if (body.cover) {
    const coverExtension = coverType === 'image/png' ? 'png' : coverType === 'image/webp' ? 'webp' : 'jpg';
    const coverPath = `catalog/${novelId}/cover.${coverExtension}`;
    const signedCover = await auth.admin.storage.from('novel-files').createSignedUploadUrl(coverPath);
    if (signedCover.error || !signedCover.data) return NextResponse.json({ error: signedCover.error?.message ?? '无法创建封面上传凭证。' }, { status: 503 });
    cover = { path: coverPath, token: signedCover.data.token, name: coverName, type: coverType };
  }
  return NextResponse.json({ novelId, file: { path: storagePath, token: signedFile.data.token, name: fileName, type: fileType }, cover });
}

export async function DELETE(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  const auth = await authenticatedAdmin();
  if ('error' in auth) return auth.error;
  let paths: unknown;
  try { paths = (await request.json() as { paths?: unknown }).paths; } catch { return NextResponse.json({ error: '清理参数无效。' }, { status: 400 }); }
  const safePaths = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string' && preparedPath.test(path)).slice(0, 2) : [];
  if (!safePaths.length) return NextResponse.json({ ok: true });
  const { error } = await auth.admin.storage.from('novel-files').remove(safePaths);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
