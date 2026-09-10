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
  overallProgress: number;
  readingSeconds: number;
  sourceFileName: string;
}

const chineseNumber = '[0-9０-９零〇○一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟]+';
const englishNumber = '(?:[0-9]{1,6}|[ivxlcdm]{1,12}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
const chineseChapter = new RegExp(`^(?:正文(?:卷)?\\s*)?第\\s*${chineseNumber}\\s*[章节卷部篇回集幕](?:\\s*[-—–:：·、.]?\\s*[^。！？!?]{0,80})?$`, 'iu');
const chineseVolume = new RegExp(`^(?:卷|部|篇)\\s*${chineseNumber}(?:\\s*[-—–:：·、.]?\\s*[^。！？!?]{0,80})?$`, 'iu');
const englishChapter = new RegExp(`^(?:chapter|chap\\.?|book|part|volume)\\s+${englishNumber}(?:\\s*[-—–:：.]?\\s*[^.!?]{0,80})?$`, 'iu');
const numberedHeading = new RegExp(`^(?:${chineseNumber}|[IVXLCDM]{1,12})\\s*[.、:：-]\\s*\\S.{0,70}$|^[0-9０-９]{1,5}\\s+\\S.{0,70}$`, 'iu');
const specialHeading = /^(?:序章|序言|前言|楔子|引子|正文|终章|尾声|后记|番外(?:篇|章)?(?:\s*\d+)?|外传(?:\s*\d+)?|附录(?:\s*\d+)?|prologue|epilogue|preface|foreword|introduction|interlude|afterword|appendix)(?:\s*[-—–:：.]?\s*[^。！？.!?]{0,70})?$/iu;

export function detectNovelLanguage(text: string): NovelLanguage {
  const sample = text.slice(0, 100_000);
  const han = sample.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = sample.match(/[A-Za-z]/g)?.length ?? 0;
  return han >= Math.max(20, latin * 0.28) ? 'zh' : 'en';
}

export function detectChapterHeading(line: string): string | null {
  const title = line.trim().replace(/^#{1,6}\s+/u, '').replace(/^[-=*]{3,}\s*/u, '').replace(/^[【\[「『](.*)[】\]」』]$/u, '$1').trim();
  if (!title || title.length > 100) return null;
  if (chineseChapter.test(title) || chineseVolume.test(title) || englishChapter.test(title) || specialHeading.test(title) || numberedHeading.test(title)) return title;
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

export function inferNovelTitle(fileName: string): string {
  return fileName.replace(/\.(?:txt|text|md|markdown)$/iu, '').replace(/[_-]+/gu, ' ').trim() || '未命名小说';
}
