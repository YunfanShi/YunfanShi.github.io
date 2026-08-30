import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { legacyLanguageBridge } from '../src/lib/legacy-i18n.ts';

const publicDir = new URL('../public/', import.meta.url);
const projectDir = new URL('../', import.meta.url);

test('legacy language bridge stores hyphenated attributes without dataset errors', () => {
  const bridge = legacyLanguageBridge('en');
  assert.match(bridge, /attr\.replace\(\/-\/g, '_'/);
  assert.doesNotMatch(bridge, /el\.dataset\[key\]/);
});

test('every embedded legacy page loads the shared theme contract', async () => {
  const pages = [
    'AnswerSheet.html', 'AnswerSheetSync.html', 'BilibiliSync.html',
    'Control.html', 'Countdown.html', 'Goal.html', 'HelpCenter.html',
    'IGCountdown.html', 'MockPortal.html', 'MusicPlayer.html',
    'MusicPlayerSync.html', 'Poem.html', 'Pomodoro.html', 'QuizWise.html', 'Relax.html',
    'StudyGuide.html', 'Studyplan.html', 'TimetableHub.html',
    'UpdateHub.html', 'Vocab.html',
  ];

  for (const page of pages) {
    const html = await readFile(new URL(page, publicDir), 'utf8');
    assert.match(html, /jackyun-theme\.css/, `${page} is missing shared theme CSS`);
    assert.match(html, /jackyun-theme\.js/, `${page} is missing shared theme JS`);
  }
});

test('help center uses recorded article dates instead of the current date', async () => {
  const html = await readFile(new URL('HelpCenter.html', publicDir), 'utf8');
  assert.doesNotMatch(html, /const d = new Date\(\)/);
  assert.match(html, /getUpdateDate\(art\)/);
  assert.match(html, /article\.updatedAt/);
});

test('mock portal provides validated external paper libraries and advanced-level presets', async () => {
  const html = await readFile(new URL('MockPortal.html', publicDir), 'utf8');
  assert.match(html, /cambridge-9709/);
  assert.match(html, /pearson-ial-math/);
  assert.match(html, /function normalizeImportedPaper/);
  assert.match(html, /source\.length > 5000/);
  assert.match(html, /aria-label="卷库 JSON 配置"/);
  assert.match(html, /function applyPastedPaperConfig/);
  assert.doesNotMatch(html, /prompt\('粘贴 JSON 配置/);
  assert.match(html, /function paperTypeOf/);
  assert.match(html, /function paperVariantOf/);
});

test('timetable hub escapes user-authored labels before rendering HTML', async () => {
  const html = await readFile(new URL('TimetableHub.html', publicDir), 'utf8');
  assert.match(html, /'&':'&amp;'/);
  assert.match(html, /'<':'&lt;'/);
  assert.match(html, /'"':'&quot;'/);
  assert.match(html, /function undoPlanChange\(\)/);
  assert.match(html, /function redoPlanChange\(\)/);
  assert.match(html, /undoStack\.length>50/);
  assert.match(html, /e\.shiftKey\)redoPlanChange\(\)/);
});

test('relax starts with the optional zen overlay closed', async () => {
  const html = await readFile(new URL('Relax.html', publicDir), 'utf8');
  const zenRule = html.match(/#zen-layer\s*\{([^}]*)\}/)?.[1] || '';
  assert.equal((zenRule.match(/display\s*:/g) || []).length, 1);
  assert.match(zenRule, /display:\s*none/);
});

test('appearance sync migrates undated local settings without permanently blocking cloud updates', async () => {
  const source = await readFile(new URL('src/components/layout/cloud-settings-hydrator.tsx', projectDir), 'utf8');
  assert.doesNotMatch(source, /Number\.MAX_SAFE_INTEGER/);
  assert.match(source, /localStorage\.setItem\(LOCAL_UPDATED_KEY, migratedAt\)/);
  assert.match(source, /localTime > cloudTime/);
});
