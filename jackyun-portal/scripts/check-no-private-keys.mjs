import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pemMarker = ['BEGIN', '(?:RSA |EC |OPENSSH )?PRIVATE KEY'].join(' ');
const forbidden = new RegExp(pemMarker);
const ignored = new Set(['node_modules', '.next', '.git', 'scripts']);
const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
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
