"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  createNovelTag,
  createRedemptionCodes,
  deleteCatalogNovel,
  deleteNovelTag,
  getAdminNovelChapters,
  saveAdminNovelChapters,
  setRedemptionCodeEnabled,
  updateCatalogNovel,
  updateFeatureAccess,
  type AdminCode,
  type AdminFeature,
  type AdminNovel,
  type AdminTag,
} from "@/actions/reader-admin";
import { PLAN_ORDER, type PlanCode } from "@/lib/redemption";
import { splitNovelIntoChapters, type NovelChapter } from "@/lib/novel-reader";

const planLabel: Record<PlanCode, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  ultra: "Ultra",
};
const field =
  "min-h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#155eef] focus:ring-4 focus:ring-[#155eef]/10 dark:border-white/15 dark:bg-[#172033]";
type UploadJob = {
  file: File;
  cover: File | null;
  progress: number;
  status: "queued" | "uploading" | "done" | "failed";
  error?: string;
};

function uploadWithProgress(
  form: FormData,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/novels");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(request.responseText) as { error?: string };
      } catch {
        /* Use HTTP status. */
      }
      if (request.status >= 200 && request.status < 300) resolve();
      else
        reject(new Error(body.error ?? `上传失败（HTTP ${request.status}）`));
    });
    request.addEventListener("error", () =>
      reject(new Error("网络连接中断。")),
    );
    request.send(form);
  });
}

