import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('website branding uses the supplied JackYun logo everywhere', async () => {
  const logo = await readFile(new URL('public/jackyun-logo.png', projectDir));
  assert.equal(createHash('sha256').update(logo).digest('hex'), '844210f193d8be99ba8e2cb67562bd2c57d844f2e3394f6cd1f9d26713a0224e');

  const brandComponent = await readFile(new URL('src/components/brand-logo.tsx', projectDir), 'utf8');
  const products = await readFile(new URL('public/products.html', projectDir), 'utf8');
  const offlineIndex = await readFile(new URL('public/index.html', projectDir), 'utf8');
  assert.match(brandComponent, /src="\/jackyun-logo\.png"/);
  assert.match(products, /src="\/jackyun-logo\.png"/);
  assert.match(offlineIndex, /src="jackyun-logo\.png"/);
  assert.doesNotMatch(products, /jackyun-icon\.svg|>JY</);
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

test('logout preserves pending work, clears worker cache, and uses local sign-out', async () => {
  const logout = await readFile(new URL('src/components/auth/logout-button.tsx', projectDir), 'utf8');
  const auth = await readFile(new URL('src/app/api/auth/signout/route.ts', projectDir), 'utf8');
  assert.match(logout, /saveCurrentLocalBackups/);
  assert.match(logout, /listOfflineMutations/);
  assert.match(logout, /unsent.length \|\| offline.length/);
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


test('mobile topbar uses a fixed-size logo and hides brand text and the BETA badge', async () => {
  const topbar = await readFile(new URL('src/components/layout/topbar.tsx', projectDir), 'utf8');
  assert.match(topbar, /aria-label="JackYun 主页" className="[^"\n]*shrink-0[^"\n]*md:hidden"/);
  assert.match(topbar, /<BrandLogo size=\{32\} className="h-8 w-8 shrink-0"/);
  assert.match(topbar, /<div className="hidden min-w-0 md:block">/);
  assert.match(topbar, /href="\/beta" className="hidden [^"\n]*md:inline-flex/);
});
