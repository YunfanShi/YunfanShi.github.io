import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLlmBaseUrl } from '../src/lib/llm-endpoint.ts';

test('accepts built-in LLM providers and normalizes trailing slashes', () => {
  assert.equal(normalizeLlmBaseUrl('https://api.deepseek.com/v1///'), 'https://api.deepseek.com/v1');
  assert.equal(normalizeLlmBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai'), 'https://generativelanguage.googleapis.com/v1beta/openai');
});

test('rejects unsafe or unapproved endpoints', () => {
  assert.equal(normalizeLlmBaseUrl('http://api.deepseek.com/v1'), undefined);
  assert.equal(normalizeLlmBaseUrl('https://127.0.0.1/v1'), undefined);
  assert.equal(normalizeLlmBaseUrl('https://user:pass@api.deepseek.com/v1'), undefined);
  assert.equal(normalizeLlmBaseUrl('https://api.deepseek.com:8443/v1'), undefined);
  assert.equal(normalizeLlmBaseUrl('https://api.deepseek.com/v1?redirect=https://internal'), undefined);
});

test('allows an operator-configured custom provider by exact hostname', () => {
  assert.equal(normalizeLlmBaseUrl('https://llm.example.com/v1', 'llm.example.com'), 'https://llm.example.com/v1');
  assert.equal(normalizeLlmBaseUrl('https://evil.llm.example.com/v1', 'llm.example.com'), undefined);
});
