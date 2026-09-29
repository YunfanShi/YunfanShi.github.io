export interface IeltsPlanPhase {
  id: 'baseline' | 'repair-one' | 'mock-one' | 'repair-two' | 'mock-two' | 'closing' | 'exam';
  start: string;
  end: string;
  title: string;
  focus: string;
  action: string;
}

export const IELTS_PERSONAL_PLAN: {
  version: number;
  examDate: string;
  weeklyHours: number;
  targets: { overall: number; listening: number; reading: number; writing: number; speaking: number };
  modules: string[];
  phases: IeltsPlanPhase[];
} = {
  version: 6,
  examDate: '2026-11-28',
  weeklyHours: 5,
  targets: { overall: 7, listening: 7.5, reading: 7, writing: 6.5, speaking: 6.5 },
  modules: ['Listening', 'Reading', 'Writing', 'Speaking', 'Review'],
  phases: [
    { id: 'baseline', start: '2026-09-29', end: '2026-10-05', title: '严格基线', focus: '在正式条件下确认四科真实起点。', action: '完成第一轮五模块；听力不暂停回拨，阅读严格计时。' },
    { id: 'repair-one', start: '2026-10-06', end: '2026-10-24', title: '第一轮专项修复', focus: '写作、口语优先，同时修复阅读速度。', action: '完成约三轮五模块；同一篇写作可以跨多次继续。' },
    { id: 'mock-one', start: '2026-10-25', end: '2026-10-25', title: '第一次完整模考', focus: '使用未做过的新材料，完整模拟机考。', action: '模考后先总结，不立即开启下一套题。' },
    { id: 'repair-two', start: '2026-10-26', end: '2026-11-14', title: '按模考结果补缺', focus: '只提升第一次模考暴露出的最大短板。', action: '再完成约三轮五模块，并保持听力稳定性。' },
    { id: 'mock-two', start: '2026-11-15', end: '2026-11-15', title: '第二次完整模考', focus: '验证第一次模考的问题是否改善。', action: '确认阅读、写作能否按时完成以及口语是否稳定。' },
    { id: 'closing', start: '2026-11-16', end: '2026-11-27', title: '收尾与减量', focus: '只修复第二次模考暴露出的两个最大问题。', action: '11月23日起降低强度；11月27日不做完整模考。' },
    { id: 'exam', start: '2026-11-28', end: '2026-11-28', title: '考试日', focus: '按稳定流程完成机考。', action: '不临时更换策略，以完成度和稳定性为先。' },
  ],
};

export function getIeltsPlanPhase(dateKey: string): IeltsPlanPhase {
  const first = IELTS_PERSONAL_PLAN.phases[0]!;
  const last = IELTS_PERSONAL_PLAN.phases[IELTS_PERSONAL_PLAN.phases.length - 1]!;
  const phase = IELTS_PERSONAL_PLAN.phases.find((item) => dateKey >= item.start && dateKey <= item.end);
  if (phase) return phase;
  return dateKey < first.start ? first : last;
}

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
