"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import Link from "next/link";
import type { CatalogNovel, ReaderBootstrap } from "@/actions/reader";
import { NOVEL_FILE_ACCEPT, parseNovelFile } from "@/lib/novel-import";
import {
  calculateNovelProgressByCharacters,
  detectNovelLanguage,
  splitNovelIntoChapters,
  type NovelBook,
  type NovelChapter,
  type NovelReadingMode,
} from "@/lib/novel-reader";
import {
  deleteNovelBook,
  getNovelChapter,
  listNovelBooks,
  listNovelChapterHeadings,
  listNovelChapters,
  replaceNovelChapters,
  saveNovelBook,
  updateNovelBook,
} from "@/lib/novel-storage";
import { createClient } from "@/lib/supabase/client";

type View = "shelf" | "store" | "reader";
type CloudRow = {
  book_id: string;
  metadata: NovelBook;
  storage_path: string;
  content_hash: string;
  updated_at: string;
};
const planStyle: Record<string, string> = {
  free: "bg-[#ecfdf3] text-[#027a48]",
  plus: "bg-[#eff8ff] text-[#175cd3]",
  pro: "bg-[#f4f3ff] text-[#6941c6]",
  ultra: "bg-[#101828] text-white",
};

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `book-${Date.now()}`;
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatProgress(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
function cloudPath(userId: string, bookId: string) {
  return `users/${userId}/${bookId}.json`;
}

function cloudSafeBook(book: NovelBook): NovelBook {
  const copy = { ...book };
  delete copy.coverDataUrl;
  return copy;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("封面读取失败。"));
    reader.readAsDataURL(blob);
  });
}

