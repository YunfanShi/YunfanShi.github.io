import assert from 'node:assert/strict';
import test from 'node:test';
import { cueGameProgress, cueStudyPreferences } from '../src/lib/learning/cue-game.ts';
import { shuffleCueIds, reorderCueStudy, type CueReview } from '../src/lib/learning/schedule-control.ts';
const now = new Date(2026, 9, 2, 12);
function review(cueId: string, status: CueReview['status'] = 'stable', at = now): CueReview {
  return { id: `${cueId}-${status}-${at.getTime()}`, cueId, status, reviewedAt: at.toISOString(), nextReviewDate: '2026-10-03' };
}
test('game is opt-in and new Cue sessions default to shuffle, including legacy preferences', () => {
  for (const value of [undefined, null, {}, [], 'invalid', { cueGameEnabled: 'true', cueShuffle: 'false' }])
    assert.deepEqual(cueStudyPreferences(value), { cueGameEnabled: false, cueShuffle: true });
  assert.deepEqual(cueStudyPreferences({ cueGameEnabled: true, cueShuffle: false }), { cueGameEnabled: true, cueShuffle: false });
});
test('rating edits, duplicate sync records and repeated sessions do not farm XP', () => {
  const reviews = [review('a'), review('a', 'partial'), review('a', 'unclear'), review('b', 'partial'), review('c', 'unclear')];
  assert.equal(cueGameProgress(reviews, now).xp, 30);
  assert.equal(cueGameProgress(reviews, now).todayCount, 3);
  assert.equal(cueGameProgress([...reviews, ...reviews], now).xp, 30);
  assert.equal(cueGameProgress([review('a', 'stable')], now).xp, cueGameProgress([review('a', 'unclear')], now).xp);
});
test('calendar days give new rewards; malformed and future dates are excluded', () => {
  const yesterday = new Date(2026, 9, 1, 23, 59);
  const future = new Date(2026, 9, 3);
  const reviews = [review('a', 'stable', yesterday), review('a'), review('b', 'stable', future), { ...review('c'), reviewedAt: 'broken' }];
  const result = cueGameProgress(reviews, now);
  assert.equal(result.count, 2);
  assert.equal(result.todayCount, 1);
  assert.equal(result.xp, 20);
});
test('defeat, level boundary and permanent cosmetics reconstruct from review history', () => {
  const reviews = Array.from({ length: 90 }, (_, i) => review(`cue-${i}`));
  assert.equal(cueGameProgress([], now).level, 1);
  assert.equal(cueGameProgress(reviews.slice(0, 5), now).defeats, 1);
  assert.equal(cueGameProgress(reviews.slice(0, 5), now).enemyHits, 0);
  assert.equal(cueGameProgress(reviews.slice(0, 10), now).level, 2);
  assert.equal(cueGameProgress(reviews.slice(0, 10), now).levelXp, 0);
  const progress = cueGameProgress(reviews, now);
  assert.equal(progress.level, 10);
  assert.equal(progress.unlocked.length, 4);
  assert.equal(progress.nextUnlock, undefined);
  assert.deepEqual(cueGameProgress(JSON.parse(JSON.stringify(reviews)), now), progress);
});
test('default shuffle leaves source order intact; switching off restores original remaining order', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const shuffled = shuffleCueIds(ids, () => .4);
  assert.notDeepEqual(shuffled, ids);
  assert.deepEqual(new Set(shuffled), new Set(ids));
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  const ordered = reorderCueStudy(ids, { a: 'partial' }, false, 'c');
  assert.deepEqual(ordered.cueIds, ['b', 'c', 'd', 'a']);
  assert.deepEqual(ordered.hiddenCueIds, ['a']);
  assert.equal(ordered.index, 1);
  assert.equal(ordered.retainedCurrent, true);
});

test('battle UI renders real history, accessible bars and reduced-motion control', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const ts = (await import('typescript')).default;
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../src/components/modules/schedule/cue-game-panel.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const compiled = { exports: {} as { default: React.ComponentType<Record<string, unknown>> } };
  const game = await import('../src/lib/learning/cue-game.ts');
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  runInNewContext(outputText, { module: compiled, exports: compiled.exports, require: (name: string) => name === '@/lib/learning/cue-game' ? game : name.endsWith('.css') ? { __esModule: true, default: styles } : require(name) });
  const at = new Date();
  const reviews = Array.from({ length: 23 }, (_, i) => review(`render-${i}`, 'partial', at));
  const html = renderToStaticMarkup(React.createElement(compiled.exports.default, { reviews, animations: false }));
  assert.match(html, /data-motion="false"/);
  assert.match(html, /紫晶巡航舰/);
  assert.match(html, /aria-label="等级经验"[^>]*aria-valuenow="30"/);
  assert.match(html, /aria-label="敌人生命"[^>]*aria-valuenow="2"/);
  assert.match(html, /Lv\.5 解锁 黄金远征舰/);
  assert.doesNotMatch(html, /LEVEL UP/);
});
