import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('public/StudyGuide.html', 'utf8');

const required = [
  '执行中心', '学习', '习题', '考试', '学习闭环', '执行与专注', 'IELTS 专项',
  '内容版本 2026-09-04', 'studyguide_progress',
  '今日', '本周', '每两周', '当前没有考试叠加计划',
  'Preview Once', 'Class Learning → Write Cue → Textbook Check', 'Need Extra Verification?', 'Homework → Update from Evidence', 'Cue Recall → √ / △ / ○',
  '汇总本周验证证据', '遮住答案回忆 Cue', '检查重复错误模式', '重做精选 Problematic Questions', '决定下周仍需处理什么',
  '随机抽10个已掌握知识点', '按知识类型完全闭卷测试', '查看两周留存趋势',
  '√＝独立、准确、完整', '△＝有印象但遗漏或需要轻提示', '○＝无法独立回忆或看答案才想起',
  'Syllabus Check', '红绿灯看长期主题，√ / △ / ○只记录一次检索结果', 'Anki', '可选工具',
  'Structure · 扫结构', 'Logic · 猜连接', 'Connection · 接旧知', 'Questions · 自然产生才记录',
  '优先当天，最迟隔天', 'Cue 必须触发主动回忆，而不是标题',
  'Locate → Compare → Fill Gaps → Leave', 'Skip textbook questions', 'Use questions for verification, not for ceremonial extra workload',
  'Homework · Application + Verification', '红笔易错点', 'Problematic Questions', 'Next-day Cue Recall', 'Unit Summary · 只写一次',
  'Teacher ≠ Textbook ≠ Syllabus', 'Unit 完成并写完 Summary 后', 'Summary 不按每节课写',
  '难题怎么拆', '学科 / 题型怎么做', '错题诊断', '卡题怎么办',
  '普通题直接做；陌生题、综合题或做到一半断掉时，再打开这一页',
  '目标 → 缺口 → 连接', '从目标往回推', '只做必要检查',
  'Math', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Humanities', 'IELTS',
  '基础计算', '多步骤题', 'Proof / 证明', 'Modelling / 建模',
  'State / Give', 'Algorithm / Pseudocode', 'Trace', 'Debug',
  'Multi-stage Question', 'Uncertainty / Error', 'Organic Pathway',
  'Long Answer / Process', 'Boolean Logic', 'Database', 'Source Analysis', 'Writing Task 2',
  '实际在考：', '先看：', '答案怎样组织：', '最常见错误：', '简短例子：',
  'Knowledge Node', 'Root Cause', 'Retest',
  'Knowledge、Recall、Condition/Rule、Interpretation、Selection、Reasoning、Execution、Response Structure、Time/Strategy',
  '学校考试', 'IGCSE / AS / A-Level', '考场策略',
  'Map · 圈真实范围', 'Diagnose · 用已有证据找弱点', 'Repair + Verify · 修完立刻换题验证', '按考试规模决定模拟程度',
  '考试计划生成器', '考试范围（可选）', '建立考试计划',
  'topic / question type', 'cross-topic / sections', 'full papers',
  '正常从前往后做，卡住就跳', '分值 → 时间', '最后按个人高风险检查',
  '理解 → 连接 → 检索 → 应用', '去“执行与专注”',
  '上午2h、下午2h、晚上1h', '25+5', '50+10',
  '计划与取舍', '降低启动门槛', '守住一个专注段',
  '计划写到可以直接开始', '默认只写动作 + 范围', '完成标准按需添加', '执行后再细化',
  'TickTick负责做什么和什么时候', 'StudyGuide负责开始以后具体怎么学',
  '任务写法助手', '生成简洁任务', 'Copy', '卡题提示器', '再给一点提示',
  '不要直接给答案，只给我下一步最小提示',
  'data-tab="ielts"', 'check-ielts', "if (tab === 'ielts') STATE.subTab = 'overview'",
  "subTabs: ['overview', 'listening', 'reading', 'writing', 'speaking', 'language']",
  'IELTS 专项：四项能力如何真正提升', '熟练当前材料 ≠ 掌握能力；Transfer 才是最终验证',
  'Listening：一次听懂，而不是依赖回拨', '第一次做题不暂停、不回拨；复盘才回拨',
  'Test Mode · 一次连续做', 'Repair Mode · 错题局部重听',
  'Reading：正确率之外，还要解决“为什么慢”', 'Correct but Slow',
  'Writing：旧文修复 + 新文迁移', 'Self Revision Loop', 'Language Upgrade',
  'This Essay Errors ≠ Recurring Errors', '至少在2篇独立新作文里再次出现',
  'Speaking：把正确英语练成自动输出', 'Repeat → Repair → Transfer', 'Repeat → Memorise',
  'Recognition Vocabulary ≠ Active Vocabulary', 'Grammar Automaticity Drill',
  'dashboardPeriod', 'moduleGranule', 'activeExamPlan', 'weeklyReviewDay',
  'getISOWeekKey', 'studyguide_last_retention_review', 'navigateToMethod',
  '查看详细说明', 'renderExpandedDetails',
  '14d879P1Li640upWdYp6ngxyK_XH00aZge_03Ep4GO4c',
  'BV1tibi6xEN4', 'BV1EhB9BLEHs', 'BV1MCZjB3EzQ',
  'BV1UL9uBrEyk', 'BV155djBVEva', 'BV1SSGn6kEUb',
  'onkeydown="if(event.key===\'Enter\'||event.key===\' \'',
];