async function downloadCatalogChapters(
  novel: CatalogNovel,
): Promise<NovelChapter[]> {
  if (novel.chaptersReady) {
    const response = await fetch(`/api/reader/novels/${novel.id}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as { chapters?: NovelChapter[] };
      if (payload.chapters?.length) return payload.chapters;
    }
  }
  if (!novel.downloadUrl) throw new Error("下载链接已失效，请刷新页面后重试。");
  const response = await fetch(novel.downloadUrl);
  if (!response.ok) throw new Error("下载链接已失效，请刷新页面后重试。");
  const file = new File([await response.blob()], novel.originalFileName);
  const parsed = await parseNovelFile(file, "auto");
  return parsed.chapters ?? splitNovelIntoChapters(parsed.text);
}

async function contentHash(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function uploadCloudBook(
  userId: string,
  book: NovelBook,
  chapters: NovelChapter[],
) {
  const supabase = createClient();
  const path = cloudPath(userId, book.id);
  const safeBook = cloudSafeBook(book);
  const blob = new Blob(
    [JSON.stringify({ version: 1, book: safeBook, chapters })],
    {
      type: "application/json",
    },
  );
  const hash = await contentHash(blob);
  const upload = await supabase.storage
    .from("novel-files")
    .upload(path, blob, { contentType: "application/json", upsert: true });
  if (upload.error) throw upload.error;
  const { error } = await supabase.from("reader_books").upsert(
    {
      user_id: userId,
      book_id: book.id,
      metadata: safeBook,
      storage_path: path,
      content_hash: hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );
  if (error) throw error;
}

async function updateCloudMetadata(userId: string, book: NovelBook) {
  const { error } = await createClient()
    .from("reader_books")
    .update({
      metadata: cloudSafeBook(book),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("book_id", book.id);
  if (error) throw error;
}

async function downloadCloudBook(row: CloudRow): Promise<NovelBook | null> {
  const { data, error } = await createClient()
    .storage.from("novel-files")
    .download(row.storage_path);
  if (error || !data) return null;
  const payload = JSON.parse(await data.text()) as {
    book?: NovelBook;
    chapters?: NovelChapter[];
  };
  if (!payload.book || !Array.isArray(payload.chapters)) return null;
  const book = { ...payload.book, ...row.metadata };
  await saveNovelBook(book, payload.chapters);
  return book;
}

function planName(plan: string) {
  return plan === "free" ? "免费" : `${plan.toUpperCase()}+`;
}

export default function NovelWorkbench({
  bootstrap,
}: {
  bootstrap: ReaderBootstrap;
}) {
  const [view, setView] = useState<View>("shelf");
  const [books, setBooks] = useState<NovelBook[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [chapter, setChapter] = useState<NovelChapter | null>(null);
  const [chapterHeadings, setChapterHeadings] = useState<
    Array<Pick<NovelChapter, "index" | "title" | "characterCount">>
  >([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<"all" | "zh" | "en">(
    "all",
  );
  const [tagFilter, setTagFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "store">(
    "all",
  );
  const [fontSize, setFontSize] = useState(19);
  const [night, setNight] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const [readingMode, setReadingMode] = useState<NovelReadingMode>("scroll");
  const [readerWidth, setReaderWidth] = useState(720);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const readerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const metadataTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = books.find((book) => book.id === currentId) ?? null;
  const storeEnabled = bootstrap.features.novel_store?.allowed === true;
  const storeIds = useMemo(
    () =>
      new Set(
        books.map(
          (book) => book.catalogNovelId ?? book.id.replace(/^catalog-/u, ""),
        ),
      ),
    [books],
  );

  const syncLibrary = useCallback(
    async (localBooks: NovelBook[]) => {
      if (!bootstrap.userId) return localBooks;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reader_books")
        .select("book_id, metadata, storage_path, content_hash, updated_at")
        .eq("user_id", bootstrap.userId);
      if (error) throw error;
      const localMap = new Map(localBooks.map((book) => [book.id, book]));
      const merged = [...localBooks];
      for (const row of (data ?? []) as CloudRow[]) {
        const local = localMap.get(row.book_id);
        if (!local) {
          const downloaded = await downloadCloudBook(row);
          if (downloaded) {
            merged.push(downloaded);
            localMap.set(downloaded.id, downloaded);
          }
          continue;
        }
        const localPosition = local.positionUpdatedAt ?? "";
        const cloudPosition = row.metadata.positionUpdatedAt ?? "";
        if (cloudPosition > localPosition) {
          const updated = { ...local, ...row.metadata };
          await updateNovelBook(updated);
          const index = merged.findIndex((book) => book.id === updated.id);
          merged[index] = updated;
        } else if (localPosition > cloudPosition)
          await updateCloudMetadata(bootstrap.userId, local);
      }
      const catalogById = new Map(
        bootstrap.catalog.map((novel) => [novel.id, novel]),
      );
      for (let index = 0; index < merged.length; index += 1) {
        const book = merged[index];
        const catalogId =
          book.catalogNovelId ??
          (book.id.startsWith("catalog-") ? book.id.slice(8) : null);
        const novel = catalogId ? catalogById.get(catalogId) : null;
        if (!novel) continue;
        let chaptersChanged = false;
        let coverDataUrl = book.coverDataUrl;
        if ((book.catalogRevision ?? 0) < novel.contentRevision) {
          const chapters = await downloadCatalogChapters(novel);
          const oldChapter = await getNovelChapter(
            book.id,
            book.currentChapter,
          );
          const matchingIndex = oldChapter
            ? chapters.findIndex((item) => item.title === oldChapter.title)
            : -1;
          await replaceNovelChapters(book.id, chapters);
          book.currentChapter =
            matchingIndex >= 0
              ? matchingIndex
              : Math.min(book.currentChapter, chapters.length - 1);
          book.chapterCount = chapters.length;
          book.characterCount = chapters.reduce(
            (total, item) => total + item.characterCount,
            0,
          );
          chaptersChanged = true;
        }
        if (
          novel.coverUrl &&
          (!book.coverDataUrl ||
            book.catalogCoverUpdatedAt !== novel.coverUpdatedAt)
        ) {
          const response = await fetch(novel.coverUrl);
          if (response.ok)
            coverDataUrl = await blobToDataUrl(await response.blob());
        }
        const updated: NovelBook = {
          ...book,
          title: novel.title,
          author: novel.author,
          description: novel.description,
          language: novel.language,
          category: novel.category,
          tags: novel.tags,
          source: "store",
          catalogNovelId: novel.id,
          catalogRevision: novel.contentRevision,
          catalogUpdatedAt: novel.contentUpdatedAt,
          catalogCoverUpdatedAt: novel.coverUpdatedAt,
          coverDataUrl,
        };
        await updateNovelBook(updated);
        merged[index] = updated;
        if (chaptersChanged)
          await uploadCloudBook(
            bootstrap.userId,
            updated,
            await listNovelChapters(updated.id),
          );
        else await updateCloudMetadata(bootstrap.userId, updated);
      }
      const cloudIds = new Set(
        ((data ?? []) as CloudRow[]).map((row) => row.book_id),
      );
      for (const book of merged)
        if (!cloudIds.has(book.id))
          await uploadCloudBook(
            bootstrap.userId,
            book,
            await listNovelChapters(book.id),
          );
      return merged;
    },
    [bootstrap.catalog, bootstrap.userId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const local = (await listNovelBooks()).sort((a, b) =>
          (b.lastReadAt ?? b.importedAt).localeCompare(
            a.lastReadAt ?? a.importedAt,
          ),
        );
        const merged = await syncLibrary(local);
        if (!cancelled) setBooks(merged);
        if (bootstrap.userId) setMessage("云书架与阅读进度已同步。");
      } catch {
        if (!cancelled) {
          setBooks(await listNovelBooks().catch(() => []));
          setMessage("当前离线，已打开本地书架；联网后会自动同步。");
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap.userId, syncLibrary]);

  async function importParsedFile(
    file: File,
    forcedId?: string,
    override?: Partial<NovelBook>,
    suppliedChapters?: NovelChapter[],
  ) {
    if (file.size > 50 * 1024 * 1024)
      throw new Error("单本小说不能超过 50 MB。");
    const parsed = suppliedChapters ? null : await parseNovelFile(file, "auto");
    const chapters =
      suppliedChapters ??
      parsed?.chapters ??
      splitNovelIntoChapters(parsed?.text ?? "");
    if (!chapters.length) throw new Error("没有识别到可阅读的正文。");
    const now = new Date().toISOString();
    const book: NovelBook = {
      id: forcedId ?? makeId(),
      title:
        override?.title ?? parsed?.title ?? file.name.replace(/\.[^.]+$/u, ""),
      author: override?.author ?? parsed?.author ?? "",
      language:
        override?.language ??
        detectNovelLanguage(
          parsed?.text ?? chapters.map((item) => item.content).join("\n"),
        ),
      chapterCount: chapters.length,
      characterCount: chapters.reduce(
        (total, item) => total + item.characterCount,
        0,
      ),
      importedAt: now,
      lastReadAt: null,
      currentChapter: 0,
      chapterProgress: 0,
      overallProgress: 0,
      readingSeconds: 0,
      sourceFileName: file.name,
      description: override?.description ?? "",
      positionUpdatedAt: now,
      bookmarks: [],
      category: override?.category,
      tags: override?.tags,
      coverDataUrl: override?.coverDataUrl,
      source: override?.source ?? "local",
      catalogNovelId: override?.catalogNovelId,
      catalogRevision: override?.catalogRevision,
      catalogUpdatedAt: override?.catalogUpdatedAt,
      catalogCoverUpdatedAt: override?.catalogCoverUpdatedAt,
      readingMode: override?.readingMode ?? "scroll",
    };
    await saveNovelBook(book, chapters);
    let cloudSynced = !bootstrap.userId;
    if (bootstrap.userId) {
      try {
        await uploadCloudBook(bootstrap.userId, book, chapters);
        cloudSynced = true;
      } catch {
        cloudSynced = false;
      }
    }
    setBooks((items) => [book, ...items.filter((item) => item.id !== book.id)]);
    return { book, cloudSynced };
  }

  async function importLocal(file: File) {
    setBusy("import");
    setMessage("正在解析章节并保存…");
    try {
      const { book, cloudSynced } = await importParsedFile(file);
      setMessage(
        !bootstrap.userId
          ? `《${book.title}》已保存到当前设备。`
          : cloudSynced
            ? `《${book.title}》已加入书架并同步。`
            : `《${book.title}》已保存到本机，云同步将在联网后重试。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function addFromStore(novel: CatalogNovel) {
    if (!novel.downloadUrl || !novel.unlocked) return;
    setBusy(`store:${novel.id}`);
    setMessage("正在领取并解析小说…");
    try {
      const chapters = await downloadCatalogChapters(novel);
      let coverDataUrl: string | undefined;
      if (novel.coverUrl) {
        const response = await fetch(novel.coverUrl);
        if (response.ok)
          coverDataUrl = await blobToDataUrl(await response.blob());
      }
      const file = new File(
        [chapters.map((item) => `${item.title}\n${item.content}`).join("\n\n")],
        novel.originalFileName,
      );
      const { book } = await importParsedFile(
        file,
        `catalog-${novel.id}`,
        {
          title: novel.title,
          author: novel.author,
          language: novel.language,
          description: novel.description,
          category: novel.category,
          tags: novel.tags,
          coverDataUrl,
          source: "store",
          catalogNovelId: novel.id,
          catalogRevision: novel.contentRevision,
          catalogUpdatedAt: novel.contentUpdatedAt,
          catalogCoverUpdatedAt: novel.coverUpdatedAt,
        },
        chapters,
      );
      setMessage(`《${book.title}》已加入你的书架。`);
      setView("shelf");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "领取小说失败。");
    } finally {
      setBusy("");
    }
  }

  async function openBook(
    book: NovelBook,
    targetChapter = book.currentChapter,
  ) {
    const nextChapter = await getNovelChapter(book.id, targetChapter);
    if (!nextChapter) {
      setMessage("章节内容不存在，请重新同步。");
      return;
    }
    setCurrentId(book.id);
    setChapter(nextChapter);
    setChapterHeadings(await listNovelChapterHeadings(book.id));
    setView("reader");
    setShowContents(false);
    const mode = book.readingMode ?? "scroll";
    setReadingMode(mode);
    requestAnimationFrame(() => {
      const element = readerRef.current;
      if (!element) return;
      if (mode === "paged") {
        const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
        element.scrollLeft =
          targetChapter === book.currentChapter
            ? book.chapterProgress * maximum
            : 0;
      } else {
        element.scrollTop =
          targetChapter === book.currentChapter
            ? book.chapterProgress *
              Math.max(0, element.scrollHeight - element.clientHeight)
            : 0;
      }
    });
  }

  function persistPosition(progress: number) {
    if (!current || !chapter) return;
    const chapterLengths = chapterHeadings.map((item) => item.characterCount);
    const now = new Date().toISOString();
    const next = {
      ...current,
      currentChapter: chapter.index,
      chapterProgress: progress,
      overallProgress: calculateNovelProgressByCharacters(
        chapter.index,
        progress,
        chapterLengths,
      ),
      lastReadAt: now,
      positionUpdatedAt: now,
    };
    setBooks((items) =>
      items.map((book) => (book.id === next.id ? next : book)),
    );
    void updateNovelBook(next);
    if (bootstrap.userId) {
      if (metadataTimer.current) window.clearTimeout(metadataTimer.current);
      metadataTimer.current = window.setTimeout(
        () =>
          void updateCloudMetadata(bootstrap.userId!, next).catch(() =>
            setMessage("阅读位置已保存在本机，云同步将在联网后重试。"),
          ),
        700,
      );
    }
  }

  function onReaderScroll() {
    const element = readerRef.current;
    if (!element) return;
    if (readingMode === "paged") {
      const progress =
        element.scrollLeft /
        Math.max(1, element.scrollWidth - element.clientWidth);
      setPageIndex(
        Math.min(
          pageCount - 1,
          Math.max(0, Math.round(element.scrollLeft / element.clientWidth)),
        ),
      );
      persistPosition(progress);
    } else {
      persistPosition(
        element.scrollTop /
          Math.max(1, element.scrollHeight - element.clientHeight),
      );
    }
  }

  function changeReadingMode(mode: NovelReadingMode) {
    if (!current || !readerRef.current || mode === readingMode) return;
    const element = readerRef.current;
    const progress =
      readingMode === "paged"
        ? element.scrollLeft /
          Math.max(1, element.scrollWidth - element.clientWidth)
        : element.scrollTop /
          Math.max(1, element.scrollHeight - element.clientHeight);
    const updated = {
      ...current,
      readingMode: mode,
      chapterProgress: progress,
    };
    setReadingMode(mode);
    setBooks((items) =>
      items.map((book) => (book.id === updated.id ? updated : book)),
    );
    void updateNovelBook(updated);
    requestAnimationFrame(() => {
      const next = readerRef.current;
      if (!next) return;
      if (mode === "paged")
        next.scrollLeft =
          progress * Math.max(0, next.scrollWidth - next.clientWidth);
      else
        next.scrollTop =
          progress * Math.max(0, next.scrollHeight - next.clientHeight);
    });
  }

  function turnPage(direction: -1 | 1) {
    const element = readerRef.current;
    if (!element) return;
    element.scrollTo({
      left: Math.max(
        0,
        Math.min(
          element.scrollWidth - element.clientWidth,
          element.scrollLeft + direction * element.clientWidth,
        ),
      ),
      behavior: "smooth",
    });
  }

  function finishSwipe(event: TouchEvent<HTMLDivElement>) {
    if (readingMode !== "paged" || touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 45 || window.getSelection()?.toString()) return;
    turnPage(distance < 0 ? 1 : -1);
  }
  async function removeBook(book: NovelBook) {
    if (!window.confirm(`确定从书架删除《${book.title}》吗？`)) return;
    await deleteNovelBook(book.id);
    setBooks((items) => items.filter((item) => item.id !== book.id));
    if (bootstrap.userId) {
      const supabase = createClient();
      await Promise.all([
        supabase
          .from("reader_books")
          .delete()
          .eq("user_id", bootstrap.userId)
          .eq("book_id", book.id),
        supabase.storage
          .from("novel-files")
          .remove([cloudPath(bootstrap.userId, book.id)]),
      ]);
    }
  }

  useEffect(() => {
    const element = readerRef.current;
    if (view !== "reader" || !element) return;
    const update = () => {
      setReaderWidth(element.clientWidth);
      setPageCount(
        Math.max(1, Math.ceil(element.scrollWidth / element.clientWidth)),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const timer = window.setTimeout(update, 50);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [chapter, fontSize, readingMode, view]);

  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .filter(
              (book) =>
                languageFilter === "all" || book.language === languageFilter,
            )
            .flatMap((book) => [book.category, ...(book.tags ?? [])])
            .filter((item): item is string => Boolean(item)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [books, languageFilter],
  );
  const filteredBooks = books.filter((book) => {
    const searchable =
      `${book.title} ${book.author} ${book.description ?? ""} ${book.category ?? ""} ${(book.tags ?? []).join(" ")}`.toLocaleLowerCase();
    return (
      searchable.includes(query.toLocaleLowerCase()) &&
      (languageFilter === "all" || book.language === languageFilter) &&
      (sourceFilter === "all" || (book.source ?? "local") === sourceFilter) &&
      (tagFilter === "all" ||
        book.category === tagFilter ||
        book.tags?.includes(tagFilter))
    );
  });
  const shelfGroups = (["zh", "en"] as const)
    .map(
      (language) =>
        [
          language,
          filteredBooks.filter((book) => book.language === language),
        ] as const,
    )
    .filter(([, items]) => items.length);

  if (view === "reader" && current && chapter)
    return (
      <div
        className={`-m-3 flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden sm:-m-6 lg:-m-8 ${night ? "bg-[#111318] text-[#e8e6df]" : "bg-[#f4f0e8] text-[#292720]"}`}
      >
        {showContents && (
          <button
            aria-label="关闭目录"
            type="button"
            onClick={() => setShowContents(false)}
            className="fixed inset-0 z-30 bg-black/35 lg:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[min(22rem,85vw)] overflow-y-auto border-r p-4 transition-transform lg:static lg:translate-x-0 ${showContents ? "translate-x-0" : "-translate-x-full"} ${night ? "border-white/10 bg-[#171a20]" : "border-[#d9d2c5] bg-[#ebe5da]"}`}
        >
          <button
            type="button"
            onClick={() => setView("shelf")}
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-black/5"
          >
            <span className="material-icons-round">arrow_back</span>返回书架
          </button>
          <div className="mt-5 px-3">
            <p className="text-xs font-bold uppercase tracking-[.16em] opacity-55">
              {current.author || "未知作者"}
            </p>
            <h1 className="mt-2 font-serif text-2xl font-bold">
              {current.title}
            </h1>
            <p className="mt-2 text-sm opacity-65">
              已读 {formatProgress(current.overallProgress)}
            </p>
          </div>
          <nav className="mt-5 space-y-1">
            {chapterHeadings.map((item) => (
              <button
                key={item.index}
                type="button"
                onClick={() => void openBook(current, item.index)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm ${item.index === chapter.index ? "bg-[#0e7490] font-semibold text-white" : "hover:bg-black/5"}`}
              >
                {item.title}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className={`flex min-h-14 items-center gap-2 border-b px-3 ${night ? "border-white/10 bg-[#171a20]" : "border-[#d9d2c5] bg-[#fffdf8]"}`}
          >
            <button
              type="button"
              onClick={() => setShowContents(true)}
              className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5 lg:hidden"
              aria-label="章节目录"
            >
              <span className="material-icons-round">menu</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{chapter.title}</p>
              <p className="text-xs opacity-55">
                {chapter.index + 1} / {current.chapterCount}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFontSize((value) => Math.max(15, value - 1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-current/15 font-serif"
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => setFontSize((value) => Math.min(30, value + 1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-current/15 font-serif"
            >
              A+
            </button>
            <div className="flex rounded-xl border border-current/15 p-1">
              {(["scroll", "paged"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeReadingMode(mode)}
                  className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${readingMode === mode ? "bg-[#0e7490] text-white" : "opacity-65"}`}
                >
                  {mode === "scroll" ? "滚动" : "翻页"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setNight((value) => !value)}
              className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5"
              aria-label="切换阅读主题"
            >
              <span className="material-icons-round">
                {night ? "light_mode" : "dark_mode"}
              </span>
            </button>
          </header>
          <div
            ref={readerRef}
            onScroll={onReaderScroll}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0].clientX;
            }}
            onTouchEnd={finishSwipe}
            className={`relative min-h-0 flex-1 scroll-smooth ${readingMode === "paged" ? "overflow-x-auto overflow-y-hidden overscroll-x-contain" : "overflow-y-auto"}`}
          >
            <article
              className={
                readingMode === "paged"
                  ? "h-full px-8 py-10 sm:px-12"
                  : "mx-auto max-w-[48rem] px-5 py-10 sm:px-10 sm:py-16"
              }
              style={
                readingMode === "paged"
                  ? {
                      width: readerWidth,
                      columnWidth: Math.max(280, readerWidth - 96),
                      columnGap: 96,
                      columnFill: "auto",
                    }
                  : undefined
              }
            >
              <h2 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
                {chapter.title}
              </h2>
              <div
                className="mt-10 font-serif"
                style={{ fontSize, lineHeight: 1.95 }}
              >
                {chapter.content.split(/\n\s*\n/gu).map((paragraph, index) => (
                  <p key={index} className="mb-[1.25em] text-justify">
                    {paragraph}
                  </p>
                ))}
              </div>
              <div className="mt-12 flex gap-3 border-t border-current/10 pt-6">
                <button
                  type="button"
                  disabled={chapter.index === 0}
                  onClick={() => void openBook(current, chapter.index - 1)}
                  className="min-h-12 flex-1 rounded-xl border border-current/20 font-semibold disabled:opacity-35"
                >
                  上一章
                </button>
                <button
                  type="button"
                  disabled={chapter.index >= current.chapterCount - 1}
                  onClick={() => void openBook(current, chapter.index + 1)}
                  className="min-h-12 flex-1 rounded-xl bg-[#0e7490] font-semibold text-white disabled:opacity-35"
                >
                  下一章
                </button>
              </div>
            </article>
            {readingMode === "paged" && (
              <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/65 px-2 py-1.5 text-xs text-white shadow-lg">
                <button
                  type="button"
                  aria-label="上一页"
                  onClick={() => turnPage(-1)}
                  disabled={pageIndex === 0}
                  className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-35"
                >
                  <span className="material-icons-round">chevron_left</span>
                </button>
                <span className="min-w-16 text-center">
                  {pageIndex + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="下一页"
                  onClick={() => turnPage(1)}
                  disabled={pageIndex >= pageCount - 1}
                  className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-35"
                >
                  <span className="material-icons-round">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 text-[var(--foreground)]">
      <header className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(125deg,#101f2b,#123d4a_52%,#0f766e)] px-5 py-7 text-white shadow-[0_24px_70px_rgba(8,47,56,.24)] sm:px-8">
        <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-[#5eead4]/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.22em] text-[#99f6e4]">
              Your private library
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Reading 阅读器
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-[#ccfbf1]">
              导入 TXT、Markdown、HTML 或
              EPUB；章节、书签与阅读位置会在你的设备之间安静同步。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold">
              {bootstrap.signedIn
                ? `${bootstrap.plan.toUpperCase()} · 云同步`
                : "本机模式"}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold">
              {books.length} 本藏书
            </span>
          </div>
        </div>
      </header>
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2">
        <button
          type="button"
          onClick={() => setView("shelf")}
          className={`min-h-11 rounded-xl px-5 text-sm font-bold ${view === "shelf" ? "bg-[#0f766e] text-white" : "text-[var(--muted-foreground)]"}`}
        >
          <span className="material-icons-round mr-2 align-middle text-lg">
            shelves
          </span>
          我的书架
        </button>
        {storeEnabled && (
          <button
            type="button"
            onClick={() => setView("store")}
            className={`min-h-11 rounded-xl px-5 text-sm font-bold ${view === "store" ? "bg-[#0f766e] text-white" : "text-[var(--muted-foreground)]"}`}
          >
            <span className="material-icons-round mr-2 align-middle text-lg">
              storefront
            </span>
            小说商店
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy === "import"}
          className="ml-auto min-h-11 shrink-0 rounded-xl border border-[#0f766e] px-4 text-sm font-bold text-[#0f766e]"
        >
          <span className="material-icons-round mr-2 align-middle text-lg">
            upload_file
          </span>
          {busy === "import" ? "导入中…" : "导入小说"}
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={NOVEL_FILE_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importLocal(file);
          }}
        />
      </nav>
      {message && (
        <p
          role="status"
          className="rounded-2xl border border-[#99d9d1] bg-[#ecfdf5] px-4 py-3 text-sm text-[#115e59] dark:border-[#285e57] dark:bg-[#123b36] dark:text-[#99f6e4]"
        >
          {message}
        </p>
      )}
      {view === "shelf" && (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="material-icons-round absolute left-3 top-3 text-[var(--muted-foreground)]">
                search
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索书名、作者或简介"
                className="min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] pl-11 pr-4 outline-none focus:border-[#0f766e]"
              />
            </label>
            <select
              value={languageFilter}
              onChange={(event) => {
                setLanguageFilter(event.target.value as "all" | "zh" | "en");
                setTagFilter("all");
              }}
              aria-label="按语言筛选"
              className="min-h-12 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3"
            >
              <option value="all">全部语言</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              aria-label="按分类或标签筛选"
              className="min-h-12 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3"
            >
              <option value="all">全部分类</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(event.target.value as "all" | "local" | "store")
              }
              aria-label="按来源筛选"
              className="min-h-12 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3"
            >
              <option value="all">全部来源</option>
              <option value="local">本地导入</option>
              <option value="store">商店图书</option>
            </select>
            {!bootstrap.signedIn && (
              <Link
                href="/login?next=/reading"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#155eef] px-4 text-sm font-bold text-white"
              >
                登录开启跨设备同步
              </Link>
            )}
          </div>
          {hydrated && filteredBooks.length ? (
            <div className="space-y-8">
              {shelfGroups.map(([language, group]) => (
                <section key={language}>
                  <h2 className="mb-3 text-xl font-bold">
                    {language === "zh" ? "中文书" : "English Books"}{" "}
                    <span className="text-sm font-normal text-[var(--muted-foreground)]">
                      {group.length} 本
                    </span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.map((book, index) => (
                      <article
                        key={book.id}
                        className="group overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                      >
                        <div
                          className={`relative h-36 overflow-hidden bg-[linear-gradient(120deg,${["#164e63,#0f766e", "#312e81,#7c3aed", "#713f12,#d97706", "#3f3f46,#71717a"][index % 4]} )] p-5 text-white`}
                        >
                          {book.coverDataUrl && (
                            <img
                              src={book.coverDataUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/15 to-black/55" />
                          <div className="relative flex items-start justify-between">
                            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
                              {book.language === "zh" ? "中文" : "English"} ·{" "}
                              {book.chapterCount} 章
                            </span>
                            <button
                              type="button"
                              onClick={() => void removeBook(book)}
                              className="grid h-9 w-9 place-items-center rounded-xl bg-black/10 opacity-70 hover:bg-black/25 group-hover:opacity-100"
                              aria-label={`删除 ${book.title}`}
                            >
                              <span className="material-icons-round text-lg">
                                delete
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="p-5">
                          <h2 className="font-serif text-2xl font-bold leading-tight">
                            {book.title}
                          </h2>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            {book.author || "未知作者"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[book.category, ...(book.tags ?? [])]
                              .filter(Boolean)
                              .slice(0, 5)
                              .map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]"
                                >
                                  {tag}
                                </span>
                              ))}
                            <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
                              {book.source === "store" ? "商店" : "本地"}
                            </span>
                          </div>
                          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full rounded-full bg-[#0f766e]"
                              style={{
                                width: formatProgress(book.overallProgress),
                              }}
                            />
                          </div>
                          <div className="mt-2 flex justify-between text-xs text-[var(--muted-foreground)]">
                            <span>{formatProgress(book.overallProgress)}</span>
                            <span>
                              {book.characterCount.toLocaleString()} 字符
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openBook(book)}
                            className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white"
                          >
                            {book.overallProgress > 0 ? "继续阅读" : "开始阅读"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : hydrated ? (
            <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-12 text-center">
              <span className="material-icons-round text-6xl text-[#5ea9a0]">
                auto_stories
              </span>
              <h2 className="mt-4 text-xl font-bold">书架还空着</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                导入自己的小说，或去商店领取管理员上架的内容。
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-xl bg-[#0f766e] px-5 py-3 text-sm font-bold text-white"
                >
                  导入文件
                </button>
                {storeEnabled && (
                  <button
                    type="button"
                    onClick={() => setView("store")}
                    className="rounded-xl border border-[#0f766e] px-5 py-3 text-sm font-bold text-[#0f766e]"
                  >
                    浏览商店
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-72 animate-pulse rounded-3xl bg-[var(--card)]"
                />
              ))}
            </div>
          )}
        </section>
      )}
      {view === "store" && storeEnabled && (
        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">小说商店</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                免费书可直接加入；会员书会按你的当前套餐自动解锁。
              </p>
            </div>
            <span className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--muted-foreground)]">
              当前 {bootstrap.plan.toUpperCase()}
            </span>
          </div>
          {bootstrap.catalog.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {bootstrap.catalog.map((novel) => (
                <article
                  key={novel.id}
                  className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,#102c3c,#0f766e)]">
                    {novel.coverUrl ? (
                      <img
                        src={novel.coverUrl}
                        alt={`《${novel.title}》封面`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <span className="material-icons-round text-6xl text-white/70">
                          menu_book
                        </span>
                      </div>
                    )}
                    <span
                      className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${planStyle[novel.minimumPlan] ?? planStyle.free}`}
                    >
                      {planName(novel.minimumPlan)}
                    </span>
                    {novel.featured && (
                      <span className="absolute right-3 top-3 rounded-full bg-[#fdb022] px-2.5 py-1 text-xs font-bold text-[#7a2e0e]">
                        精选
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-serif text-xl font-bold">
                      {novel.title}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {novel.author || "未知作者"} ·{" "}
                      {formatSize(novel.fileSize)}
                    </p>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">
                      {novel.description || "管理员精选小说。"}
                    </p>
                    {storeIds.has(novel.id) ? (
                      <button
                        type="button"
                        disabled
                        className="mt-5 min-h-11 w-full rounded-xl bg-[#ecfdf3] text-sm font-bold text-[#027a48]"
                      >
                        已在书架
                      </button>
                    ) : novel.unlocked ? (
                      <button
                        type="button"
                        disabled={busy === `store:${novel.id}`}
                        onClick={() => void addFromStore(novel)}
                        className="mt-5 min-h-11 w-full rounded-xl bg-[#0f766e] text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busy === `store:${novel.id}`
                          ? "正在加入…"
                          : "加入书架"}
                      </button>
                    ) : (
                      <Link
                        href="/settings?section=redemption"
                        className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#7f56d9] text-sm font-bold text-[#6941c6]"
                      >
                        <span className="material-icons-round mr-1.5 text-lg">
                          lock
                        </span>
                        需要 {planName(novel.minimumPlan)}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--card-border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
              商店暂时没有上架小说。
            </div>
          )}
        </section>
      )}
    </div>
  );
}
