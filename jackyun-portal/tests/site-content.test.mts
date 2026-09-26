import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContent } from '../src/lib/site-content.ts';
const article = { title: 'Article', slug: 'my-article', body: '# Hello', visibility: 'public', published: false };
const link = { name: 'Docs', url: 'https://example.com/path?q=1', enabled: true };
test('articles preserve draft and reader permissions', () => {
 assert.equal(validateContent('article', article).published, false);
 assert.equal(validateContent('article', { ...article, visibility: 'login', published: true }).visibility, 'login');
 for (const patch of [{ slug: '../admin' }, { visibility: 'admin' }, { published: 'true' }, { body: 'a'.repeat(200001) }, { title: '' }]) assert.throws(() => validateContent('article', { ...article, ...patch }));
});
test('redirects accept only HTTP(S) URLs without embedded credentials', () => {
 assert.equal(validateContent('link', link).url, link.url);
 for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'ftp://example.com', 'https://user:pass@example.com', 'bad url']) assert.throws(() => validateContent('link', { ...link, url }));
 assert.throws(() => validateContent('link', { ...link, enabled: 'true' }));
 assert.throws(() => validateContent('other', link));
});
