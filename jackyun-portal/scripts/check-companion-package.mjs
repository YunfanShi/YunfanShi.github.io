import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifestPath = 'companion-extension/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (typeof manifest.key !== 'undefined') {
  if (typeof manifest.key !== 'string' || !manifest.key || /\s/.test(manifest.key) || !/^[A-Za-z0-9+/]+={0,2}$/.test(manifest.key)) {
    throw new Error('manifest.key must be a single-line Base64 public key');
  }
}
if (/PRIVATE KEY/.test(readFileSync(manifestPath, 'utf8'))) throw new Error('Private key material found in manifest');

const zipPath = 'public/downloads/jackyun-companion-dev-v1.0.0.zip';
if (existsSync(zipPath)) {
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (/\.pem$|\.key$/m.test(listing)) throw new Error('Private key file included in extension package');
}

console.log(`Companion package checks passed (${manifest.key ? 'public key present' : 'development identity not provisioned'}).`);
