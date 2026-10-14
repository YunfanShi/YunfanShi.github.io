import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import katex from 'katex';
import * as answerFunctions from '../src/lib/learning/cue-answer-card.ts';
import * as selfCheckFunctions from '../src/lib/learning/cue-self-check.ts';
import { splitMathText, normalizeLatexRelations, normalizeLegacyLatex } from '../src/lib/latex-text.ts';

const require = createRequire(import.meta.url);
function compileComponent(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const compiledModule = { exports: {} as { default: React.ComponentType<Record<string, unknown>> } };
  runInNewContext(outputText, { module: compiledModule, exports: compiledModule.exports, require: (name: string) => name in dependencies ? dependencies[name] : require(name) });
  return compiledModule.exports.default;
}
const LatexRenderer = compileComponent('../src/components/modules/latex-renderer.tsx', {
  '@/lib/latex-text': { splitMathText, normalizeLatexRelations, normalizeLegacyLatex },
  'katex/dist/katex.min.css': {},
});
const MobileCard = compileComponent('../src/components/modules/schedule/mobile-cue-card.tsx', {
  '../latex-renderer': { __esModule: true, default: LatexRenderer },
  './schedule-control.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
});
const cue = { id: 'test', prompt: 'F_R = kv', subtitle: '2u_y/g', answer: 'Answer', markingPoints: [], type: 'definition' };
function card(overrides = {}, revealed = false, selectedChoice?: number) {
  return renderToStaticMarkup(React.createElement(MobileCard, { cue: { ...cue, ...overrides }, revealed, selectedChoice, onReveal() {}, onChoice() {}, evidence: React.createElement('p', null, 'Evidence test') }));
}

test('plain formula examples render with KaTeX; CSMA/CD remains ordinary text', () => {
  for (const input of ['2u_y/g', 'F_R = kv', 'a^0 = 1', 'a^(-m) = 1/a^m', 'a^(m/n)', 'x = (-b ± √(b² - 4ac))/(2a).']) {
    const parts = splitMathText(input);
    assert.ok(parts.some((part) => part.type === 'latex-inline'), input);
    for (const part of parts.filter((part) => part.type !== 'text')) assert.doesNotThrow(() => katex.renderToString(part.value, { throwOnError: true }), input);
    assert.match(renderToStaticMarkup(React.createElement(LatexRenderer, { content: input })), /class="katex"/);
  }
  assert.deepEqual(splitMathText('CSMA/CD and TCP/IP use protocol terms.'), [{ type: 'text', value: 'CSMA/CD and TCP/IP use protocol terms.' }]);
  assert.deepEqual(splitMathText('a^(m/n) can be written using an nth root.'), [{ type: 'latex-inline', value: 'a^{m/n}' }, { type: 'text', value: ' can be written using an nth root.' }]);
  assert.match(splitMathText('x = (-b ± √(b² - 4ac))/(2a).')[0].value, /\\sqrt\{b\^\{2\} - 4ac\}/);
});

test('explicit math delimiters and prose retain their original boundaries', () => {
  assert.deepEqual(splitMathText('Recall \\(F_R=kv\\) and $$a^0=1$$.'), [
    { type: 'text', value: 'Recall ' }, { type: 'latex-inline', value: 'F_R=kv' },
    { type: 'text', value: ' and ' }, { type: 'latex-block', value: 'a^0=1' }, { type: 'text', value: '.' },
  ]);
});

test('old Cue formulas with decoded JSON control characters render as math', () => {
  const old = '参考：\\left(\\\f' + 'rac{x_1+x_2}{2},\\\f' + 'rac{y_1+y_2}{2}\\ ight)';
  const parts = splitMathText(old);
  assert.equal(parts[0].value, '参考：');
  assert.equal(parts[1].type, 'latex-inline');
  assert.equal(parts[1].value, String.raw`\left(\frac{x_1+x_2}{2},\frac{y_1+y_2}{2}\right)`);
  assert.doesNotThrow(() => katex.renderToString(parts[1].value, { throwOnError: true }));
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(LatexRenderer, { content: old })), /katex-error/);
  assert.equal(normalizeLegacyLatex('\\\t' + 'imes'), String.raw`\times`);
  assert.deepEqual(splitMathText('Read the formula in the notes.'), [{ type: 'text', value: 'Read the formula in the notes.' }]);
});

test('legacy compact fractions, theta and text commands from saved Cues render cleanly', () => {
  const broken = 'A=\\\f' + 'rac12r^2\\\t' + 'heta';
  const parts = splitMathText(broken);
  assert.deepEqual(parts.at(-1), { type: 'latex-inline', value: String.raw`\frac12r^2\theta` });
  assert.doesNotThrow(() => katex.renderToString(parts.at(-1)!.value, { throwOnError: true }));
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(LatexRenderer, { content: broken })), /katex-error/);
  assert.equal(normalizeLegacyLatex('\\\t' + 'ext{degrees}'), String.raw`\text{degrees}`);
  assert.equal(normalizeLegacyLatex('\\\f' + 'rac1a'), String.raw`\frac1a`);
});

