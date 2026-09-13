import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panelSource = await readFile(new URL('../src/components/admin/content-library-panel.tsx', import.meta.url), 'utf8');
const actionSource = await readFile(new URL('../src/actions/reader-admin.ts', import.meta.url), 'utf8');
const uploadRouteSource = await readFile(new URL('../src/app/api/admin/novels/route.ts', import.meta.url), 'utf8');
const uploadTicketSource = await readFile(new URL('../src/app/api/admin/novels/upload-ticket/route.ts', import.meta.url), 'utf8');
const readerSource = await readFile(new URL('../src/components/modules/ielts/novel-workbench.tsx', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../supabase/migrations/20260912090245_reader_catalog_sync_tags_and_chapters.sql', import.meta.url), 'utf8');
const syncMigrationSource = await readFile(new URL('../supabase/migrations/20260912160245_optimize_novel_sync.sql', import.meta.url), 'utf8');

test('admin novel upload is guarded against duplicate submissions', () => {
  assert.match(panelSource, /if \(uploadLock\.current\) return;/u);
  assert.match(panelSource, /uploadLock\.current = true; setUploading\(true\)/u);
  assert.match(panelSource, /type="submit" disabled=\{uploading \|\| uploadFiles\.length < 1\}/u);
  assert.match(panelSource, /Math\.min\(2, indexes\.length\)/u);
  assert.match(panelSource, /retryFailedUploads/u);
});

test('admin uploads bypass the Vercel request-body limit with signed Storage uploads', () => {
  assert.match(panelSource, /uploadToSignedUrl/u);
  assert.match(panelSource, /\/api\/admin\/novels\/upload-ticket/u);
  assert.match(uploadTicketSource, /createSignedUploadUrl/u);
  assert.match(uploadRouteSource, /body\.mode !== 'finalize'/u);
  assert.match(uploadRouteSource, /preparedStoragePath/u);
  assert.doesNotMatch(panelSource, /new XMLHttpRequest/u);
  assert.ok(uploadRouteSource.includes('file.size > 50 * 1024 * 1024'));
  assert.ok(uploadRouteSource.includes('cover.size > 5 * 1024 * 1024'));
});

test('admin supports batch novel uploads and multi-book redemption bundles', () => {
  assert.match(panelSource, /name="files" required multiple/u);
  assert.match(uploadRouteSource, /form\.getAll\('files'\)/u);
  assert.match(uploadRouteSource, /files\.length > 20/u);
  assert.match(panelSource, /selectedNovelIds\.length/u);
  assert.match(actionSource, /redemption_code_novels/u);
  assert.match(actionSource, /novelIds\.map\(\(novelId, sortOrder\)/u);
});

test('reader distinguishes local and store books and imports redeemed books into the shelf', () => {
  assert.match(readerSource, /本地导入/u);
  assert.match(readerSource, /商店图书/u);
  assert.match(readerSource, /novel\.needsReaderImport/u);
  assert.match(readerSource, /acknowledgeCatalogNovelImport/u);
});

test('reader caches bodies locally and syncs store metadata without duplicate book uploads', () => {
  assert.match(readerSource, /if \(isStoreBook\(book\)\) \{ await updateCloudMetadata/u);
  assert.match(readerSource, /storage_path: null, content_hash: null, content_source: 'store'/u);
  assert.match(readerSource, /CLOUD_PROGRESS_INTERVAL_MS = 15_000/u);
  assert.match(readerSource, /getReaderBootstrap/u);
  assert.match(readerSource, /catalogFingerprint/u);
  assert.match(readerSource, /updateCloudMetadata\(bootstrap\.userId, book, false\)/u);
  assert.match(syncMigrationSource, /ADD COLUMN content_source/u);
  assert.match(syncMigrationSource, /ADD COLUMN on_shelf/u);
  assert.match(syncMigrationSource, /ALTER COLUMN storage_path DROP NOT NULL/u);
});

test('admin novel deletion removes catalog data and uploaded storage objects', () => {
  assert.match(actionSource, /export async function deleteCatalogNovel/u);
  assert.match(actionSource, /from\('novel_catalog'\)\.delete\(\)\.eq\('id', id\)/u);
  assert.match(actionSource, /storage\.from\('novel-files'\)\.remove\(paths\)/u);
  assert.match(panelSource, /window\.confirm/u);
});

test('admin can update store metadata and access controls', () => {
  for (const fieldName of ['title', 'author', 'description', 'language', 'minimum_plan', 'featured', 'enabled']) {
    assert.ok(actionSource.includes(fieldName), `missing managed field: ${fieldName}`);
  }
});

test('admin manages reusable tags and corrected catalog chapters', () => {
  assert.match(actionSource, /export async function createNovelTag/u);
  assert.match(actionSource, /export async function getAdminNovelChapters/u);
  assert.match(actionSource, /replace_novel_catalog_chapters/u);
  assert.match(panelSource, /章节管理/u);
  assert.match(panelSource, /重新扫描/u);
  assert.match(panelSource, /<TagPicker/u);
  assert.match(migrationSource, /remove_deleted_novel_tag_from_catalog/u);
});

test('reader synchronizes catalog revisions and supports paged navigation', () => {
  assert.match(readerSource, /novel\.contentRevision > \(book\.catalogRevision \?\? 0\)/u);
  assert.match(readerSource, /replaceNovelChapters\(book\.id, nextChapters\)/u);
  assert.match(readerSource, /changeReadingMode\('paged'\)/u);
  assert.match(readerSource, /onReaderTouchEnd/u);
  assert.match(readerSource, /全部分类与标签/u);
});