const missing = required.filter((text) => !html.includes(text));
if (missing.length) throw new Error(`Study Guide checks failed; missing: ${missing.join(', ')}`);

const forbidden = [
  'Conclusion', '今日闭环与三句总结', '错题费曼大扫荡',
  '每周2次高保真模拟考', '弱科多15%', '3分钟熔断机制',
  'STATE.timeGranule', 'examMode', 'studyguide_last_biweekly',
  '通用做题流程', '卡住与再训练',
  '开启3周计划', '开启2周压缩计划', 'startExamPlan(kind)', 'kind ===',
  "subTabs: ['loop', 'schoolday'", 'schoolday:', 'independent:', 'reviewflow:', 'routing:',
  "label: '学习流程'", '先拿确定分', '读规则与快速预扫描',
  '若用户临近考试，采用3周',
];
const presentForbidden = forbidden.filter((text) => html.includes(text));
if (presentForbidden.length) throw new Error(`Study Guide contains removed concepts: ${presentForbidden.join(', ')}`);

if ((html.match(/data-tab="/g) || []).length !== 7) {
  throw new Error('Study Guide must contain exactly seven primary tabs');
}
const primaryOrder = ['today', 'learn', 'practice', 'exam', 'workflow', 'procrastination', 'ielts'];
const navPositions = primaryOrder.map((tab) => html.indexOf(`data-tab="${tab}"`));
if (navPositions.some((position) => position < 0) || navPositions.some((position, index) => index > 0 && position <= navPositions[index - 1])) {
  throw new Error('IELTS must be the final primary sidebar item, after every existing study section');
}
if ((html.match(/detail:/g) || []).length < 15) {
  throw new Error('Study Guide needs content-specific expandable explanations');
}
if (!html.includes('position: fixed') || !html.includes('margin-left: 280px')) {
  throw new Error('Study Guide sidebar is not fixed with matching content offset');
}

const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Study Guide inline script is missing');

const storage = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  document: { addEventListener() {} },
};
vm.runInNewContext(`${script};globalThis.__studyGuideTest = {
  getTimelineItems,
  getISOWeekKey,
  getDashboardProgressKey,
  getExamPlanAdvice,
  buildTaskDraft,
  escapeHtml,
  renderToday,
  renderModuleFor(tab, subTab) { STATE.subTab = subTab || null; return renderModule(tab); },
  loadState,
  getState() { return { ...STATE }; },
  modules: Object.fromEntries(Object.entries(STUDY_DATA).map(([key, value]) => [key, value.subTabs])),
  typeLibrary: STUDY_DATA.practice.content.types.granules.guide.questionTypes,
};`, sandbox);

const runtime = sandbox.__studyGuideTest;
for (const period of ['daily', 'weekly', 'biweekly']) {
  if (runtime.getTimelineItems(period).length !== 5) {
    throw new Error(`Execution Center ${period} period must contain five focused steps`);
  }
}
if (runtime.getISOWeekKey(new Date(2026, 7, 24)) !== 'week:2026-W35') {
  throw new Error('ISO-week progress key calculation is incorrect');
}
if (!runtime.getDashboardProgressKey('daily', new Date(2026, 7, 29)).startsWith('day:2026-08-29')) {
  throw new Error('Daily progress key calculation is incorrect');
}
if (runtime.escapeHtml('<script>') !== '&lt;script&gt;') {
  throw new Error('Exam plan text is not escaped safely');
}
if (!runtime.getExamPlanAdvice({ date: '' }).later.includes('Map → Diagnose')) {
  throw new Error('Exam plan advice fallback is incorrect');
}
if (!runtime.renderToday().includes('执行中心')) {
  throw new Error('Execution Center cannot render with the default state');
}
const expectedTabs = {
  learn: ['preview', 'cornell', 'review', 'traffic', 'selfstudy'],
  practice: ['general', 'types', 'diagnose', 'stuck'],
  exam: ['school', 'major', 'strategy'],
  workflow: ['loop'],
  procrastination: ['plan', 'start', 'focus'],
  ielts: ['overview', 'listening', 'reading', 'writing', 'speaking', 'language'],
};
for (const [module, tabs] of Object.entries(expectedTabs)) {
  if (JSON.stringify(runtime.modules[module]) !== JSON.stringify(tabs)) {
    throw new Error(`Study Guide ${module} sub-navigation does not match the new IA`);
  }
  if (!runtime.renderModuleFor(module).includes('查看详细说明') && module !== 'practice') {
    throw new Error(`Study Guide ${module} module cannot render its expandable guidance`);
  }
}

const preview = runtime.renderModuleFor('learn', 'preview');
for (const text of ['一个 Unit 只做一次', 'Questions · 自然产生才记录', '没有问题不是预习失败', '不随每节课重复']) {
  if (!preview.includes(text)) throw new Error(`Learning Preview is missing: ${text}`);
}
const cornell = runtime.renderModuleFor('learn', 'cornell');
for (const text of [
  'Cue 跟 subsection 走', 'Summary 跟 Unit 走', 'Textbook Check',
  'Locate → Compare → Fill Gaps → Leave', 'Skip textbook questions',
  'Homework · Application + Verification', 'Update from Evidence',
  '红笔易错点', 'Problematic Questions', 'Next-day Cue Recall',
]) {
  if (!cornell.includes(text)) throw new Error(`Cornell Learning is missing: ${text}`);
}
const review = runtime.renderModuleFor('learn', 'review');
for (const text of ['第一次正式 Cue Recall 可以放到第二天', '√ / △ / ○', 'Weekly Verification', '不要重新复习全部 √ 内容']) {
  if (!review.includes(text)) throw new Error(`Active Recall & Spacing is missing: ${text}`);
}
const syllabus = runtime.renderModuleFor('learn', 'traffic');
for (const text of ['Teacher ≠ Textbook ≠ Syllabus', 'Unit 完成并写完 Summary 后', 'coverage check', '不是每天的学习步骤']) {
  if (!syllabus.includes(text)) throw new Error(`Syllabus Check is missing: ${text}`);
}
const selfStudy = runtime.renderModuleFor('learn', 'selfstudy');
if (!selfStudy.includes('不属于每日学习流程的必做步骤') || !selfStudy.includes('optional container')) {
  throw new Error('50-minute self-study must remain an optional container outside the daily learning flow');
}

storage.set('studyguide_progress', JSON.stringify({
  checklists: { 'day:2026-09-03': { school_preview: true, school_record: true } },
  lastTab: 'learn',
  dashboardPeriod: 'weekly',
  lastGranule: 'biweekly',
  activeExamPlan: { name: 'Legacy exam', date: '2026-09-30', kind: '3week' },
}));
runtime.loadState();
const legacyState = runtime.getState();
if (!legacyState.progress['day:2026-09-03']?.school_preview || legacyState.mainTab !== 'learn' || legacyState.moduleGranule !== 'biweekly') {
  throw new Error('Legacy StudyGuide localStorage state no longer loads safely');
}

const ieltsOverview = runtime.renderModuleFor('ielts', 'overview');
if (!ieltsOverview.includes('熟练当前材料 ≠ 掌握能力；Transfer 才是最终验证')) {
  throw new Error('IELTS overview must state the transfer principle');
}
const ieltsListening = runtime.renderModuleFor('ielts', 'listening');
if (!ieltsListening.includes('第一次做题不暂停、不回拨；复盘才回拨') || !ieltsListening.includes('Test Mode') || !ieltsListening.includes('Repair Mode')) {
  throw new Error('IELTS Listening must clearly separate uninterrupted Test Mode from Repair Mode');
}
if (!runtime.renderModuleFor('ielts', 'reading').includes('Correct but Slow')) {
  throw new Error('IELTS Reading must diagnose correct-but-slow answers');
}
const ieltsWriting = runtime.renderModuleFor('ielts', 'writing');
for (const requiredWritingText of ['AI找问题，不直接代写', 'Self Revision Loop', 'Language Upgrade', 'This Essay Errors ≠ Recurring Errors', 'Transfer Essay']) {
  if (!ieltsWriting.includes(requiredWritingText)) throw new Error(`IELTS Writing is missing: ${requiredWritingText}`);
}
const ieltsSpeaking = runtime.renderModuleFor('ielts', 'speaking');
if (!ieltsSpeaking.includes('允许重复，禁止无限重复') || !ieltsSpeaking.includes('Transfer Question')) {
  throw new Error('IELTS Speaking must repair the same question and transfer to a new one');
}
const ieltsLanguage = runtime.renderModuleFor('ielts', 'language');
if (!ieltsLanguage.includes('Recognition Vocabulary ≠ Active Vocabulary') || !ieltsLanguage.includes('Grammar Automaticity Drill')) {
  throw new Error('IELTS language page must distinguish recognition from active vocabulary and train automaticity');
}

const workflowHtml = runtime.renderModuleFor('workflow', 'schoolday');
if (!workflowHtml.includes('理解 → 连接 → 检索 → 应用') || workflowHtml.includes('sub-tabs')) {
  throw new Error('Learning Loop must fall back to its only page and hide redundant sub-navigation');
}
if (!runtime.renderModuleFor('practice', 'general').includes('普通题直接做')) {
  throw new Error('Practice must open with the optional hard-question tool');
}
if (!runtime.renderModuleFor('practice', 'stuck').includes('卡题提示器')) {
  throw new Error('Stuck-question hint tool is not rendered');
}
if (!runtime.renderModuleFor('procrastination', 'plan').includes('任务写法助手')) {
  throw new Error('Task writing tool is not rendered');
}
const shortTask = runtime.buildTaskDraft('Physics', 'Review', 'Momentum');
const detailedTask = runtime.buildTaskDraft('Physics', 'Review', 'Momentum', '闭卷解释守恒条件');
if (shortTask.title !== 'Review Physics — Momentum' || shortTask.description !== '') {
  throw new Error('Task writer must keep the default task concise');
}
if (!detailedTask.description.includes('完成标准：闭卷解释守恒条件')) {
  throw new Error('Task writer must add completion criteria only when provided');
}

const allTypes = runtime.typeLibrary.flatMap((subject) => subject.types);
if (runtime.typeLibrary.length < 7 || allTypes.length < 45) {
  throw new Error('Subject/question-type library is not sufficiently expanded');
}
for (const type of allTypes) {
  for (const field of ['tests', 'first', 'structure', 'trap', 'example']) {
    if (!type[field]) throw new Error(`Question type ${type.name} is missing ${field}`);
  }
}

const baseDate = new Date(2026, 7, 30);
const examDate = (days) => {
  const date = new Date(2026, 7, 30 + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
for (const [days, expected] of [
  [1, 'Quick Verify'],
  [7, 'mixed'],
  [21, 'Simulate'],
  [60, 'cross-topic'],
  [240, 'Syllabus Coverage'],
]) {
  const advice = runtime.getExamPlanAdvice({ date: examDate(days) }, baseDate);
  const combined = `${advice.current} ${advice.later} ${advice.note}`;
  if (advice.daysLeft !== days || !combined.includes(expected)) {
    throw new Error(`Date-driven exam advice failed for ${days} days remaining`);
  }
}
const modern = runtime.getExamPlanAdvice({ date: examDate(7) }, baseDate);
const legacy = runtime.getExamPlanAdvice({ date: examDate(7), kind: '3week' }, baseDate);
if (JSON.stringify(modern) !== JSON.stringify(legacy)) {
  throw new Error('Legacy activeExamPlan.kind must be ignored safely');
}

console.log('Study Guide content, compatibility, and IELTS module checks passed.');
