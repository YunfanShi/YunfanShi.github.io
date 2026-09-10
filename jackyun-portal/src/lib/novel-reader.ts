export type NovelLanguage = 'zh' | 'en';

export interface NovelChapter {
  index: number;
  title: string;
  content: string;
  characterCount: number;
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
const headingText = '\\S[^。！？.!?]{0,78}';
const punctuatedNumberHeading = new RegExp(`^(?:${chineseNumber}|${romanNumber}|[甲乙丙丁戊己庚辛壬癸])\\s*[.．、,:：;；|｜_~—–-]\\s*${headingText}$`, 'iu');
const bracketedNumberHeading = new RegExp(`^[（(【\\[]\\s*(?:${chineseNumber}|${romanNumber}|${englishWordNumber})\\s*[）)】\\]]\\s*(?:[.．、,:：;；|｜_~—–-]\\s*)?${headingText}$`, 'iu');
const circledNumberHeading = new RegExp(`^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㊀㊁㊂㊃㊄㊅㊆㊇㊈㊉]\\s*${headingText}$`, 'u');
const spacedNumberHeading = new RegExp(`^(?:[0-9０-９]{1,5}|${romanNumber}|${englishWordNumber})\\s+${headingText}$`, 'iu');
const numberOnlyHeading = new RegExp(`^(?:[0-9０-９]{1,5}|${romanNumber}|${englishWordNumber})$`, 'iu');
const specialHeading = /^(?:内容简介|简介|作者序|译者序|出版说明|人物介绍|作品相关|序章|序幕|序言|前言|楔子|引子|正文|终章|终幕|终曲|尾声|大结局|后记|后日谈|间章|幕间|番外(?:篇|章)?(?:\s*[0-9０-９一二三四五六七八九十]+)?|外传(?:\s*[0-9０-９一二三四五六七八九十]+)?|附录(?:\s*[0-9０-９一二三四五六七八九十]+)?|致谢|鸣谢|prologue|epilogue|preface|foreword|introduction|interlude|afterword|appendix|acknowledgements?)(?:\s*[-—–:：.]?\s*[^。！？.!?]{0,70})?$/iu;

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
  if (
    chineseChapter.test(title) || compoundChineseChapter.test(title) || chineseVolume.test(title) ||
    englishChapter.test(title) || specialHeading.test(title) || punctuatedNumberHeading.test(title) ||
    bracketedNumberHeading.test(title) || circledNumberHeading.test(title) || spacedNumberHeading.test(title) ||
    numberOnlyHeading.test(title)
  ) return title;
  return null;
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

  const matches: Array<{ offset: number; contentStart: number; title: string }> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const title = detectChapterHeading(line);
    if (title) matches.push({ offset, contentStart: offset + line.length + (offset + line.length < text.length ? 1 : 0), title });
    offset += line.length + 1;
  }

  if (!matches.length) return fallbackChunks(text, targetFallbackSize);

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
  return fileName.replace(/\.(?:txt|text|md|markdown)$/iu, '').replace(/[_-]+/gu, ' ').trim() || '未命名小说';
}
