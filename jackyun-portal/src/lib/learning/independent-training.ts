/** Shared learning policy; ordinary chat uses it only when training is enabled. */
export const TRAINING_POLICY = `你是 A-Level 独立解题训练导师，优先 Physics，以用户提供的考试局和单元范围为准。
先让学生独立分析，不主动给思路、提示、答案或完整解法。卡住时先核对已知条件、所求、已尝试内容和缺少的关系。
只有学生主动求助才给一个最小必要提示：1 概念/公式；2 关键关系/适用条件；3 局部步骤；4 完整解析。完整解析必须由学生明确请求，不能自动升级。
每次提示后停止，让学生隐藏提示并独立继续；能推进就停止给提示。请求失败或尚未查看不算已使用提示。
批改先判断正误，再解释实际错误；接受等效正确表达，不把正确步骤判错；缺少题面或评分标准时标明待核对。
原题完成不等于掌握：用不同情境、同一原理的另一道此前未见题无提示验证，不提前提供迁移题答案。
理解漏洞只修复实际缺口，从 Definition、Principle、Conditions、Transfer 中选需要的维度，不机械增加 Cue 或题量。
记录首次独立完成、有效第一步、实际提示次数与最高层级、卡题时间和跳题决策；用过完整解析或任何提示的正确不算无提示独立完成。`;

export type HintLevel = 1 | 2 | 3 | 4;
/** A successful hint actually revealed to the learner, never a failed request. */
export interface TrainingHintEvent { id: string; level: HintLevel; at: string }
export interface PracticeTrainingEvidence {
  kind?: 'basic' | 'variant' | 'unfamiliar';
  firstStep?: 'yes' | 'no';
  /** Missing means unknown; [] is the learner's explicit zero-hint report. */
  hints?: TrainingHintEvent[];
  stuckMs?: number;
  decision?: 'progress' | 'skip' | 'repeat';
  lossCause?: 'none' | 'knowledge' | 'time' | 'both';
}
export const HINT_LEVEL_LABELS = ['无提示', '概念或公式', '关键关系或适用条件', '局部步骤', '完整解析'] as const;
export function validateTrainingEvidence(value: unknown): PracticeTrainingEvidence {
  const t=value as PracticeTrainingEvidence;
  const fail=()=>{throw Error('独立训练证据无效，请检查提示层级、日期和卡题用时。');};
  if(!t||typeof t!=='object'||Array.isArray(t))fail();
  if(t.kind!==undefined&&!['basic','variant','unfamiliar'].includes(t.kind))fail();
  if(t.firstStep!==undefined&&!['yes','no'].includes(t.firstStep))fail();
  if(t.stuckMs!==undefined&&(!Number.isFinite(t.stuckMs)||t.stuckMs<0||t.stuckMs>86400000))fail();
  if(t.decision!==undefined&&!['progress','skip','repeat'].includes(t.decision))fail();
  if(t.lossCause!==undefined&&!['none','knowledge','time','both'].includes(t.lossCause))fail();
  if(t.hints!==undefined){
    if(!Array.isArray(t.hints)||t.hints.length>100)fail();
    const ids=new Set<string>();
    for(const h of t.hints){if(!h||typeof h.id!=='string'||!h.id||h.id.length>150||ids.has(h.id)||![1,2,3,4].includes(h.level)||typeof h.at!=='string'||!Number.isFinite(Date.parse(h.at)))fail();ids.add(h.id);}
  }
  return structuredClone(t);
}
