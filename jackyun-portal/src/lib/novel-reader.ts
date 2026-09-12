export type NovelLanguage = 'zh' | 'en';
export type NovelReadingMode = 'scroll' | 'paged';

export interface NovelChapter {
  index: number;
  title: string;
  content: string;
  characterCount: number;
}

export interface NovelBookmark {
  id: string;
  chapterIndex: number;
  paragraphIndex: number;
  offsetRatio: number;
  label: string;
  createdAt: string;
}

export interface NovelBook {
  id: string;
  title: string;
  author: string;
  language: NovelLanguage;
  chapterCount: number;
  characterCount: number;
  importedAt: string;
  lastReadAt: string | null;
  currentChapter: number;
  chapterProgress: number;
  chapterScrollTop?: number;
  anchorParagraph?: number;
  anchorOffsetRatio?: number;
  positionUpdatedAt?: string | null;
  overallProgress: number;
  readingSeconds: number;
  sourceFileName: string;
  description?: string;
  category?: string;
  tags?: string[];
  coverDataUrl?: string;
  shelfOrder?: number;
  bookmarks?: NovelBookmark[];
  source?: 'local' | 'store';
  catalogNovelId?: string;
  catalogRevision?: number;
  catalogUpdatedAt?: string;
  catalogCoverUpdatedAt?: string | null;
  readingMode?: NovelReadingMode;
}

const chineseNumber = '[0-9０-９零〇○一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟]+';
const romanNumber = '[ivxlcdm]{1,12}';
const englishWordNumber = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)';
const englishNumber = `(?:[0-9]{1,6}|${romanNumber}|${englishWordNumber})`;
const titleSuffix = '(?:\\s*[-—–:：·、.．|｜_~]?\\s*[^。！？!?]{0,80})?';
const englishTitleSuffix = '(?:\\s*[-—–:：.．|_~]?\\s*[^.!?]{0,80})?';
const chineseChapter = new RegExp(`^(?:正文(?:卷)?\\s*)?第\\s*${chineseNumber}\\s*[章节卷部篇回集幕话夜日册辑季期]${titleSuffix}$`, 'iu');
const compoundChineseChapter = new RegExp(`^(?:(?:第\\s*${chineseNumber}\\s*卷|卷\\s*${chineseNumber})\\s*)?(?:正文(?:卷)?\\s*)?第\\s*${chineseNumber}\\s*[章节回话幕]${titleSuffix}$`, 'iu');
const chineseVolume = new RegExp(`^(?:卷|部|篇|册|辑|幕)\\s*${chineseNumber}${titleSuffix}$|^(?:上|中|下)[篇部卷册]${titleSuffix}$`, 'iu');
const englishChapter = new RegExp(`^(?:chapter|chap\\.?|ch\\.?|book|part|volume|vol\\.?|section|act|scene|episode|story)\\s*(?:no\\.?|number|#)?\\s*${englishNumber}${englishTitleSuffix}$`, 'iu');
const headingText = '\\S[^。！？.!?]{0,58}';
const arabicPunctuatedHeading = new RegExp(`^[0-9０-９]{1,4}\\s*[.．、,:：;；|｜_~—–-]\\s*${headingText}$`, 'iu');
const symbolicPunctuatedHeading = new RegExp(`^(?:[零〇○一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟]+|${romanNumber}|[甲乙丙丁戊己庚辛壬癸])\\s*[.．、,:：;；|｜_~—–-]\\s*${headingText}$`, 'iu');
const bracketedNumberHeading = new RegExp(`^[（(【\\[]\\s*(?:${chineseNumber}|${romanNumber}|${englishWordNumber})\\s*[）)】\\]]\\s*(?:[.．、,:：;；|｜_~—–-]\\s*)?${headingText}$`, 'iu');
const circledNumberHeading = new RegExp(`^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㊀㊁㊂㊃㊄㊅㊆㊇㊈㊉]\\s*${headingText}$`, 'u');
const spacedNumberHeading = new RegExp(`^(?:[0-9０-９]{1,3}|${romanNumber}|${englishWordNumber})\\s+${headingText}$`, 'iu');
const numberOnlyHeading = new RegExp(`^(?:[0-9０-９]{1,5}|${romanNumber}|${englishWordNumber})$`, 'iu');
const specialHeading = /^(?:内容简介|简介|作者序|译者序|出版说明|人物介绍|作品相关|序章|序幕|序言|前言|楔子|引子|正文|终章|终幕|终曲|尾声|大结局|后记|后日谈|间章|幕间|番外(?:篇|章)?(?:\s*[0-9０-９一二三四五六七八九十]+)?|外传(?:\s*[0-9０-９一二三四五六七八九十]+)?|附录(?:\s*[0-9０-９一二三四五六七八九十]+)?|致谢|鸣谢|prologue|epilogue|preface|foreword|introduction|interlude|afterword|appendix|acknowledgements?)(?:(?:\s*[-—–:：.]\s*|\s+)[^。！？.!?]{1,70})?$/iu;

