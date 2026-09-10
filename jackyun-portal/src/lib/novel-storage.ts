import type { NovelBook, NovelChapter } from './novel-reader';

const DB_NAME = 'jackyun_novel_library';
const DB_VERSION = 1;
const BOOKS_STORE = 'books';
const CHAPTERS_STORE = 'chapters';

interface StoredChapter extends NovelChapter { bookId: string; key: string; }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOKS_STORE)) database.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(CHAPTERS_STORE)) {
        const store = database.createObjectStore(CHAPTERS_STORE, { keyPath: 'key' });
        store.createIndex('bookId', 'bookId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地小说数据库。'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地小说数据库操作失败。'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('本地小说数据库写入失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('本地小说数据库写入已中止。'));
  });
}

export async function listNovelBooks(): Promise<NovelBook[]> {
  const database = await openDatabase();
  try {
    return await requestResult(database.transaction(BOOKS_STORE, 'readonly').objectStore(BOOKS_STORE).getAll()) as NovelBook[];
  } finally {
    database.close();
  }
}

export async function saveNovelBook(book: NovelBook, chapters: NovelChapter[]): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BOOKS_STORE, CHAPTERS_STORE], 'readwrite');
    transaction.objectStore(BOOKS_STORE).put(book);
    const chapterStore = transaction.objectStore(CHAPTERS_STORE);
    chapters.forEach((chapter) => chapterStore.put({ ...chapter, bookId: book.id, key: `${book.id}:${chapter.index}` } satisfies StoredChapter));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function updateNovelBook(book: NovelBook): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BOOKS_STORE, 'readwrite');
    transaction.objectStore(BOOKS_STORE).put(book);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getNovelChapter(bookId: string, chapterIndex: number): Promise<NovelChapter | null> {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(CHAPTERS_STORE, 'readonly').objectStore(CHAPTERS_STORE).get(`${bookId}:${chapterIndex}`)) as StoredChapter | undefined;
    return value ? { index: value.index, title: value.title, content: value.content, characterCount: value.characterCount } : null;
  } finally {
    database.close();
  }
}

export async function listNovelChapterHeadings(bookId: string): Promise<Array<Pick<NovelChapter, 'index' | 'title' | 'characterCount'>>> {
  const database = await openDatabase();
  try {
    const store = database.transaction(CHAPTERS_STORE, 'readonly').objectStore(CHAPTERS_STORE).index('bookId');
    const chapters = await requestResult(store.getAll(IDBKeyRange.only(bookId))) as StoredChapter[];
    return chapters.sort((left, right) => left.index - right.index).map(({ index, title, characterCount }) => ({ index, title, characterCount }));
  } finally {
    database.close();
  }
}

export async function deleteNovelBook(bookId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([BOOKS_STORE, CHAPTERS_STORE], 'readwrite');
    transaction.objectStore(BOOKS_STORE).delete(bookId);
    const index = transaction.objectStore(CHAPTERS_STORE).index('bookId');
    const keys = await requestResult(index.getAllKeys(IDBKeyRange.only(bookId)));
    keys.forEach((key) => transaction.objectStore(CHAPTERS_STORE).delete(key));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
