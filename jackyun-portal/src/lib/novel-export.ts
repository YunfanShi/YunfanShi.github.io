import type { NovelChapter } from './novel-reader.ts';

export function novelTxtFileName(title: string): string {
  const name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').replace(/[. ]+$/u, '').trim();
  return `${name || '图书'}.txt`;
}

export function novelToTxt(book: { title: string; author: string }, chapters: NovelChapter[]): string {
  if (!chapters.length || !chapters.some((chapter) => chapter.content.trim())) throw new Error('没有可下载的正文。');
  const sections = [...chapters].sort((left, right) => left.index - right.index).map((chapter) => {
    const content = chapter.content.replace(/\r\n?/gu, '\n');
    const title = chapter.title.trim();
    // TXT imports can already contain their heading; EPUB chapters may not.
    return content.trimStart().split('\n', 1)[0].trim() === title || !title ? content : `${title}\n\n${content}`;
  });
  return `\uFEFF${[book.title, ...(book.author ? [`作者：${book.author}`] : []), ...sections].join('\n\n').replace(/\r\n?/gu, '\n').replace(/\n/gu, '\r\n')}\r\n`;
}
