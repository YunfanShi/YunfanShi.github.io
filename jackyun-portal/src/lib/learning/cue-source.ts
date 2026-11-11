export type CueExamStatus = 'unknown' | 'tested' | 'not-tested';
export interface CueSourceFields {
  examStatus?: CueExamStatus;
  /** Exam board, year/session, paper, and question; supplied evidence only. */
  examHistory?: string;
  /** ChatGPT, book, teacher, website, or another specific source type. */
  sourceKind?: string;
  /** Actual book/edition, lesson, document, or conversation title. */
  source?: string;
  sourceLocation?: string;
  sourceUrl?: string;
}

export function parseCueSourceFields(value: Record<string, unknown>): CueSourceFields {
  const result: CueSourceFields = {};
  for (const [key, limit] of [['sourceKind', 80], ['source', 1000], ['sourceLocation', 300], ['sourceUrl', 2000], ['examHistory', 1000]] as const) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) continue;
    if (typeof value[key] !== 'string') throw new Error(`CUE ${key} 必须是文字。`);
    const text = value[key].trim();
    if (text.length > limit) throw new Error(`CUE ${key} 最多 ${limit} 个字符。`);
    if (key === 'sourceUrl' && text) {
      let url: URL;
      try { url = new URL(text); } catch { throw new Error('CUE 来源链接必须是完整的 http/https URL。'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('CUE 来源链接只允许 http/https。');
    }
    result[key] = text;
  }
  if (value.examStatus !== undefined) {
    if (typeof value.examStatus !== 'string' || !['unknown', 'tested', 'not-tested'].includes(value.examStatus)) throw new Error('examStatus 必须是 unknown、tested 或 not-tested。');
    result.examStatus = value.examStatus as CueExamStatus;
  }
  return result;
}

export function cueSourceLabel(cue: CueSourceFields): string {
  return [cue.sourceKind, cue.source, cue.sourceLocation].filter(value => typeof value === 'string' && value.trim()).join(' · ');
}

export const cueExamLabels: Record<CueExamStatus, string> = { unknown: '未标注', tested: '考过', 'not-tested': '尚未考过' };
