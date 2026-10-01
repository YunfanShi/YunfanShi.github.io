import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextResponse } from 'next/server.js';
import ts from 'typescript';
import test from 'node:test';
import { novelToTxt, novelTxtFileName } from '../src/lib/novel-export.ts';
import { parseNovelFile } from '../src/lib/novel-import.ts';
import { splitNovelIntoChapters } from '../src/lib/novel-reader.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const chapter = { index: 0, title: '第一章', content: '第一章\n中文正文 😀', characterCount: 12 };

test('TXT preserves Unicode, chapter order and body without repeated headings', () => {
  const text = novelToTxt({ title: '书名', author: '作者' }, [{ ...chapter, index: 1, title: '第二章', content: 'Hello\r\nworld' }, chapter]);
  assert.equal(text, '\uFEFF书名\r\n\r\n作者：作者\r\n\r\n第一章\r\n中文正文 😀\r\n\r\n第二章\r\n\r\nHello\r\nworld\r\n');
  assert.equal(chapter.index, 0);
  assert.throws(() => novelToTxt({ title: '', author: '' }, []), /没有可下载/);
  assert.equal(novelTxtFileName('书名:/\\?*\r\n'), '书名_______.txt');
  assert.equal(novelTxtFileName(' ... '), '图书.txt');
});

type Options = { signedIn?: boolean; owned?: boolean; ownershipError?: boolean; planAccess?: boolean; chaptersReady?: boolean; total?: number; batchError?: boolean };
function route(options: Options = {}) {
  const source = readFileSync(new URL('../src/app/api/reader/novels/[id]/route.ts', import.meta.url), 'utf8');
  const queries: string[] = [];
  const filters: string[] = [];
  const total = options.total ?? 1;
  const admin = {
    from(table: string) {
      queries.push(table);
      const query = {
        select: () => query, eq: (key: string, value: string) => { filters.push(`${table}:${key}:${value}`); return query; }, order: () => query,
        maybeSingle: async () => table === 'novel_catalog' ? { data: { id, title: '书名', author: '作者', enabled: true, minimum_plan: 'free', chapters_ready: options.chaptersReady !== false, content_revision: 1, storage_path: 'book.txt', original_file_name: 'book.txt' }, error: null } : table === 'user_novel_entitlements' ? { data: options.owned === false ? null : { novel_id: id }, error: options.ownershipError ? new Error('database failure') : null } : { data: null, error: null },
        range: async (start: number, end: number) => ({ data: Array.from({ length: Math.min(end + 1, total) - start }, (_, offset) => ({ chapter_index: start + offset, title: `第${start + offset}章`, content: `正文${start + offset}`, character_count: 6 })), error: options.batchError && start > 0 ? new Error('failed') : null, count: total }),
        then: (resolve: (value: unknown) => void) => resolve({ data: [{ chapter_index: 0, title: chapter.title, content: chapter.content, character_count: 12 }], error: null }),
      };
      return query;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(['第一章\n中文正文']), error: null }) }) },
  };
  const routeModule = { exports: {} as { GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> } };
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: 'user-1' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/redemption': { hasPlanAccess: () => options.planAccess !== false },
    '@/lib/novel-export': { novelToTxt, novelTxtFileName },
    '@/lib/novel-import': { parseNovelFile },
    '@/lib/novel-reader': { splitNovelIntoChapters },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: routeModule, exports: routeModule.exports, require: (name: string) => { assert.ok(name in imports); return imports[name]; }, URL, Response, Blob, File, Date });
  return { get: (download = true) => routeModule.exports.GET(new Request(`https://example.com/api/reader/novels/${id}${download ? '?download=txt' : ''}`), { params: Promise.resolve({ id }) }), queries, filters };
}

test('TXT downloads share reading permissions for members and owned books', async () => {
  const anonymous = route({ signedIn: false });
  assert.equal((await anonymous.get()).status, 401);
  assert.equal(anonymous.queries.length, 0);
  const unowned = route({ owned: false, planAccess: false });
  assert.equal((await unowned.get()).status, 403);
  assert.ok(!unowned.queries.includes('novel_catalog_chapters'));
  assert.ok(unowned.filters.includes('user_novel_entitlements:user_id:user-1'));
  assert.ok(unowned.filters.includes(`user_novel_entitlements:novel_id:${id}`));
  assert.equal((await unowned.get(false)).status, 403);
  assert.equal((await route({ owned: false, planAccess: true }).get()).status, 200);
  assert.equal((await route({ owned: true, planAccess: false }).get()).status, 200);
  assert.equal((await route({ owned: false, ownershipError: true, planAccess: false }).get()).status, 403);
});

test('owned-book download streams UTF-8 TXT and retrieves all pages of chapters', async () => {
  const response = await route({ total: 1001 }).get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition')!, /attachment;.*filename\*=UTF-8''%E4%B9%A6%E5%90%8D.txt/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-type')!, /text\/plain; charset=utf-8/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /正文1000/);
  assert.equal((text.match(/正文\d+/g) ?? []).length, 1001);
  assert.equal((await route({ total: 501, batchError: true }).get()).status, 500);
});

test('legacy owned files without hosted chapters are converted to TXT', async () => {
  const response = await route({ chaptersReady: false }).get();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /中文正文/);
});
