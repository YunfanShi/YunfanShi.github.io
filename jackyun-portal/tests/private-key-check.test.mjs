import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jackyun-secret-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('../scripts/check-no-private-keys.mjs', import.meta.url), join(root, 'scripts/check-no-private-keys.mjs'));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
  writeFileSync(join(root, '.gitignore'), '.migration-private/\n');
  mkdirSync(join(root, '.migration-private'));
  const run = () => spawnSync(process.execPath, ['scripts/check-no-private-keys.mjs'], { cwd: root, encoding: 'utf8' });
  return { root, run };
}

test('ignored migration backups and certificate bundles are not read as application secrets', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, '.migration-private', 'roots.pem'), 'local certificate bundle');
  writeFileSync(join(root, '.migration-private', 'source-password.dpapi'), 'encrypted test fixture');
  assert.equal(run().status, 0);
});

test('force-added private migration files fail before their contents are scanned', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, '.migration-private', 'source-password.dpapi'), 'encrypted test fixture');
  assert.equal(spawnSync('git', ['add', '-f', '.migration-private/source-password.dpapi'], { cwd: root }).status, 0);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not be tracked or staged/u);
  assert.doesNotMatch(result.stderr, /encrypted test fixture/u);
});

test('private key markers in ordinary application files remain rejected', (t) => {
  const { root, run } = fixture(t);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'leaked-key.txt'), ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /leaked-key/u);
});
