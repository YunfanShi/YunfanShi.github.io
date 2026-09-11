import JSZip from 'jszip';
import { inferNovelTitle, type NovelChapter } from './novel-reader.ts';

export const NOVEL_FILE_ACCEPT = '.txt,.text,.md,.markdown,.html,.htm,.epub,text/plain,text/markdown,text/html,application/epub+zip';
export const NOVEL_FILE_FORMATS = ['txt', 'text', 'md', 'markdown', 'html', 'htm', 'epub'] as const;

export interface ParsedNovelFile {
  title: string;
  author: string;
  text: string;
  chapters: NovelChapter[] | null;
}

function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLocaleLowerCase() ?? '';
}

export function isSupportedNovelFile(fileName: string): boolean {
  return (NOVEL_FILE_FORMATS as readonly string[]).includes(fileExtension(fileName));
}

function decodeEntities(value: string): string {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html').body.textContent ?? '';
  }
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function htmlToNovelText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)
    ?? html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)
    ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/gu, '')).trim() : '';
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu)?.[1] ?? html;
  const text = decodeEntities(body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|section|article|blockquote|li|h[1-6])\s*>/giu, '\n\n')
    .replace(/<li\b[^>]*>/giu, '• ')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
  return { title, text };
}

function attribute(attributes: string, name: string): string {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu'));
  return match?.[2] ?? '';
}

function xmlText(xml: string, localName: string): string {
  const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${localName}>`, 'iu'));
  return match ? decodeEntities(match[1].replace(/<[^>]+>/gu, '')).trim() : '';
}

function resolveArchivePath(baseFile: string, relativePath: string): string {
  const base = baseFile.split('/').slice(0, -1);
  const cleanRelative = decodeURIComponent(relativePath.split('#')[0]);
  for (const part of cleanRelative.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base.join('/');
}

async function parseEpub(file: File): Promise<ParsedNovelFile> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const containerEntry = archive.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('EPUB 缺少 META-INF/container.xml。');
  const container = await containerEntry.async('string');
  const rootfileTag = container.match(/<(?:[\w.-]+:)?rootfile\b([^>]*)\/?>/iu);
  const packagePath = rootfileTag ? attribute(rootfileTag[1], 'full-path') : '';
  if (!packagePath) throw new Error('EPUB 没有有效的 OPF 包路径。');
  const packageEntry = archive.file(packagePath);
  if (!packageEntry) throw new Error('EPUB 的 OPF 包文件不存在。');
  const packageXml = await packageEntry.async('string');

  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const match of packageXml.matchAll(/<(?:[\w.-]+:)?item\b([^>]*)\/?>/giu)) {
    const id = attribute(match[1], 'id');
    const href = attribute(match[1], 'href');
    if (id && href) manifest.set(id, { href, mediaType: attribute(match[1], 'media-type') });
  }
  const spineIds = Array.from(packageXml.matchAll(/<(?:[\w.-]+:)?itemref\b([^>]*)\/?>/giu))
    .map((match) => attribute(match[1], 'idref'))
    .filter(Boolean);
  if (!spineIds.length) throw new Error('EPUB 没有可读取的正文顺序。');

  const chapters: NovelChapter[] = [];
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item || !/xhtml|html|xml/iu.test(item.mediaType)) continue;
    const path = resolveArchivePath(packagePath, item.href);
    const entry = archive.file(path);
    if (!entry) continue;
    const parsed = htmlToNovelText(await entry.async('string'));
    if (!parsed.text) continue;
    chapters.push({
      index: chapters.length,
      title: parsed.title || `第 ${chapters.length + 1} 章`,
      content: parsed.text,
      characterCount: parsed.text.length,
    });
  }
  if (!chapters.length) throw new Error('EPUB 正文为空，或使用了暂不支持的加密内容。');
  return {
    title: xmlText(packageXml, 'title') || inferNovelTitle(file.name),
    author: xmlText(packageXml, 'creator'),
    text: chapters.map((chapter) => chapter.content).join('\n\n'),
    chapters,
  };
}

async function decodeTextFile(file: File, encoding: 'auto' | 'utf-8' | 'gb18030'): Promise<string> {
  const bytes = await file.arrayBuffer();
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

export async function parseNovelFile(file: File, encoding: 'auto' | 'utf-8' | 'gb18030'): Promise<ParsedNovelFile> {
  const extension = fileExtension(file.name);
  if (!isSupportedNovelFile(file.name)) throw new Error(`不支持 .${extension || '未知'} 格式。`);
  if (extension === 'epub') return parseEpub(file);
  const source = await decodeTextFile(file, encoding);
  if (extension === 'html' || extension === 'htm') {
    const parsed = htmlToNovelText(source);
    const documentTitle = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
    return { title: documentTitle ? decodeEntities(documentTitle.replace(/<[^>]+>/gu, '')).trim() : (parsed.title || inferNovelTitle(file.name)), author: '', text: parsed.text, chapters: null };
  }
  return { title: inferNovelTitle(file.name), author: '', text: source, chapters: null };
}
