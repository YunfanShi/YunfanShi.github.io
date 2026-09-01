import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('public/Studyplan.html', 'utf8');
const presetScript = readFileSync('public/studyplan-syllabus-presets.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadFunction(startMarker, endMarker, functionName) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Cannot extract ${functionName}`);
  const sandbox = {};
  vm.runInNewContext(`${html.slice(start, end)};this.result=${functionName};`, sandbox);
  return sandbox.result;
}

const parseManual = loadFunction(
  '    function parseSyllabusText(raw)',
  '    // ××× 正则匹配：CAIE',
  'parseSyllabusText',
);
const parseCaie = loadFunction(
  '    function regexParseCAIE(raw)',
  '    // ××× 正则匹配：Edexcel',
  'regexParseCAIE',
);
const parseEdexcel = loadFunction(
  '    function regexParseEdexcel(raw)',
  '    // ××× 正则匹配解析',
  'regexParseEdexcel',
);
const escapeHtml = loadFunction(
  '    function escapeHtml(s)',
  '    // ××× 确认导入',
  'escapeHtml',
);
assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');

const manual = parseManual(`Computer Science (9618)
- 1 Information representation
  - 1.1 Data Representation
  - 1.2 Multimedia
- 2 Communication
  - 2.1 Networks including the internet`);
assert.equal(manual.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(manual[0].units)), [
  { name: '1 Information representation', subs: ['1.1 Data Representation', '1.2 Multimedia'] },
  { name: '2 Communication', subs: ['2.1 Networks including the internet'] },
]);

const caie = parseCaie(`Cambridge International AS & A Level Computer Science 9618 syllabus for examination in 2026
3 Subject content
1 Information representation
1.1 Data Representation
1.2 Multimedia
2 Communication
2.1 Networks including the internet
2.1 Networks including the internet continued
4 Details of the assessment
1 AS Level only`);
assert.equal(caie.subjectName, 'Computer Science (9618)');
assert.deepEqual(plain(caie.chapters.map(({ name }) => name)), [
  '1 Information representation',
  '2 Communication',
]);
assert.deepEqual(plain(caie.chapters[0].subs.map(({ name }) => name)), [
  '1.1 Data Representation',
  '1.2 Multimedia',
]);
assert.equal(caie.chapters[1].subs.length, 1, 'continued headings must be deduplicated');

const legacyCaie = parseCaie(`Physics (9702)
1.1 Physical quantities
1.1.1 Scalars and vectors
1.2 SI units`);
assert.deepEqual(plain(legacyCaie.chapters.map(({ name }) => name)), [
  '1.1 Physical quantities',
  '1.2 SI units',
]);
assert.equal(legacyCaie.chapters[0].subs[0].name, '1.1.1 Scalars and vectors');

const edexcel = parseEdexcel(`Pearson Edexcel Level 3 Advanced GCE in Mathematics
Paper 1: Pure Mathematics 1
Content overview
• Topic 1 – Proof
• Topic 2 – Algebra and functions
Paper 3: Statistics and Mechanics
Section A: Statistics
• Topic 1 – Statistical sampling
Section B: Mechanics
• Topic 6 – Quantities and units in mechanics

Paper 1 and Paper 2: Pure Mathematics
What students need to learn:
Topics Content Guidance
1  1.1 Understand and use the structure of mathematical proof
2  2.1 Understand and use the laws of indices
Assessment information

Paper 3: Statistics and Mechanics
What students need to learn:
Topics Content Guidance
1  1.1 Understand and use the terms population and sample
6  6.1 Understand and use fundamental quantities and units
Assessment information

Appendix 2: Notation
1.2 is not an element of`);
assert.equal(edexcel.subjectName, 'Mathematics (Edexcel)');
assert.deepEqual(plain(edexcel.chapters.map(({ name }) => name)), [
  'Pure Mathematics — 1 Proof',
  'Pure Mathematics — 2 Algebra and functions',
  'Statistics — 1 Statistical sampling',
  'Mechanics — 6 Quantities and units in mechanics',
]);
assert.equal(edexcel.chapters[0].subs[0].id, '1.1');
assert.equal(edexcel.chapters[2].subs[0].id, '1.1');
assert.ok(!edexcel.chapters.some(({ subs }) => subs.some(({ name }) => name.includes('not an element'))));

