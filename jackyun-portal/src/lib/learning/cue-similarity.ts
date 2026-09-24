import type { StudyCue } from './schedule-control';

const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'can', 'could', 'do', 'does', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'how', 'i', 'in', 'into', 'is', 'it', 'its',
  'of', 'on', 'or', 'our', 'ours', 'she', 'that', 'the', 'their', 'theirs', 'them', 'these', 'they',
  'this', 'those', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you',
  'your', 'yours',
]);

export interface SimilarCuePair {
  left: StudyCue;
  right: StudyCue;
  similarity: number;
  promptSimilarity: number;
  answerSimilarity?: number;
  sharedTerms: string[];
  sharedPromptTerms: string[];
  sharedAnswerTerms: string[];
  leftTermCount: number;
  rightTermCount: number;
}

function stemEnglishWord(word: string): string {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3).replace(/(.)\1$/u, '$1');
  if (word.length > 4 && word.endsWith('ed')) {
    const base = word.slice(0, -2).replace(/(.)\1$/u, '$1');
    return base.endsWith('s') ? `${base}e` : base;
  }
  if (word.length > 4 && word.endsWith('es')) {
    const base = word.slice(0, -2);
    return base.endsWith('s') ? `${base}e` : base;
  }
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function normalizedPrompt(prompt: string): string {
  return prompt
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\\(?:left|right|mathrm|text|operatorname)\b/gu, ' ')
    .replace(/\bwhat\s+(?:is|are)\b/gu, ' define ')
    .replace(/\bgive\s+(?:the\s+)?definition\s+of\b/gu, ' define ')
    .replace(/\bwhy\s+(?:does|do|is|are)\b/gu, ' explain ');
}

/** Returns comparison terms only; common grammar words never contribute to a similarity score. */
export function cueSimilarityTerms(prompt: string): string[] {
  const normalized = normalizedPrompt(prompt);
  const terms: string[] = [];
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
    const value = match[0];
    if (/^\p{Script=Han}+$/u.test(value)) {
      const characters = [...value];
      if (characters.length === 1) terms.push(value);
      else for (let index = 0; index < characters.length - 1; index += 1) terms.push(`${characters[index]}${characters[index + 1]}`);
      continue;
    }
    if (ENGLISH_STOP_WORDS.has(value)) continue;
    const term = stemEnglishWord(value);
    if (!ENGLISH_STOP_WORDS.has(term) && (term.length > 1 || /^\d+$/u.test(term))) terms.push(term);
  }
  return [...new Set(terms)];
}

export function cuePromptSimilarity(leftPrompt: string, rightPrompt: string): { similarity: number; sharedTerms: string[]; leftTermCount: number; rightTermCount: number } {
  const leftTerms = cueSimilarityTerms(leftPrompt);
  const rightTerms = cueSimilarityTerms(rightPrompt);
  if (!leftTerms.length || !rightTerms.length) return { similarity: 0, sharedTerms: [], leftTermCount: leftTerms.length, rightTermCount: rightTerms.length };
  const rightSet = new Set(rightTerms);
  const sharedTerms = leftTerms.filter((term) => rightSet.has(term));
  const minimumCount = Math.min(leftTerms.length, rightTerms.length);
  if (!sharedTerms.length || minimumCount >= 3 && sharedTerms.length < 2) return { similarity: 0, sharedTerms, leftTermCount: leftTerms.length, rightTermCount: rightTerms.length };
  const dice = (2 * sharedTerms.length) / (leftTerms.length + rightTerms.length);
  const coverage = sharedTerms.length / minimumCount;
  return {
    similarity: Math.round((dice * 0.7 + coverage * 0.3) * 100),
    sharedTerms,
    leftTermCount: leftTerms.length,
    rightTermCount: rightTerms.length,
  };
}

/** Finds likely duplicates inside one subject. The default 72% threshold intentionally favors precision. */
export function findSimilarCuePairs(cues: StudyCue[], threshold = 72): SimilarCuePair[] {
  const pairs: SimilarCuePair[] = [];
  for (let leftIndex = 0; leftIndex < cues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cues.length; rightIndex += 1) {
      const left = cues[leftIndex];
      const right = cues[rightIndex];
      if (left.subjectId !== right.subjectId && left.subjectName !== right.subjectName) continue;
      const promptResult = cuePromptSimilarity(left.prompt, right.prompt);
      if (promptResult.similarity < threshold) continue;
      const answerResult = cuePromptSimilarity(left.answer ?? '', right.answer ?? '');
      const answersComparable = Boolean(left.answer?.trim() && right.answer?.trim() && answerResult.leftTermCount && answerResult.rightTermCount);
      if (answersComparable && answerResult.similarity < 60) continue;
      const similarity = answersComparable ? Math.round(promptResult.similarity * 0.6 + answerResult.similarity * 0.4) : promptResult.similarity;
      if (similarity < threshold) continue;
      pairs.push({
        left,
        right,
        similarity,
        promptSimilarity: promptResult.similarity,
        ...(answersComparable ? { answerSimilarity: answerResult.similarity } : {}),
        sharedTerms: [...new Set([...promptResult.sharedTerms, ...answerResult.sharedTerms])],
        sharedPromptTerms: promptResult.sharedTerms,
        sharedAnswerTerms: answerResult.sharedTerms,
        leftTermCount: promptResult.leftTermCount,
        rightTermCount: promptResult.rightTermCount,
      });
    }
  }
  return pairs.toSorted((left, right) => right.similarity - left.similarity || left.left.createdAt.localeCompare(right.left.createdAt) || left.left.id.localeCompare(right.left.id));
}

export function cueSimilarityTermKey(value: string): string {
  const [term = ''] = cueSimilarityTerms(value);
  return term;
}
