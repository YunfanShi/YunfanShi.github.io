import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeRedirectToken, decodeRedirectToken } from '../src/lib/redirect-token.ts';

test('redirect tokens preserve Chinese, emoji and accented target names', () => {
  const info = { url: 'https://example.com/?q=%E4%B8%AD%E6%96%87', name: '中文学习 📚 Café' };
  assert.deepEqual(decodeRedirectToken(encodeRedirectToken(info)), info);
});

test('plain Base64 links and the original XOR links remain usable', () => {
  const info = { url: 'https://example.com', name: 'Study' };
  assert.deepEqual(decodeRedirectToken(btoa(JSON.stringify(info))), info);
  const latin1 = { ...info, name: 'Café' };
  assert.deepEqual(decodeRedirectToken(btoa(JSON.stringify(latin1))), latin1);
  const legacyChinese = { url: 'https://example.com', name: '中文学习' };
  const key = 'JackWarden2024XOR';
  const json = JSON.stringify(legacyChinese);
  const xor = [...json].map((character, index) => String.fromCharCode(character.charCodeAt(0) ^ key.charCodeAt(index % key.length))).join('');
  const legacy = Buffer.from(xor, 'utf8').toString('base64');
  assert.deepEqual(decodeRedirectToken(legacy), legacyChinese);
});

test('redirect decoding rejects malformed data and unsafe protocols', () => {
  for (const value of [null, {}, { url: 'javascript:alert(1)', name: 'Bad' }, { url: 'https://example.com', name: 1 }]) {
    assert.throws(() => decodeRedirectToken(btoa(JSON.stringify(value))));
  }
  assert.throws(() => decodeRedirectToken('%%%'));
});
