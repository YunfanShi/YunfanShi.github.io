import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectDir = new URL('../', import.meta.url);

test('PWA manifest exposes installable identity, shortcuts, and required icons', async () => {
  const manifest = await readFile(new URL('src/app/manifest.ts', projectDir), 'utf8');
  assert.match(manifest, /id:\s*'\/'/);
  assert.match(manifest, /jackyun-icon-192\.png/);
  assert.match(manifest, /sizes:\s*'512x512'/);
  assert.match(manifest, /shortcuts:/);
});

test('service worker keeps APIs network-only and serves cached React routes before the static fallback', async () => {
  const worker = await readFile(new URL('public/sw.js', projectDir), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /OFFLINE_APP_ROUTES/);
  assert.match(worker, /NAVIGATION_CACHE/);
  assert.match(worker, /cachedRoute/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /CLEAR_USER_CACHE/);
  assert.match(worker, /WARM_OFFLINE_ROUTES/);
});

test('offline workspace stores snapshots and queued operations per authenticated user', async () => {
  const store = await readFile(new URL('src/lib/offline/workspace.ts', projectDir), 'utf8');
  const sync = await readFile(new URL('src/components/layout/offline-workspace-sync.tsx', projectDir), 'utf8');
  const route = await readFile(new URL('src/app/api/offline/workspace/route.ts', projectDir), 'utf8');
  assert.match(store, /userId/);
  assert.match(store, /bindOfflineWorkspaceUser/);
  assert.match(store, /queueOfflineMutation/);
  assert.match(sync, /navigator\.onLine/);
  assert.match(sync, /已记录，联网后同步/);
  assert.match(route, /task\.toggle/);
  assert.match(route, /review\.attempt/);
});

test('logout clears offline API data and uses a local Supabase sign-out scope', async () => {
  const logout = await readFile(new URL('src/components/auth/logout-button.tsx', projectDir), 'utf8');
  const auth = await readFile(new URL('src/actions/auth.ts', projectDir), 'utf8');
  assert.match(logout, /clearOfflineWorkspace/);
  assert.match(logout, /CLEAR_USER_CACHE/);
  assert.match(auth, /signOut\(\{ scope: 'local' \}\)/);
});

test('service worker is served with update-safe security headers', async () => {
  const config = await readFile(new URL('next.config.ts', projectDir), 'utf8');
  assert.match(config, /source:\s*'\/sw\.js'/);
  assert.match(config, /no-cache, no-store, must-revalidate/);
  assert.match(config, /Service-Worker-Allowed/);
});

test('products page owns PWA installation and root layout registers lifecycle handling', async () => {
  const topbar = await readFile(new URL('src/components/layout/topbar.tsx', projectDir), 'utf8');
  const layout = await readFile(new URL('src/app/layout.tsx', projectDir), 'utf8');
  const lifecycle = await readFile(new URL('src/components/layout/pwa-lifecycle.tsx', projectDir), 'utf8');
  const products = await readFile(new URL('public/products.html', projectDir), 'utf8');
  assert.doesNotMatch(topbar, /PwaInstallButton/);
  assert.match(products, /beforeinstallprompt/);
  assert.match(products, /jackyun-companion-v1\.7\.8\.zip/);
  assert.match(layout, /<PwaLifecycle \/>/);
  assert.match(lifecycle, /if \(!reloadRequested\.current\) return/);
});

test('settings links to the standalone Products experience', async () => {
  const settings = await readFile(new URL('src/components/settings/settings-content.tsx', projectDir), 'utf8');
  const config = await readFile(new URL('next.config.ts', projectDir), 'utf8');
  assert.match(settings, /href="\/products"/);
  assert.match(config, /source:\s*'\/products'[\s\S]*destination:\s*'\/products\.html'/);
});
