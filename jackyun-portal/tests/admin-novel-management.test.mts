import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(
  new URL("../src/components/admin/content-library-panel.tsx", import.meta.url),
  "utf8",
);
const actionSource = await readFile(
  new URL("../src/actions/reader-admin.ts", import.meta.url),
  "utf8",
);
const uploadRouteSource = await readFile(
  new URL("../src/app/api/admin/novels/route.ts", import.meta.url),
  "utf8",
);
const readerSource = await readFile(
  new URL(
    "../src/components/modules/ielts/novel-workbench.tsx",
    import.meta.url,
  ),
  "utf8",
);
const migrationSource = await readFile(
  new URL(
    "../supabase/migrations/20260912090245_reader_catalog_sync_tags_and_chapters.sql",
    import.meta.url,
  ),
  "utf8",
);

test("admin batch upload exposes progress, concurrency, retry, and duplicate guards", () => {
  assert.match(panelSource, /request\.upload\.addEventListener\("progress"/u);
  assert.match(panelSource, /uploadLock\.current \|\| !jobs\.length/u);
  assert.match(panelSource, /Math\.min\(2, jobs\.length\)/u);
  assert.match(panelSource, /function retryFailed/u);
  assert.match(uploadRouteSource, /createHash\("sha256"\)/u);
  assert.match(uploadRouteSource, /status: 409/u);
  assert.match(migrationSource, /novel_catalog_content_hash_uidx/u);
});

test("admin manages reusable tags and corrected catalog chapters", () => {
  assert.match(actionSource, /export async function createNovelTag/u);
  assert.match(actionSource, /export async function getAdminNovelChapters/u);
  assert.match(actionSource, /export async function saveAdminNovelChapters/u);
  assert.match(panelSource, /章节管理/u);
  assert.match(panelSource, /重新扫描/u);
  assert.match(panelSource, /<TagPicker/u);
  assert.match(migrationSource, /remove_deleted_novel_tag_from_catalog/u);
});

test("reader synchronizes catalog revisions and canonical metadata", () => {
  assert.match(readerSource, /book\.catalogRevision \?\? 0/u);
  assert.match(readerSource, /downloadCatalogChapters\(novel\)/u);
  assert.match(readerSource, /replaceNovelChapters\(book\.id, chapters\)/u);
  for (const field of ["title", "author", "description", "category", "tags"]) {
    assert.match(readerSource, new RegExp(`${field}: novel\\.${field}`, "u"));
  }
  assert.match(readerSource, /catalogCoverUpdatedAt: novel\.coverUpdatedAt/u);
});

test("reader supports language-first shelves, filters, and paged navigation", () => {
  assert.match(readerSource, /中文书/u);
  assert.match(readerSource, /English Books/u);
  assert.match(readerSource, /按分类或标签筛选/u);
  assert.match(readerSource, /changeReadingMode\(mode\)/u);
  assert.match(readerSource, /function finishSwipe/u);
  assert.match(readerSource, /overflow-x-auto overflow-y-hidden/u);
});

test("catalog management RPCs remain service-role only", () => {
  assert.match(
    migrationSource,
    /REVOKE ALL ON FUNCTION public\.replace_novel_catalog_chapters\(uuid, jsonb\) FROM PUBLIC, anon, authenticated/u,
  );
  assert.match(
    migrationSource,
    /GRANT EXECUTE ON FUNCTION public\.replace_novel_catalog_chapters\(uuid, jsonb\) TO service_role/u,
  );
});