function TagPicker({
  tags,
  selected,
  onChange,
}: {
  tags: AdminTag[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-[#d0d5dd] p-3 dark:border-white/15">
      <legend className="px-1 text-sm font-medium">标签</legend>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <label
            key={tag.id}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.includes(tag.name) ? "border-[#155eef] bg-[#eff4ff] text-[#155eef]" : "border-[#d0d5dd]"}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selected.includes(tag.name)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, tag.name].slice(0, 20)
                    : selected.filter((name) => name !== tag.name),
                )
              }
            />
            {tag.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FeatureCard({ feature }: { feature: AdminFeature }) {
  const [value, setValue] = useState(feature);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  function save() {
    start(async () => {
      const result = await updateFeatureAccess({
        key: value.key,
        enabled: value.enabled,
        betaOnly: value.betaOnly,
        minimumPlan: value.minimumPlan,
      });
      setMessage(result.success ? "已保存" : (result.error ?? "保存失败"));
    });
  }
  return (
    <article className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{value.displayName}</h3>
          <p className="mt-1 text-sm text-[#667085] dark:text-[#98a2b3]">
            {value.description}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) =>
              setValue({ ...value, enabled: event.target.checked })
            }
          />
          开启
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          最低会员
          <select
            className={`${field} mt-1.5`}
            value={value.minimumPlan}
            onChange={(event) =>
              setValue({
                ...value,
                minimumPlan: event.target.value as PlanCode,
              })
            }
          >
            {PLAN_ORDER.map((plan) => (
              <option key={plan} value={plan}>
                {planLabel[plan]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 rounded-xl border border-[#e4e7ec] px-3 pb-3 text-sm font-medium dark:border-white/10">
          <input
            type="checkbox"
            checked={value.betaOnly}
            onChange={(event) =>
              setValue({ ...value, betaOnly: event.target.checked })
            }
          />
          仅 BETA 用户
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-xl bg-[#155eef] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          保存规则
        </button>
        <span className="text-xs text-[#667085]">{message}</span>
      </div>
    </article>
  );
}

function NovelRow({
  novel,
  onUpdated,
}: {
  novel: AdminNovel;
  onUpdated?: (novel: AdminNovel) => void;
}) {
  const [value, setValue] = useState(novel);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  function save() {
    start(async () => {
      const result = await updateCatalogNovel({
        id: value.id,
        enabled: value.enabled,
        featured: value.featured,
        minimumPlan: value.minimumPlan,
      });
      setMessage(result.success ? "已保存" : (result.error ?? "保存失败"));
      if (result.success) onUpdated?.(value);
    });
  }
  return (
    <article className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#172033]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{value.title}</h3>
          <p className="mt-1 truncate text-sm text-[#667085] dark:text-[#98a2b3]">
            {value.author || "未填写作者"} ·{" "}
            {(value.fileSize / 1024 / 1024).toFixed(2)} MB ·{" "}
            {value.originalFileName}
          </p>
        </div>
        <select
          aria-label={`${value.title} 最低会员`}
          className="min-h-10 rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111827]"
          value={value.minimumPlan}
          onChange={(event) =>
            setValue({ ...value, minimumPlan: event.target.value as PlanCode })
          }
        >
          {PLAN_ORDER.map((plan) => (
            <option key={plan} value={plan}>
              {planLabel[plan]}
            </option>
          ))}
        </select>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={value.featured}
            onChange={(event) =>
              setValue({ ...value, featured: event.target.checked })
            }
          />{" "}
          精选
        </label>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) =>
              setValue({ ...value, enabled: event.target.checked })
            }
          />{" "}
          上架
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="min-h-10 rounded-xl border border-[#155eef] px-3 text-sm font-semibold text-[#155eef]"
        >
          保存
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-[#667085]">{message}</p>}
    </article>
  );
}

function ManagedNovelRow({
  novel,
  tags,
  onDeleted,
}: {
  novel: AdminNovel;
  tags: AdminTag[];
  onDeleted: (id: string) => void;
}) {
  const [value, setValue] = useState(novel);
  const [expanded, setExpanded] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [chapters, setChapters] = useState<NovelChapter[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const activeChapter = chapters[chapterIndex];
  function saveMetadata() {
    start(async () => {
      if (file || cover) {
        const form = new FormData();
        form.set("id", value.id);
        if (file) form.set("file", file);
        if (cover) form.set("cover", cover);
        const response = await fetch("/api/admin/novels", {
          method: "PATCH",
          body: form,
        });
        if (!response.ok) {
          setMessage(
            ((await response.json()) as { error?: string }).error ??
              "文件保存失败。",
          );
          return;
        }
      }
      const result = await updateCatalogNovel({
        id: value.id,
        title: value.title,
        author: value.author,
        description: value.description,
        category: value.category,
        tags: value.tags,
        language: value.language,
        enabled: value.enabled,
        featured: value.featured,
        minimumPlan: value.minimumPlan,
      });
      if (result.success) {
        setFile(null);
        setCover(null);
        setMessage("资料已保存，读者书架会自动同步。");
      } else setMessage(result.error ?? "保存失败。");
    });
  }
  async function toggleChapters() {
    if (chaptersOpen) {
      setChaptersOpen(false);
      return;
    }
    setMessage("正在读取并扫描章节…");
    const result = await getAdminNovelChapters(value.id);
    if (!result.success || !result.chapters) {
      setMessage(result.error ?? "章节读取失败。");
      return;
    }
    setChapters(result.chapters);
    setChapterIndex(0);
    setChaptersOpen(true);
    setMessage(`已载入 ${result.chapters.length} 章。`);
  }
  function changeChapter(changes: Partial<NovelChapter>) {
    setChapters((items) =>
      items.map((item, index) =>
        index === chapterIndex
          ? {
              ...item,
              ...changes,
              characterCount:
                changes.content === undefined
                  ? item.characterCount
                  : changes.content.length,
            }
          : item,
      ),
    );
  }
  function rescan() {
    const next = splitNovelIntoChapters(
      chapters.map((item) => `${item.title}\n${item.content}`).join("\n\n"),
    );
    if (next.length) {
      setChapters(next);
      setChapterIndex(0);
      setMessage(`重新扫描得到 ${next.length} 章，请检查后保存。`);
    }
  }
  function addChapter() {
    setChapters((items) => [
      ...items,
      {
        index: items.length,
        title: `第 ${items.length + 1} 章`,
        content: "",
        characterCount: 0,
      },
    ]);
    setChapterIndex(chapters.length);
  }
  function removeChapter() {
    if (chapters.length <= 1) return;
    setChapters((items) =>
      items
        .filter((_, index) => index !== chapterIndex)
        .map((item, index) => ({ ...item, index })),
    );
    setChapterIndex((index) =>
      Math.max(0, Math.min(index, chapters.length - 2)),
    );
  }
  function publishChapters() {
    start(async () => {
      const result = await saveAdminNovelChapters(value.id, chapters);
      if (!result.success) {
        setMessage(result.error ?? "章节保存失败。");
        return;
      }
      const updated = {
        ...value,
        chaptersReady: true,
        contentRevision: result.revision ?? value.contentRevision + 1,
      };
      setValue(updated);
      setMessage(`章节第 ${updated.contentRevision} 版已发布。`);
    });
  }
  function removeNovel() {
    if (!window.confirm(`确定永久删除《${value.title}》吗？`)) return;
    start(async () => {
      const result = await deleteCatalogNovel(value.id);
      if (result.success) {
        onDeleted(value.id);
        if (result.warning) window.alert(result.warning);
      } else setMessage(result.error ?? "删除失败。");
    });
  }
  return (
    <div className="rounded-2xl border border-[#e4e7ec] bg-white p-3 dark:border-white/10 dark:bg-[#172033]">
      <NovelRow
        key={`${value.id}-${value.title}`}
        novel={value}
        onUpdated={setValue}
      />
      <div className="mt-2 flex flex-wrap gap-2 px-1">
        <span className="rounded-full bg-[#eff8ff] px-2.5 py-1 text-xs font-semibold text-[#175cd3]">
          第 {value.contentRevision} 版 ·{" "}
          {value.chaptersReady ? "章节已托管" : "待检查章节"}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="text-xs font-semibold text-[#155eef]"
        >
          {expanded ? "收起资料" : "编辑资料"}
        </button>
        <button
          type="button"
          onClick={() => void toggleChapters()}
          className="text-xs font-semibold text-[#155eef]"
        >
          {chaptersOpen ? "收起章节" : "章节管理"}
        </button>
        <button
          type="button"
          onClick={removeNovel}
          className="ml-auto text-xs font-semibold text-[#b42318]"
        >
          删除
        </button>
      </div>
      {expanded && (
        <section className="mt-4 grid gap-3 border-t border-[#e4e7ec] pt-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            书名
            <input
              value={value.title}
              onChange={(event) =>
                setValue({ ...value, title: event.target.value })
              }
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-sm font-medium">
            作者
            <input
              value={value.author}
              onChange={(event) =>
                setValue({ ...value, author: event.target.value })
              }
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-sm font-medium">
            语言
            <select
              value={value.language}
              onChange={(event) =>
                setValue({
                  ...value,
                  language: event.target.value as AdminNovel["language"],
                })
              }
              className={`${field} mt-1`}
            >
              <option value="zh">中文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            分类
            <input
              value={value.category}
              maxLength={40}
              onChange={(event) =>
                setValue({ ...value, category: event.target.value })
              }
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            简介
            <textarea
              value={value.description}
              onChange={(event) =>
                setValue({ ...value, description: event.target.value })
              }
              rows={4}
              className={`${field} mt-1 py-3`}
            />
          </label>
          <div className="sm:col-span-2">
            <TagPicker
              tags={tags}
              selected={value.tags}
              onChange={(selected) => setValue({ ...value, tags: selected })}
            />
          </div>
          <label className="text-sm font-medium">
            替换正文
            <input
              type="file"
              accept=".txt,.text,.md,.markdown,.html,.htm,.epub"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            替换封面
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setCover(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={saveMetadata}
            className="min-h-11 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white sm:col-span-2"
          >
            保存资料
          </button>
        </section>
      )}
      {chaptersOpen && activeChapter && (
        <section className="mt-4 grid gap-4 border-t border-[#e4e7ec] pt-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <div>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={rescan}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                重新扫描
              </button>
              <button
                type="button"
                onClick={addChapter}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                添加章节
              </button>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {chapters.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => setChapterIndex(index)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-xs ${index === chapterIndex ? "bg-[#155eef] text-white" : "hover:bg-[#f2f4f7]"}`}
                >
                  {index + 1}. {item.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <input
              value={activeChapter.title}
              onChange={(event) => changeChapter({ title: event.target.value })}
              className={field}
            />
            <textarea
              value={activeChapter.content}
              onChange={(event) =>
                changeChapter({ content: event.target.value })
              }
              rows={12}
              className={`${field} mt-3 py-3 font-serif leading-7`}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={publishChapters}
                className="min-h-11 flex-1 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white"
              >
                发布章节新版
              </button>
              <button
                type="button"
                onClick={removeChapter}
                className="rounded-xl border border-[#fda29b] px-4 text-sm text-[#b42318]"
              >
                删除本章
              </button>
            </div>
          </div>
        </section>
      )}
      {message && <p className="mt-3 px-1 text-xs text-[#667085]">{message}</p>}
    </div>
  );
}

export default function ContentLibraryPanel({
  initialFeatures,
  initialNovels,
  initialCodes,
  initialTags,
}: {
  initialFeatures: AdminFeature[];
  initialNovels: AdminNovel[];
  initialCodes: AdminCode[];
  initialTags: AdminTag[];
}) {
  const [tab, setTab] = useState<"novels" | "codes" | "features">("novels");
  const [novels, setNovels] = useState(initialNovels);
  const [codes, setCodes] = useState(initialCodes);
  const [tags, setTags] = useState(initialTags);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCovers, setUploadCovers] = useState<File[]>([]);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const uploadForm = useRef<HTMLFormElement>(null);
  const [newTag, setNewTag] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [rewardType, setRewardType] = useState<"novel" | "membership">("novel");
  const [selectedNovel, setSelectedNovel] = useState(
    initialNovels[0]?.id ?? "",
  );
  const [planCode, setPlanCode] = useState<PlanCode>("plus");
  const activeCodes = useMemo(
    () => codes.filter((code) => code.enabled).length,
    [codes],
  );

  async function uploadNovel(formData: FormData, retryJobs?: UploadJob[]) {
    const jobs =
      retryJobs ??
      uploadFiles.map((file, index) => ({
        file,
        cover: uploadCovers[index] ?? null,
        progress: 0,
        status: "queued" as const,
      }));
    if (uploadLock.current || !jobs.length) return;
    uploadLock.current = true;
    setUploading(true);
    setUploadJobs(jobs);
    let cursor = 0;
    let failures = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const index = cursor++;
        const job = jobs[index];
        setUploadJobs((items) =>
          items.map((item, itemIndex) =>
            itemIndex === index ? { ...item, status: "uploading" } : item,
          ),
        );
        const single = new FormData();
        for (const [key, value] of formData.entries())
          if (
            key !== "files" &&
            key !== "covers" &&
            !(key === "title" && uploadFiles.length > 1)
          )
            single.append(key, value);
        single.set("tags", uploadTags.join(","));
        single.set("file", job.file);
        if (job.cover) single.set("cover", job.cover);
        try {
          await uploadWithProgress(single, (progress) =>
            setUploadJobs((items) =>
              items.map((item, itemIndex) =>
                itemIndex === index ? { ...item, progress } : item,
              ),
            ),
          );
          setUploadJobs((items) =>
            items.map((item, itemIndex) =>
              itemIndex === index
                ? { ...item, status: "done", progress: 100 }
                : item,
            ),
          );
        } catch (error) {
          failures += 1;
          setUploadJobs((items) =>
            items.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    status: "failed",
                    error: error instanceof Error ? error.message : "上传失败",
                  }
                : item,
            ),
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(2, jobs.length) }, () => worker()),
    );
    uploadLock.current = false;
    setUploading(false);
    setMessage(
      failures
        ? "部分文件上传失败，可直接重试失败项。"
        : "全部上传成功，正在刷新…",
    );
    if (!failures) window.setTimeout(() => location.reload(), 500);
  }
  function retryFailed() {
    const form = uploadForm.current;
    if (!form || uploadLock.current) return;
    const failed = uploadJobs
      .filter((job) => job.status === "failed")
      .map((job) => ({
        ...job,
        progress: 0,
        status: "queued" as const,
        error: undefined,
      }));
    void uploadNovel(new FormData(form), failed);
  }
  function addTag() {
    start(async () => {
      const result = await createNovelTag(newTag);
      if (result.success && result.tag) {
        setTags((items) =>
          [...items, result.tag!].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setNewTag("");
      } else setMessage(result.error ?? "创建标签失败。");
    });
  }
  function removeTag(tag: AdminTag) {
    if (
      tag.usageCount &&
      !window.confirm(
        `标签“${tag.name}”正在被 ${tag.usageCount} 本书使用，仍要删除吗？`,
      )
    )
      return;
    start(async () => {
      const result = await deleteNovelTag(tag.id);
      if (result.success)
        setTags((items) => items.filter((item) => item.id !== tag.id));
      else setMessage(result.error ?? "删除标签失败。");
    });
  }
  function createCodes(formData: FormData) {
    start(async () => {
      setMessage("");
      setCreatedCodes([]);
      const result = await createRedemptionCodes({
        customCode: String(formData.get("customCode") ?? "") || undefined,
        quantity: Number(formData.get("quantity") ?? 1),
        label: String(formData.get("label") ?? ""),
        rewardType,
        novelId: rewardType === "novel" ? selectedNovel : undefined,
        planCode: rewardType === "membership" ? planCode : undefined,
        membershipDays:
          rewardType === "membership"
            ? Number(formData.get("membershipDays") ?? 30)
            : undefined,
        notBefore: String(formData.get("notBefore") ?? "") || null,
        expiresAt: String(formData.get("expiresAt") ?? "") || null,
        validDays: String(formData.get("validDays") ?? "")
          ? Number(formData.get("validDays"))
          : undefined,
        usageLimit: Number(formData.get("usageLimit") ?? 1),
      });
      if (!result.success) {
        setMessage(result.error ?? "创建失败");
        return;
      }
      setCreatedCodes(result.codes ?? []);
      setMessage(
        `已创建 ${result.codes?.length ?? 0} 个兑换码；请现在复制，之后只显示前缀。`,
      );
      location.hash = "created-codes";
    });
  }
  function toggleCode(code: AdminCode) {
    start(async () => {
      const result = await setRedemptionCodeEnabled(code.id, !code.enabled);
      if (result.success)
        setCodes((items) =>
          items.map((item) =>
            item.id === code.id ? { ...item, enabled: !item.enabled } : item,
          ),
        );
      else setMessage(result.error ?? "更新失败");
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-[#155eef]">内容与权限</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          阅读器运营中心
        </h1>
        <p className="mt-2 text-sm text-[#667085] dark:text-[#98a2b3]">
          上传小说、创建图书或会员兑换码，并按套餐与 BETA 状态控制功能可见性。
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#155eef] p-5 text-white">
          <p className="text-sm text-white/75">小说</p>
          <strong className="mt-2 block text-3xl">{novels.length}</strong>
        </div>
        <div className="rounded-2xl bg-[#7f56d9] p-5 text-white">
          <p className="text-sm text-white/75">有效兑换码</p>
          <strong className="mt-2 block text-3xl">{activeCodes}</strong>
        </div>
        <div className="rounded-2xl bg-[#0e9384] p-5 text-white">
          <p className="text-sm text-white/75">可控功能</p>
          <strong className="mt-2 block text-3xl">
            {initialFeatures.length}
          </strong>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[#e4e7ec] bg-white p-2 dark:border-white/10 dark:bg-[#172033]">
        {(
          [
            ["novels", "小说商店"],
            ["codes", "兑换码"],
            ["features", "功能权限"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 shrink-0 rounded-xl px-5 text-sm font-semibold ${tab === id ? "bg-[#155eef] text-white" : "text-[#475467] hover:bg-[#f2f4f7] dark:text-[#cbd5e1] dark:hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-[#b2ddff] bg-[#eff8ff] px-4 py-3 text-sm text-[#175cd3] dark:bg-[#102a43] dark:text-[#b2ddff]"
        >
          {message}
        </p>
      )}

      {tab === "novels" && (
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form
            ref={uploadForm}
            action={uploadNovel}
            className="self-start rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]"
          >
            <h2 className="text-lg font-semibold">批量上传小说</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                书名（单本可选）
                <input
                  name="title"
                  maxLength={160}
                  placeholder="批量上传时按文件名生成"
                  className={`${field} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium">
                分类
                <input
                  name="category"
                  maxLength={40}
                  placeholder="例如：科幻小说"
                  className={`${field} mt-1.5`}
                />
              </label>
              <div className="text-sm font-medium">
                标签
                <div className="mt-1.5">
                  <TagPicker
                    tags={tags}
                    selected={uploadTags}
                    onChange={setUploadTags}
                  />
                </div>
              </div>
              <label className="block text-sm font-medium">
                作者
                <input
                  name="author"
                  maxLength={120}
                  className={`${field} mt-1.5`}
                />
              </label>
              <label className="block text-sm font-medium">
                简介
                <textarea
                  name="description"
                  maxLength={1000}
                  rows={4}
                  className={`${field} mt-1.5 py-3`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  语言
                  <select name="language" className={`${field} mt-1.5`}>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                  </select>
                </label>
                <label className="text-sm font-medium">
                  最低会员
                  <select name="minimumPlan" className={`${field} mt-1.5`}>
                    {PLAN_ORDER.map((plan) => (
                      <option key={plan} value={plan}>
                        {planLabel[plan]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">
                小说文件（最多 20 本）
                <input
                  name="files"
                  required
                  type="file"
                  multiple
                  accept=".txt,.text,.md,.markdown,.html,.htm,.epub"
                  onChange={(event) =>
                    setUploadFiles(
                      Array.from(event.target.files ?? []).slice(0, 20),
                    )
                  }
                  className="mt-1.5 block w-full text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                封面（可选，按选择顺序对应）
                <input
                  name="covers"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setUploadCovers(Array.from(event.target.files ?? []))
                  }
                  className="mt-1.5 block w-full text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={uploading || !uploadFiles.length}
                className="min-h-11 w-full rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white"
              >
                {uploading
                  ? "正在上传…"
                  : `上传 ${uploadFiles.length || ""} 本并上架`}
              </button>
              {!!uploadJobs.length && (
                <div className="space-y-2 rounded-xl bg-[#f8fafc] p-3 dark:bg-white/5">
                  {uploadJobs.map((job, index) => (
                    <div key={`${job.file.name}-${index}`} className="text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="truncate">{job.file.name}</span>
                        <span>
                          {job.status === "failed"
                            ? "失败"
                            : `${job.progress}%`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e4e7ec]">
                        <div
                          className={`h-full transition-[width] ${job.status === "failed" ? "bg-[#d92d20]" : "bg-[#155eef]"}`}
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      {job.error && (
                        <p className="mt-1 text-[#b42318]">{job.error}</p>
                      )}
                    </div>
                  ))}
                  {uploadJobs.some((job) => job.status === "failed") && (
                    <button
                      type="button"
                      onClick={retryFailed}
                      disabled={uploading}
                      className="min-h-10 w-full rounded-lg border border-[#155eef] text-sm font-semibold text-[#155eef]"
                    >
                      重试失败项
                    </button>
                  )}
                </div>
              )}
              <div className="border-t border-[#e4e7ec] pt-4 dark:border-white/10">
                <p className="text-sm font-semibold">标签库</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    maxLength={40}
                    placeholder="创建可复用标签"
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={pending || !newTag.trim()}
                    className="shrink-0 rounded-xl bg-[#344054] px-4 text-sm font-semibold text-white"
                  >
                    新建
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs dark:bg-white/10"
                    >
                      {tag.name} {tag.usageCount ? `· ${tag.usageCount}` : ""}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`删除标签 ${tag.name}`}
                        className="text-[#b42318]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </form>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">商店书目</h2>
            {novels.map((novel) => (
              <ManagedNovelRow
                key={novel.id}
                novel={novel}
                tags={tags}
                onDeleted={() =>
                  setNovels((items) =>
                    items.filter((item) => item.id !== novel.id),
                  )
                }
              />
            ))}
            {!novels.length && (
              <p className="rounded-2xl border border-dashed border-[#d0d5dd] p-10 text-center text-sm text-[#667085]">
                还没有上传小说。
              </p>
            )}
          </section>
        </div>
      )}

      {tab === "codes" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form
            action={createCodes}
            className="self-start rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]"
          >
            <h2 className="text-lg font-semibold">创建兑换码</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                名称
                <input
                  name="label"
                  maxLength={120}
                  placeholder="例如：秋季阅读礼包"
                  className={`${field} mt-1.5`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRewardType("novel")}
                  className={`min-h-11 rounded-xl border font-semibold ${rewardType === "novel" ? "border-[#155eef] bg-[#eff4ff] text-[#155eef]" : "border-[#d0d5dd]"}`}
                >
                  图书
                </button>
                <button
                  type="button"
                  onClick={() => setRewardType("membership")}
                  className={`min-h-11 rounded-xl border font-semibold ${rewardType === "membership" ? "border-[#7f56d9] bg-[#f4f3ff] text-[#6941c6]" : "border-[#d0d5dd]"}`}
                >
                  会员
                </button>
              </div>
              {rewardType === "novel" ? (
                <label className="block text-sm font-medium">
                  兑换小说
                  <select
                    value={selectedNovel}
                    onChange={(event) => setSelectedNovel(event.target.value)}
                    className={`${field} mt-1.5`}
                  >
                    {novels.map((novel) => (
                      <option key={novel.id} value={novel.id}>
                        {novel.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium">
                    会员等级
                    <select
                      value={planCode}
                      onChange={(event) =>
                        setPlanCode(event.target.value as PlanCode)
                      }
                      className={`${field} mt-1.5`}
                    >
                      {PLAN_ORDER.slice(1).map((plan) => (
                        <option key={plan} value={plan}>
                          {planLabel[plan]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    有效天数
                    <input
                      name="membershipDays"
                      type="number"
                      min={1}
                      max={3650}
                      defaultValue={30}
                      className={`${field} mt-1.5`}
                    />
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  生成数量
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={200}
                    defaultValue={1}
                    className={`${field} mt-1.5`}
                  />
                </label>
                <label className="text-sm font-medium">
                  每码人数
                  <input
                    name="usageLimit"
                    type="number"
                    min={1}
                    max={1000000}
                    defaultValue={1}
                    className={`${field} mt-1.5`}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                自定义码（可选，仅单个）
                <input
                  name="customCode"
                  maxLength={32}
                  placeholder="留空则生成 12 位十六进制码"
                  className={`${field} mt-1.5 font-mono uppercase`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  开始时间
                  <input
                    name="notBefore"
                    type="datetime-local"
                    className={`${field} mt-1.5`}
                  />
                </label>
                <label className="text-sm font-medium">
                  结束时间
                  <input
                    name="expiresAt"
                    type="datetime-local"
                    className={`${field} mt-1.5`}
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={pending || (rewardType === "novel" && !selectedNovel)}
                className="min-h-11 w-full rounded-xl bg-[#7f56d9] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "正在创建…" : "创建兑换码"}
              </button>
            </div>
            {createdCodes.length > 0 && (
              <div
                id="created-codes"
                className="mt-5 rounded-2xl bg-[#101828] p-4 text-white"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-sm">仅本次显示</strong>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(createdCodes.join("\n"))
                    }
                    className="text-xs text-[#84adff]"
                  >
                    复制全部
                  </button>
                </div>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-sm leading-7 text-[#d1e0ff]">
                  {createdCodes.join("\n")}
                </pre>
              </div>
            )}
          </form>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">最近兑换码</h2>
            {codes.map((code) => (
              <article
                key={code.id}
                className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#172033] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <strong className="font-mono">
                    {code.codePrefix}••••••••
                  </strong>
                  <p className="mt-1 text-sm text-[#667085]">
                    {code.label ||
                      (code.rewardType === "novel"
                        ? "图书兑换码"
                        : `${code.planCode?.toUpperCase()} 会员`)}{" "}
                    · {code.redeemedCount}/{code.usageLimit} 人
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${code.enabled ? "bg-[#ecfdf3] text-[#027a48]" : "bg-[#f2f4f7] text-[#667085]"}`}
                >
                  {code.enabled ? "使用中" : "已停用"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCode(code)}
                  className="min-h-10 rounded-xl border border-[#d0d5dd] px-3 text-sm font-semibold"
                >
                  {code.enabled ? "停用" : "启用"}
                </button>
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === "features" && (
        <section className="grid gap-4 lg:grid-cols-2">
          {initialFeatures.map((feature) => (
            <FeatureCard key={feature.key} feature={feature} />
          ))}
        </section>
      )}
    </div>
  );
}
