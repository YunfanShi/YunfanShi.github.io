import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const manifestPath = 'companion-extension/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (typeof manifest.key !== 'undefined') {
  if (typeof manifest.key !== 'string' || !manifest.key || /\s/.test(manifest.key) || !/^[A-Za-z0-9+/]+={0,2}$/.test(manifest.key)) {
    throw new Error('manifest.key must be a single-line Base64 public key');
  }
}
const extensionId = manifest.key
  ? [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)]
      .map((hex) => 'abcdefghijklmnop'[Number.parseInt(hex, 16)]).join('')
  : null;
const release = JSON.parse(readFileSync('public/downloads/companion-release.json', 'utf8'));
if (extensionId && release.extensionId !== extensionId) throw new Error('Release extensionId does not match manifest.key');
if (/PRIVATE KEY/.test(readFileSync(manifestPath, 'utf8'))) throw new Error('Private key material found in manifest');

const zipPath = 'public/downloads/jackyun-companion-dev-v1.0.0.zip';
if (existsSync(zipPath)) {
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (/\.pem$|\.key$/m.test(listing)) throw new Error('Private key file included in extension package');
  const zippedManifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'companion-extension/manifest.json'], { encoding: 'utf8' }));
  if (zippedManifest.key !== manifest.key) throw new Error('ZIP manifest identity differs from source manifest');
  const zipSha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  if (release.sha256 !== zipSha256) throw new Error('Release SHA-256 does not match the extension ZIP');
}

console.log(`Companion package checks passed (${extensionId ? `fixed ID ${extensionId}` : 'development identity not provisioned'}).`);