export function detectNovelLanguage(text: string): NovelLanguage {
  const sample = text.slice(0, 100_000);
  const han = sample.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = sample.match(/[A-Za-z]/g)?.length ?? 0;
  return han >= Math.max(20, latin * 0.28) ? 'zh' : 'en';
}

export function detectChapterHeading(line: string): string | null {
  const title = line.trim()
    .replace(/^#{1,6}\s*/u, '')
    .replace(/^[-=*]{3,}\s*/u, '')
    .replace(/^[-*+]\s+(?=(?:第|卷|部|篇|chapter|book|part|section|act|scene|prologue|epilogue))/iu, '')
    .replace(/^[【\[「『](.*)[】\]」』]$/u, '$1')
    .trim();
  if (!title || title.length > 100) return null;
  if (/^[0-9０-９]{3,}:[0-9０-９]{1,2}:[0-9０-９]{1,2}(?:[、，,\s]|$)/u.test(title)) return null;
  if (/^[12][0-9０-９]{3}\s*年(?:[，,、]|\s+\S)/u.test(title)) return null;
  if (/^[0-9０-９]+\\[.)．、]/u.test(title)) return null;
  if (
    chineseChapter.test(title) || compoundChineseChapter.test(title) || chineseVolume.test(title) ||
    englishChapter.test(title) || specialHeading.test(title) || arabicPunctuatedHeading.test(title) || symbolicPunctuatedHeading.test(title) ||
    bracketedNumberHeading.test(title) || circledNumberHeading.test(title) || spacedNumberHeading.test(title) ||
    numberOnlyHeading.test(title)
  ) return title;
  return null;
}

type HeadingFamily = 'strong' | 'special' | 'arabic-punctuated' | 'symbolic-punctuated' | 'bracketed' | 'circled' | 'spaced' | 'number-only';

function chapterHeadingFamily(title: string): HeadingFamily {
  if (specialHeading.test(title)) return 'special';
  if (chineseChapter.test(title) || compoundChineseChapter.test(title) || chineseVolume.test(title) || englishChapter.test(title)) return 'strong';
  if (arabicPunctuatedHeading.test(title)) return 'arabic-punctuated';
  if (symbolicPunctuatedHeading.test(title)) return 'symbolic-punctuated';
  if (bracketedNumberHeading.test(title)) return 'bracketed';
  if (circledNumberHeading.test(title)) return 'circled';
  if (spacedNumberHeading.test(title)) return 'spaced';
  return 'number-only';
}

function arabicHeadingNumber(title: string): number {
  const digits = title.match(/^[0-9０-９]+/u)?.[0] ?? '';
  return Number(digits.replace(/[０-９]/gu, (digit) => String(digit.charCodeAt(0) - 0xFF10)));
}

function longestIncreasingHeadingIndexes(candidates: Array<{ title: string }>): Set<number> | null {
  if (candidates.length < 3) return null;
  const tails: number[] = [];
  const tailIndexes: number[] = [];
  const previous = new Array<number>(candidates.length).fill(-1);
  candidates.forEach((candidate, index) => {
    const value = arabicHeadingNumber(candidate.title);
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tailIndexes[low - 1];
    tails[low] = value;
    tailIndexes[low] = index;
  });
  if (tails.length < 3) return null;
  const selected = new Set<number>();
  let cursor = tailIndexes[tails.length - 1];
  while (cursor >= 0) {
    selected.add(cursor);
    cursor = previous[cursor];
  }
  return selected;
}

