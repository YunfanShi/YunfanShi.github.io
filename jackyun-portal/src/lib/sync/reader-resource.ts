import type { NovelBook } from '../novel-reader.ts';

export const READER_BOOK_KEY_PREFIX = 'jackyun_reader_book_v1:';
const bookIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

export type ReaderBookProjection = {
  version: 1;
  bookId: string;
  metadata: NovelBook;
  onShelf: boolean;
  updatedAt: string;
};

export function readerBookStorageKey(bookId: string): string | null {
  return bookIdPattern.test(bookId) ? `${READER_BOOK_KEY_PREFIX}${bookId}` : null;
}

export function serializeReaderBook(book: NovelBook, onShelf = true, updatedAt = new Date().toISOString()): string {
  if (!readerBookStorageKey(book.id)) throw new Error('阅读记录缺少有效的书籍 ID。');
  const metadata = { ...book };
  delete metadata.coverDataUrl;
  return JSON.stringify({ version: 1, bookId: book.id, metadata, onShelf, updatedAt } satisfies ReaderBookProjection);
}

export function parseReaderBookProjection(key: string, raw: string): ReaderBookProjection | null {
  if (!key.startsWith(READER_BOOK_KEY_PREFIX)) return null;
  const bookId = key.slice(READER_BOOK_KEY_PREFIX.length);
  if (!readerBookStorageKey(bookId)) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReaderBookProjection>;
    const metadata = value.metadata;
    if (value.version !== 1 || value.bookId !== bookId || !metadata || metadata.id !== bookId
      || typeof metadata.title !== 'string' || typeof metadata.author !== 'string'
      || !['en', 'zh'].includes(metadata.language) || !Number.isSafeInteger(metadata.chapterCount) || metadata.chapterCount < 0
      || !Number.isFinite(metadata.currentChapter) || !Number.isFinite(metadata.chapterProgress)
      || metadata.chapterProgress < 0 || metadata.chapterProgress > 1 || !Number.isFinite(metadata.overallProgress)
      || !Number.isFinite(metadata.readingSeconds) || typeof metadata.sourceFileName !== 'string'
      || typeof metadata.importedAt !== 'string' || typeof value.onShelf !== 'boolean'
      || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    const safeMetadata = { ...metadata };
    delete safeMetadata.coverDataUrl;
    return { version: 1, bookId, metadata: safeMetadata, onShelf: value.onShelf, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}
