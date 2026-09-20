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

test('service worker keeps account routes network-only and provides a static offline fallback', async () => {
  const worker = await readFile(new URL('public/sw.js', projectDir), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /offline\.html/);
  assert.doesNotMatch(worker, /cache\.put\(request[\s\S]*request\.mode === 'navigate'/);
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