test('every recall type has a touch reveal and keeps evidence off the question page', () => {
  for (const type of ['definition', 'process', 'formula', 'calculation', 'explanation', 'proof', 'comparison', 'standard']) {
    const front = card({ type });
    assert.match(front, /翻到答案页/);
    assert.match(front, /class="katex"/);
    assert.doesNotMatch(front, /Evidence test/);
    const back = card({ type }, true);
    assert.match(back, /Evidence test/);
    assert.match(back, /翻回题目页/);
  }
});

test('choice cards require selection and show correct and selected answers on the evidence page', () => {
  const choice = { type: 'multiple-choice', choices: ['CSMA/CD', 'F_R = kv'], correctChoice: 1 };
  assert.match(card(choice), /disabled=""/);
  assert.doesNotMatch(card(choice), /Evidence test/);
  const back = card(choice, true, 0);
  assert.match(back, /选择错误/);
  assert.match(back, /data-correct="true"/);
  assert.match(back, /data-selected="true"/);
  assert.match(back, /Evidence test/);
});

test('the viewport dialog overrides generic height caps and traps background widgets below it', () => {
  const css = readFileSync(new URL('../src/components/modules/schedule/schedule-control.module.css', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/app/(portal)/layout.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.studyOverlay\[role="dialog"\][^{]*\{[^}]*max-height: none/);
  assert.match(css, /\.studyMain[^}]*overflow-y: auto/);
  assert.match(css, /\.touchControls[^}]*flex: 0 0 auto/);
  assert.match(layout, /data-portal-shell className="isolate /);
});

test('phone filters retain all desktop options and hide desktop keyboard instructions', () => {
  const source = readFileSync(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label="选择学习科目"/);
  assert.match(source, /aria-label="选择学习单元"/);
  assert.match(source, /aria-label="选择学习范围"[^\n]*filterOptions\.map/);
  assert.match(source, /hidden md:block[^\n]*快捷键/);
  assert.match(source, /aria-label="触屏题目目录"/);
});

test('mean formulas from legacy JSON repair backspace and compact bar commands without visible slash errors', () => {
  const legacy = 'For raw data, \\' + '\u0008' + String.raw`arx=\frac{\sum x}{n}. For a frequency table, ` + '\u0008' + String.raw`arx=\frac{\sum fx}{\sum f}.`;
  for (const input of [legacy, String.raw`\(\barx=\frac{\sum x}{n}\)`, String.raw`\bar{x}=\frac{\sum fx}{\sum f}`]) {
    const parts = splitMathText(input);
    assert.equal(parts.filter((part) => part.type === 'latex-inline').length, input === legacy ? 2 : 1);
    assert.ok(parts.filter((part) => part.type === 'text').every((part) => !part.value.includes('\\')));
    assert.ok(parts.filter((part) => part.type !== 'text').every((part) => !part.value.includes('\u0008')));
    for (const part of parts.filter((part) => part.type !== 'text')) assert.doesNotThrow(() => katex.renderToString(part.value, { throwOnError: true }));
    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: input }));
    assert.match(html, /class="katex"/);
    assert.match(html, /accent/);
    assert.doesNotMatch(html, /katex-error|\\barx|\u0008/);
  }
  assert.equal(normalizeLegacyLatex(String.raw`\bar{x} and \barista`), String.raw`\bar{x} and \barista`);
  assert.deepEqual(splitMathText('CSMA/CD and TCP/IP'), [{ type: 'text', value: 'CSMA/CD and TCP/IP' }]);
});

const AnswerPanel = compileComponent('../src/components/modules/schedule/cue-answer-card.tsx', {
  '@/lib/learning/cue-answer-card': answerFunctions,
  '@/lib/learning/cue-self-check': selfCheckFunctions,
  '@/lib/ai-config': { callAiApi: async () => { throw new Error('Not used in static rendering'); } },
  '@/lib/ai-json': {},
  '../latex-renderer': { __esModule: true, default: LatexRenderer },
  './schedule-control.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
});
test('optional answer card hides comparison for blank responses and preserves old memos', () => {
  const props = { cue, inputRef: { current: null }, previousCards: [], legacyMemo: 'Old note', onText() {}, onCompare() {}, onCheck() {}, onClose() {} };
  const blank = renderToStaticMarkup(React.createElement(AnswerPanel, props));
  assert.match(blank, /disabled=""/);
  assert.doesNotMatch(blank, /aria-label="作答对照"/);
  assert.match(blank, /Old note/);
  const filled = renderToStaticMarkup(React.createElement(AnswerPanel, { ...props, card: { text: 'My answer', comparison: { version: 1, answer: 'Reference', markingPoints: ['Point'], checkedPoints: [0] } } }));
  assert.match(filled, /aria-label="作答对照"/);
  assert.match(filled, /My answer/);
  assert.match(filled, /Reference/);
  assert.match(filled, /checked=""/);
  const erased = renderToStaticMarkup(React.createElement(AnswerPanel, { ...props, card: { text: ' ', comparison: { answer: 'Reference' } } }));
  assert.doesNotMatch(erased, /aria-label="作答对照"/);
});
