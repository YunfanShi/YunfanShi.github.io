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

test('desktop background renders real star history, accessible experience and reduced-motion control', async () => {
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
  const backdropModule = { exports: {} as { default: React.ComponentType<Record<string, unknown>> } };
  const backdropSource = readFileSync(new URL('../src/components/modules/schedule/cue-universe-backdrop.tsx', import.meta.url), 'utf8');
  const backdropOutput = ts.transpileModule(backdropSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

  const shop = await import('../src/lib/learning/cue-shop.ts');
  const schedule = await import('../src/lib/learning/schedule-control.ts');
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  runInNewContext(backdropOutput, { module: backdropModule, exports: backdropModule.exports, require: (name: string) => name === '@/lib/learning/cue-game' ? game : name.endsWith('.css') ? { __esModule: true, default: styles } : require(name) });
  const jsx = require('react/jsx-runtime');
  const runtime = { ...jsx, jsxs: (type: unknown, props: { children?: React.ReactNode[] }, key: unknown) => {
    const keys = (Array.isArray(props.children) ? props.children : []).filter(React.isValidElement).map((child) => child.key).filter((key) => key !== null);
    assert.equal(new Set(keys).size, keys.length, 'animated counters, sky and celebrations must have distinct sibling identities');
    return jsx.jsxs(type, props, key);
  } };
  const react = { ...require('react'), useState: (initial: unknown) => React.useState(initial === null ? { id: 23, cueId: 'render-22', status: 'partial', gained: 10, milestone: true, situation: 'constellation', variant: 1, duration: 1600 } : initial) };
  runInNewContext(outputText, { module: compiled, exports: compiled.exports, require: (name: string) => name === './cue-star-shop' || name === './cue-sky-viewer' ? { __esModule: true, default: () => null } : name === '@/lib/learning/cue-shop' ? shop : name === './cue-practice-burst' ? { __esModule: true, default: () => null } : name === './cue-universe-backdrop' ? { __esModule: true, default: backdropModule.exports.default } : name === 'react' ? react : name === 'react/jsx-runtime' ? runtime : name === '@/lib/learning/cue-game' ? game : name === '@/lib/learning/schedule-control' ? schedule : name.endsWith('.css') ? { __esModule: true, default: styles } : require(name) });
  const at = new Date();
  const reviews = Array.from({ length: 23 }, (_, i) => review(`render-${i}`, 'partial', at));
  const html = renderToStaticMarkup(React.createElement(compiled.exports.default, { reviews, animations: false }));
  assert.match(html, /data-motion="false"/);
  assert.match(html, /data-cue-universe-background/);
  assert.match(html, /data-stars="23"/);
  assert.match(html, /<canvas[^>]*aria-hidden="true"/);
  assert.match(html, /紫晶巡航舰/);
  assert.match(html, /aria-label="等级经验"[^>]*aria-valuenow="30"/);
  assert.match(html, /已点亮 23 颗星的学习星空/);
  assert.doesNotMatch(html, /敌人生命/);
  assert.match(html, /星空收藏/);
  assert.doesNotMatch(html, /LEVEL UP/);
  assert.match(html, /data-situation="constellation"/);
  assert.match(html, /data-variant="1"/);
  assert.match(html, /跳过动画/);
  const account=shop.reconcileCueGameAccount(undefined,reviews);
  account.earnings.push({id:'session-bonus',at:at.toISOString(),stars:3,xp:0,label:'连对',sessionKey:'current',extra:true});
  const sessionHtml=renderToStaticMarkup(React.createElement(compiled.exports.default,{reviews,account,sessionCount:7,sessionKey:'current',animations:false}));
  assert.match(sessionHtml,/<h2>本次星空<\/h2>/);
  assert.match(sessionHtml,/<strong>7<\/strong><span>颗星已点亮/);
  assert.match(sessionHtml,/EXTRA <strong>\+3<\/strong>/);
  assert.doesNotMatch(sessionHtml,/今天认真检索|累计 23 次/);

});

test('star album keeps all ratings, deduplicates daily stars and survives Cue deletion and sync', async () => {
  const { cueStarAlbum, cueConstellations, cueStarWeek, cueStarPosition } = await import('../src/lib/learning/cue-game.ts');
  const { createEmptyScheduleState, recordCueStudyAssessment } = await import('../src/lib/learning/schedule-control.ts');
  const cues = [{ id: 'a', subjectId: 'physics', subjectName: 'Physics', unit: 'U1', subsection: '', prompt: 'Recall', type: 'definition' as const, markingPoints: [], intervalDays: 0, easeFactor: 2.5, streak: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() }];
  let state = recordCueStudyAssessment({ ...createEmptyScheduleState(), cues }, { cueId: 'a', status: 'partial' }, now, 'session');
  state = recordCueStudyAssessment(state, { cueId: 'a', status: 'unclear' }, now, 'session');
  assert.equal(state.cueReviews.length, 1);
  assert.equal(state.cueReviews[0].subjectName, 'Physics');
  const stored = JSON.parse(JSON.stringify(state.cueReviews));
  const album = cueStarAlbum([...stored, ...stored], [], [], now);
  assert.equal(album.length, 1);
  assert.equal(album[0].status, 'unclear');
  assert.equal(album[0].subjectId, 'physics');
  assert.equal(album[0].subjectName, 'Physics');
  assert.equal(cueStarWeek('2026-10-04'), '2026-09-28');
  assert.equal(cueStarWeek('2026-10-05'), '2026-10-05');
  const all = cueStarAlbum(Array.from({length: 10}, (_, i) => ({...review(`star-${i}`, i % 2 ? 'partial' : 'stable'), subjectId: i % 2 ? 'physics' : 'cs', subjectName: i % 2 ? 'Physics' : 'CS'})), [], [], now);
  assert.equal(cueConstellations(all).length, 2);
  assert.equal(all.filter(x=>x.subjectId==='physics').length, 5);
  assert.deepEqual(cueStarPosition(album[0].id), cueStarPosition(album[0].id));
  assert.ok(all.every(star => { const p=cueStarPosition(star.id); return p.x>=12 && p.x<=187 && p.y>=12 && p.y<=137; }));
});

test('legacy review attribution can use saved learning records even after Cue removal', async () => {
  const { cueStarAlbum } = await import('../src/lib/learning/cue-game.ts');
  const record = { completedAt: now.toISOString(), cues: [{cueId:'a',subjectName:'History'}] } as import('../src/lib/learning/schedule-control.ts').LearningRecord;
  assert.equal(cueStarAlbum([review('a')],[],[record],now)[0].subjectName,'History');
  assert.equal(cueStarAlbum([review('unknown')],[],[],now)[0].subjectName,'未分类');
});

test('each learning situation has three rotating variants with bounded nonblocking durations', async () => {
  const { cueAnimationPlan } = await import('../src/lib/learning/cue-game.ts');
  for (const situation of ['stable', 'partial', 'unclear', 'updated', 'constellation', 'level', 'finish', 'streak', 'flow'] as const) {
    const plans = Array.from({ length: 6 }, (_, occurrence) => cueAnimationPlan(situation, occurrence));
    assert.deepEqual(plans.map((plan) => plan.variant), [0, 1, 2, 0, 1, 2]);
    assert.ok(plans.every((plan) => plan.situation === situation && plan.duration >= 1000 && plan.duration <= 2200));
  }
  assert.ok(cueAnimationPlan('level', 0).duration > cueAnimationPlan('stable', 0).duration);
});

test('galaxy stars retain deterministic coordinates and status colors as learning grows', async () => {
  const { cueGalaxyPoint, cueStarPosition, CUE_STAR_COLORS } = await import('../src/lib/learning/cue-game.ts');
  const before = Array.from({ length: 200 }, (_, i) => cueGalaxyPoint(`star-${i}`));
  const after = Array.from({ length: 300 }, (_, i) => cueGalaxyPoint(`star-${i}`));
  assert.deepEqual(after.slice(0, 200), before);
  assert.equal(new Set(before.map((point) => JSON.stringify(point))).size, 200);
  for (let i = 0; i < before.length; i++) {
    assert.ok(before[i].radius >= .12 && before[i].radius <= .95);
    const point = cueStarPosition(`star-${i}`);
    assert.ok(point.x > 10 && point.x < 190 && point.y > 10 && point.y < 140);
  }
  assert.equal(new Set(Object.values(CUE_STAR_COLORS)).size, 3);
});

test('encouragement is frequent and all-status completion is independent of correctness', async () => {
  const { cueEncouragement } = await import('../src/lib/learning/cue-game.ts');
  assert.equal(cueEncouragement(1, 1, false, false), null);
  assert.equal(cueEncouragement(4, 0, false, false), null);
  assert.equal(cueEncouragement(8, 8, false, false), 'streak');
  assert.equal(cueEncouragement(10, 0, false, false), 'flow');
  assert.equal(cueEncouragement(5, 0, false, true), 'constellation');
  assert.equal(cueEncouragement(10, 0, true, true), 'level');
});
test('desktop prompt and ratings share a viewport-sized centered stage', async () => {
  const { readFile } = await import('node:fs/promises');
  const component = await readFile(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/modules/schedule/cue-game-layout.module.css', import.meta.url), 'utf8');
  assert.match(component, /data-cue-study-stage[^]*CuePromptContent[^]*data-cue-study-ratings/);
  assert.match(css, /main\[data-cue-study-page\] \{[^}]*flex: 1; min-height: 0/);
  assert.match(css, /\[data-cue-study-stage\] \{ margin-block: auto/);
});
