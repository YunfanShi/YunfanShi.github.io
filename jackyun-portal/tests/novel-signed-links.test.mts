import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { getNovelSignedLinks } from '../src/lib/novel-signed-links.ts';

test('real Storage SDK batches and deduplicates links without requesting file bytes', async () => {
  const requests: Array<{ url: string; method: string; body: { paths: string[]; expiresIn: number } }> = [];
  const supabase = createClient('https://project.test', 'unit-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(input), method: init?.method ?? '', body });
      return new Response(JSON.stringify(body.paths.map((path: string) => ({
        path, error: null, signedURL: `/object/sign/novel-files/${path}?token=test`,
      }))), { headers: { 'content-type': 'application/json' } });
    } },
  });
  const paths = Array.from({ length: 20 }, (_, index) => `catalog/book-${index}/book.txt`);
  const links = await getNovelSignedLinks(supabase.storage.from('novel-files'), [...paths, paths[0]]);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    url: 'https://project.test/storage/v1/object/sign/novel-files', method: 'POST',
    body: { paths, expiresIn: 3600 },
  });
  assert.equal(links.size, 20);
  assert.equal(links.get(paths[0]), `https://project.test/storage/v1/object/sign/novel-files/${paths[0]}?token=test`);
});

test('empty catalog makes no Storage requests', async () => {
  const links = await getNovelSignedLinks({ createSignedUrls: async () => { throw new Error('Unexpected request'); } }, []);
  assert.equal(links.size, 0);
});

test('partial errors and unexpected response paths do not grant download links', async () => {
  const links = await getNovelSignedLinks({ createSignedUrls: async () => ({ error: null, data: [
    { path: 'allowed', signedUrl: 'https://test/allowed', error: null },
    { path: 'missing', signedUrl: 'https://test/missing', error: 'Object not found' },
    { path: 'another-user/private', signedUrl: 'https://test/private', error: null },
    { path: null, signedUrl: 'https://test/unknown', error: null },
  ] }) }, ['allowed', 'missing']);
  assert.deepEqual([...links], [['allowed', 'https://test/allowed']]);
});

test('large catalogs have bounded batches and a failed batch does not hide later successful links', async () => {
  const requests: string[][] = [];
  const paths = Array.from({ length: 205 }, (_, index) => `book-${index}`);
  const links = await getNovelSignedLinks({ createSignedUrls: async (batch) => {
    requests.push(batch);
    if (requests.length === 2) return { data: null, error: new Error('Storage temporarily unavailable') };
    return { error: null, data: batch.map((path) => ({ path, signedUrl: `https://test/${path}`, error: null })) };
  } }, paths);
  assert.deepEqual(requests.map((batch) => batch.length), [100, 100, 5]);
  assert.equal(links.size, 105);
  assert.equal(links.has('book-150'), false);
  assert.equal(links.has('book-204'), true);
});

test('separate users never reuse a previous request’s private links', async () => {
  const signer = { createSignedUrls: async (paths: string[]) => ({ error: null,
    data: paths.map((path) => ({ path, signedUrl: `https://test/${path}`, error: null })),
  }) };
  const first = await getNovelSignedLinks(signer, ['users/first/book.txt']);
  const second = await getNovelSignedLinks(signer, ['users/second/book.txt']);
  assert.equal(first.has('users/second/book.txt'), false);
  assert.equal(second.has('users/first/book.txt'), false);
});