const dataHelpersStart = html.indexOf('    function captureSubjectLearningData(subject)');
const dataHelpersEnd = html.indexOf('    function resetMainViewAfterSyllabusDelete(subject)', dataHelpersStart);
assert.ok(dataHelpersStart >= 0 && dataHelpersEnd > dataHelpersStart, 'Cannot extract syllabus deletion data helpers');
const storage = new Map([
  ['jackyun_traffic_Physics|Waves', '{"color":"yellow"}'],
  ['jackyun_traffic_Math|Proof', '{"color":"green"}'],
]);
const deletionSandbox = {
  TRAFFIC_PREFIX: 'jackyun_traffic_',
  progressDB: { 'Physics|Waves|note': true, 'Math|Proof|note': true },
  mockDB: { Physics: [{ code: '9702/22' }], Math: [{ code: 'P1' }] },
  settings: { urgent: { subjects: ['Physics', 'Math'], type: 'Revision', detail: 'Review', date: '2026-09-02' } },
  localStorage: {
    get length() { return storage.size; },
    key: index => [...storage.keys()][index] ?? null,
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  },
};
vm.runInNewContext(`${html.slice(dataHelpersStart, dataHelpersEnd)};
  this.capture=captureSubjectLearningData;
  this.clearData=clearSubjectLearningData;
  this.restore=restoreSubjectLearningData;`, deletionSandbox);
const learningSnapshot = deletionSandbox.capture('Physics');
deletionSandbox.clearData('Physics', learningSnapshot);
assert.equal(deletionSandbox.progressDB['Physics|Waves|note'], undefined);
assert.equal(deletionSandbox.progressDB['Math|Proof|note'], true);
assert.equal(storage.has('jackyun_traffic_Physics|Waves'), false);
assert.equal(storage.has('jackyun_traffic_Math|Proof'), true);
assert.equal(deletionSandbox.mockDB.Physics, undefined);
assert.deepEqual(plain(deletionSandbox.settings.urgent.subjects), ['Math']);
deletionSandbox.restore('Physics', learningSnapshot);
assert.equal(deletionSandbox.progressDB['Physics|Waves|note'], true);
assert.equal(storage.has('jackyun_traffic_Physics|Waves'), true);
assert.equal(deletionSandbox.mockDB.Physics[0].code, '9702/22');
assert.deepEqual(plain(deletionSandbox.settings.urgent.subjects), ['Physics', 'Math']);

const presetSandbox = { window: {} };
vm.runInNewContext(presetScript, presetSandbox);
const presets = plain(presetSandbox.window.STUDYPLAN_SYLLABUS_PRESETS);
assert.deepEqual(presets.plans.all2026.subjectKeys, ['cs2026', 'physics', 'mathematics']);
assert.deepEqual(presets.plans.all2027.subjectKeys, ['cs2027', 'physics', 'mathematics']);
assert.equal(presets.subjects.cs2026.units.length, 20);
assert.equal(presets.subjects.cs2027.units.length, 20);
assert.equal(presets.subjects.physics.units.length, 25);
assert.equal(presets.subjects.mathematics.units.length, 6);
assert.equal(
  presets.subjects.mathematics.units.reduce((total, unit) => total + unit.subs.length, 0),
  38,
);
assert.ok(presets.subjects.physics.units.some(unit => unit.name === '10 D.C. circuits'));
assert.ok(presets.subjects.mathematics.units.some(unit => unit.name === 'Unit S1 — Statistics 1'));
for (const subject of Object.values(presets.subjects)) {
  const names = subject.units.map(unit => typeof unit === 'string' ? unit : unit.name);
  assert.equal(new Set(names).size, names.length, `${subject.subject} contains duplicate units`);
}

for (const requiredText of [
  '怎么看大纲、怎样用大纲学习',
  'Candidates should be able to',
  'Notes and guidance',
  'What students need to learn',
  'Content 告诉你“会什么”',
  '红灯</span>＝核心要求还不能独立完成',
  '我的内置大纲方案',
  '默认不选择、不会自动导入',
  'loadBuiltInSyllabusPlan',
  '<option value="">-- 请选择方案 --</option>',
  '删除整份大纲',
  '同时清除该科目的任务进度、红绿灯和 Mock 记录（默认不清除）',
  'deleteCurrentSyllabus',
  'undoLastSyllabusChange',
  'setAllImportSelection',
  'setImportSubjectSelection',
  'isImportUnitExisting',
  '查看 ${u.subs.length} 个小单元',
]) {
  assert.ok(html.includes(requiredText), `Studyplan tutorial is missing: ${requiredText}`);
}

console.log('Studyplan syllabus import hierarchy and learning tutorial checks passed.');