function fallbackChunks(text: string, targetSize: number): NovelChapter[] {
  const paragraphs = text.split(/\n\s*\n/u).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (current && current.length + paragraph.length > targetSize) {
      chunks.push(current);
      current = '';
    }
    if (paragraph.length > targetSize * 1.8) {
      if (current) chunks.push(current);
      for (let offset = 0; offset < paragraph.length; offset += targetSize) chunks.push(paragraph.slice(offset, offset + targetSize));
      current = '';
    } else {
      current += `${current ? '\n\n' : ''}${paragraph}`;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((content, index) => ({ index, title: `第 ${index + 1} 节`, content, characterCount: content.length }));
}

export function splitNovelIntoChapters(raw: string, targetFallbackSize = 30_000): NovelChapter[] {
  const text = raw.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim();
  if (!text) return [];

  const candidates: Array<{ offset: number; contentStart: number; title: string; family: HeadingFamily }> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const title = detectChapterHeading(line);
    if (title) candidates.push({ offset, contentStart: offset + line.length + (offset + line.length < text.length ? 1 : 0), title, family: chapterHeadingFamily(title) });
    offset += line.length + 1;
  }

  if (!candidates.length) return fallbackChunks(text, targetFallbackSize);

  const strongCount = candidates.filter((candidate) => candidate.family === 'strong').length;
  const looseCounts = new Map<HeadingFamily, number>();
  candidates.forEach((candidate) => {
    if (candidate.family !== 'strong' && candidate.family !== 'special') looseCounts.set(candidate.family, (looseCounts.get(candidate.family) ?? 0) + 1);
  });
  const dominantLoose = Array.from(looseCounts.entries()).sort((left, right) => right[1] - left[1])[0];
  const arabicCandidates = candidates.filter((candidate) => candidate.family === 'arabic-punctuated');
  const increasingArabicIndexes = longestIncreasingHeadingIndexes(arabicCandidates);
  let arabicIndex = -1;
  const matches = candidates.filter((candidate) => {
    if (candidate.family === 'arabic-punctuated') arabicIndex += 1;
    if (candidate.family === 'strong' || candidate.family === 'special') return true;
    if (strongCount >= 2) return false;
    if (dominantLoose && dominantLoose[1] >= 2) {
      if (candidate.family !== dominantLoose[0]) return false;
      if (candidate.family === 'arabic-punctuated' && increasingArabicIndexes) return increasingArabicIndexes.has(arabicIndex);
      return true;
    }
    return true;
  });

  const chapters: NovelChapter[] = [];
  const frontMatter = text.slice(0, matches[0].offset).trim();
  if (frontMatter) chapters.push({ index: 0, title: '卷首', content: frontMatter, characterCount: frontMatter.length });
  matches.forEach((match, matchIndex) => {
    const nextOffset = matches[matchIndex + 1]?.offset ?? text.length;
    const content = text.slice(match.contentStart, nextOffset).trim();
    chapters.push({ index: chapters.length, title: match.title, content, characterCount: content.length });
  });
  return chapters.filter((chapter) => chapter.content || chapter.title).map((chapter, index) => ({ ...chapter, index }));
}

export function calculateNovelProgress(chapterIndex: number, chapterProgress: number, chapterCount: number): number {
  if (chapterCount <= 0) return 0;
  const safeChapter = Math.min(chapterCount - 1, Math.max(0, chapterIndex));
  const safeProgress = Number.isFinite(chapterProgress) ? Math.min(1, Math.max(0, chapterProgress)) : 0;
  return Math.min(1, Math.max(0, (safeChapter + safeProgress) / chapterCount));
}

export function calculateNovelProgressByCharacters(chapterIndex: number, chapterProgress: number, chapterLengths: number[]): number {
  if (!chapterLengths.length) return 0;
  const safeChapter = Math.min(chapterLengths.length - 1, Math.max(0, chapterIndex));
  const safeProgress = Number.isFinite(chapterProgress) ? Math.min(1, Math.max(0, chapterProgress)) : 0;
  const total = chapterLengths.reduce((sum, length) => sum + Math.max(0, length), 0);
  if (!total) return calculateNovelProgress(safeChapter, safeProgress, chapterLengths.length);
  const completed = chapterLengths.slice(0, safeChapter).reduce((sum, length) => sum + Math.max(0, length), 0);
  return Math.min(1, Math.max(0, (completed + Math.max(0, chapterLengths[safeChapter]) * safeProgress) / total));
}

export function inferNovelTitle(fileName: string): string {
  return fileName.replace(/\.(?:txt|text|md|markdown|html?|epub)$/iu, '').replace(/[_-]+/gu, ' ').trim() || '未命名小说';
}
