import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('public/StudyGuide.html', 'utf8');

const required = [
  '执行中心', '学习', '习题', '考试', '学习流程', '执行与专注',
  '内容版本 2026-08-29', 'studyguide_progress',
  '今日', '本周', '每两周', '当前没有考试叠加计划',
  '4-P 预习', 'Cornell Record', 'Cue + Summary', 'Homework / Application', 'Due Review Queue',
  '汇总本周信号', '扫描当前学习范围', '选出2–3个最大漏洞', '安排修复任务', '安排下周',
  '随机抽10个已掌握知识点', '按知识类型完全闭卷测试', '查看两周留存趋势',
  '√＝独立、准确、完整', '△＝有印象但遗漏或需要轻提示', '○＝无法独立回忆或看答案才想起',
  'Syllabus 红绿灯', '和单次检索的√/△/○不是同一套状态', 'Anki', '可选工具',
  'Preview · 扫结构', 'Prior knowledge · 激活旧知', 'Predict · 先猜逻辑', 'Questions · 留下1–3问',
  '课后第一个可用空档', '最好当天完成', '不能直接给答案',
  '通用做题流程', '学科与题型', '错题诊断', '卡住与再训练',
  'Math', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Humanities', 'English / IELTS',
  '计算 / 多步骤陌生题 / 证明 / 建模', 'Theory / Algorithm / Pseudocode / Trace / Debug',
  'Knowledge Node', 'Root Cause', 'Retest',
  'Knowledge、Recall、Condition/Rule、Interpretation、Selection、Reasoning、Execution、Response Structure、Time/Strategy',
  '学校考试', 'IGCSE / AS / A-Level', '考场策略',
  'Map & Diagnose', 'Repair & Verify', 'Simulate & Stabilize', '只有2周',
  '理解 → 连接 → 复习 → 应用', '学校日完整流程', '自主学习流程', '复习流程', '卡住时去哪一个板块',
  '上午2h、下午2h、晚上1h', '25+5番茄钟', '50+10深度段',
  '计划与取舍', '降低启动门槛', '守住一个专注段',
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
];
const presentForbidden = forbidden.filter((text) => html.includes(text));
if (presentForbidden.length) throw new Error(`Study Guide contains removed concepts: ${presentForbidden.join(', ')}`);

if ((html.match(/data-tab="/g) || []).length !== 6) {
  throw new Error('Study Guide must keep exactly six primary tabs');
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
  getExamPlanPhase,
  escapeHtml,
  renderToday,
  renderModuleFor(tab) { STATE.subTab = null; return renderModule(tab); },
  modules: Object.fromEntries(Object.entries(STUDY_DATA).map(([key, value]) => [key, value.subTabs])),
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
if (!runtime.getExamPlanPhase({ kind: '3week', date: '' }).includes('Map & Diagnose')) {
  throw new Error('Exam plan phase fallback is incorrect');
}
if (!runtime.renderToday().includes('执行中心')) {
  throw new Error('Execution Center cannot render with the default state');
}
const expectedTabs = {
  learn: ['preview', 'cornell', 'review', 'traffic', 'selfstudy'],
  practice: ['general', 'types', 'diagnose', 'stuck'],
  exam: ['school', 'major', 'strategy'],
  workflow: ['loop', 'schoolday', 'independent', 'reviewflow', 'routing'],
  procrastination: ['plan', 'start', 'focus'],
};
for (const [module, tabs] of Object.entries(expectedTabs)) {
  if (JSON.stringify(runtime.modules[module]) !== JSON.stringify(tabs)) {
    throw new Error(`Study Guide ${module} sub-navigation does not match the new IA`);
  }
  if (!runtime.renderModuleFor(module).includes('查看详细说明')) {
    throw new Error(`Study Guide ${module} module cannot render its expandable guidance`);
  }
}

console.log('Study Guide IA, content, state, and compatibility checks passed.');
