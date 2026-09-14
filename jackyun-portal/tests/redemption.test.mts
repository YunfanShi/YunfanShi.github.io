import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatRedemptionCode, hasPlanAccess, isValidCustomCode, normalizeRedemptionCode, parseShanghaiDateTime } from '../src/lib/redemption.ts';

test('redemption codes normalize and format without changing their value', () => {
  assert.equal(normalizeRedemptionCode(' abcd-1234 ef90 '), 'ABCD1234EF90');
  assert.equal(formatRedemptionCode('abcd1234ef90'), 'ABCD-1234-EF90');
  assert.equal(isValidCustomCode('BOOK-2026'), true);
  assert.equal(isValidCustomCode('短码'), false);
});

test('plan access follows Free < Plus < Pro < Ultra', () => {
  assert.equal(hasPlanAccess('free', 'plus'), false);
  assert.equal(hasPlanAccess('pro', 'plus'), true);
  assert.equal(hasPlanAccess('ultra', 'ultra'), true);
});

test('admin datetime-local values are interpreted as Asia/Shanghai', () => {
  assert.equal(parseShanghaiDateTime('2026-09-11T20:30')?.toISOString(), '2026-09-11T12:30:00.000Z');
  assert.equal(parseShanghaiDateTime('not-a-date'), null);
  assert.equal(parseShanghaiDateTime(''), null);
});

test('redemption migration keeps codes private and redemption atomic', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260911150307_reader_redemptions_and_feature_access.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE public\.redemption_codes ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE[\s\S]*public\.redemption_codes/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.redeem_reward_code[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /PERFORM pg_advisory_xact_lock/);
  assert.match(sql, /UNIQUE \(code_id, user_id\)/);
});

test('multi-book redemption uses a secured join table and grants every selected novel atomically', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260912031048_multi_novel_redemption_codes.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE public\.redemption_code_novels/u);
  assert.match(sql, /PRIMARY KEY \(code_id, novel_id\)/u);
  assert.match(sql, /ALTER TABLE public\.redemption_code_novels ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /REVOKE ALL ON TABLE public\.redemption_code_novels FROM anon, authenticated/u);
  assert.match(sql, /INSERT INTO public\.user_novel_entitlements[\s\S]*FROM public\.redemption_code_novels/u);
  assert.match(sql, /jsonb_agg\([\s\S]*ORDER BY r\.sort_order/u);
});
