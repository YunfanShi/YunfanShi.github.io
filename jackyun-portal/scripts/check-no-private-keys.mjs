import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const pemMarker = ['BEGIN', '(?:RSA |EC |OPENSSH )?PRIVATE KEY'].join(' ');
const forbidden = new RegExp(pemMarker);
const ignored = new Set(['node_modules', '.next', '.git', 'scripts']);
const findings = [];

// The local migration directory contains protected credentials and private backups.
// Do not inspect its contents, but fail if anyone force-adds it to the Git index.
const migrationIndex = spawnSync('git', ['ls-files', '--', '.migration-private'], { cwd: root, encoding: 'utf8' });
if (migrationIndex.error || migrationIndex.status !== 0) {
  throw new Error('Cannot verify that private migration files are excluded from Git.');
}
if (migrationIndex.stdout.trim()) {
  console.error('Private migration files must not be tracked or staged in Git.');
  process.exit(1);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    if (dir === root && name === '.migration-private') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (name.endsWith('.pem') || (stat.size < 2_000_000 && forbidden.test(readFileSync(path, 'utf8')))) findings.push(path);
  }
}

walk(root);
if (findings.length) {
  console.error(`Private key material found in:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('No private key PEM markers found.');
