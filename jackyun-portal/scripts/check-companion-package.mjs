import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

const manifestPath = 'companion-extension/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const popupHtml = readFileSync('companion-extension/popup.html', 'utf8');
const popupSource = readFileSync('companion-extension/popup.js', 'utf8');
for (const [, id] of popupSource.matchAll(/\$\('#([^']+)'\)/g)) {
  if (!popupHtml.includes(`id="${id}"`)) throw new Error(`Popup script references missing element #${id}`);
}
for (const contentScript of manifest.content_scripts || []) {
  for (const file of contentScript.js || []) if (!existsSync(join('companion-extension', file))) throw new Error(`Manifest references missing content script: ${file}`);
}
for (const ruleset of manifest.declarative_net_request?.rule_resources || []) {
  const path = join('companion-extension', ruleset.path);
  if (!existsSync(path)) throw new Error(`Manifest references missing ruleset: ${ruleset.path}`);
  const rules = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(rules) || !rules.length) throw new Error(`Ruleset is empty: ${ruleset.path}`);
}
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
if (release.previewVersion !== manifest.version) throw new Error('Preview version does not match manifest.version');
if (/PRIVATE KEY/.test(readFileSync(manifestPath, 'utf8'))) throw new Error('Private key material found in manifest');

function readVarint(buffer, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error('Invalid protobuf varint');
}

function lengthDelimitedFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 2) {
      const length = readVarint(buffer, offset);
      offset = length.offset;
      fields.push({ field, value: buffer.subarray(offset, offset + length.value) });
      offset += length.value;
    } else if (wire === 0) {
      offset = readVarint(buffer, offset).offset;
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
  return fields;
}

function sourceFiles(directory, root = directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, root);
    return [relative(root, path).split(sep).join('/')];
  }).sort();
}

function assertArchiveMatchesSource(archivePath, label) {
  const archivedFiles = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' })
    .split(/\r?\n/).filter((name) => name && !name.endsWith('/')).sort();
  const expectedFiles = sourceFiles('companion-extension');
  if (JSON.stringify(archivedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`${label} file list differs from companion-extension source`);
  }
  for (const name of expectedFiles) {
    const archived = execFileSync('unzip', ['-p', archivePath, name]);
    const source = readFileSync(join('companion-extension', name));
    if (!archived.equals(source)) throw new Error(`${label} contains stale file: ${name}`);
  }
}

const zipPath = 'public/downloads/jackyun-companion-dev-v1.0.0.zip';
if (existsSync(zipPath)) {
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (/\.pem$|\.key$/m.test(listing)) throw new Error('Private key file included in extension package');
  const zippedManifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'companion-extension/manifest.json'], { encoding: 'utf8' }));
  if (zippedManifest.key !== manifest.key) throw new Error('ZIP manifest identity differs from source manifest');
  const zipSha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  if (release.sha256 !== zipSha256) throw new Error('Release SHA-256 does not match the extension ZIP');
}

const previewZipPath = `public/downloads/jackyun-companion-v${manifest.version}.zip`;
if (!existsSync(previewZipPath)) throw new Error('Preview ZIP is missing');
const previewZipManifest = JSON.parse(execFileSync('unzip', ['-p', previewZipPath, 'manifest.json'], { encoding: 'utf8' }));
if (previewZipManifest.version !== manifest.version || previewZipManifest.key !== manifest.key) throw new Error('Preview ZIP identity differs from source manifest');
const previewZipSha256 = createHash('sha256').update(readFileSync(previewZipPath)).digest('hex');
if (release.previewZipSha256 !== previewZipSha256) throw new Error('Preview ZIP SHA-256 does not match');
assertArchiveMatchesSource(previewZipPath, 'Preview ZIP');

const releaseZipPath = `public/downloads/jackyun-companion-v${release.version}.zip`;
if (!existsSync(releaseZipPath)) throw new Error('Release ZIP is missing');
const releaseZipListing = execFileSync('unzip', ['-Z1', releaseZipPath], { encoding: 'utf8' });
if (/\.pem$|\.key$/m.test(releaseZipListing)) throw new Error('Private key file included in release ZIP');
const releaseZipManifest = JSON.parse(execFileSync('unzip', ['-p', releaseZipPath, 'manifest.json'], { encoding: 'utf8' }));
if (releaseZipManifest.key !== manifest.key) throw new Error('Release ZIP identity differs from source manifest');
const releaseZipSha256 = createHash('sha256').update(readFileSync(releaseZipPath)).digest('hex');
if (release.zipSha256 !== releaseZipSha256) throw new Error('Release ZIP SHA-256 does not match');

const crxPath = `public/downloads/jackyun-companion-v${release.version}.crx`;
if (!existsSync(crxPath)) throw new Error('Signed CRX is missing');
const crx = readFileSync(crxPath);
if (crx.subarray(0, 4).toString('ascii') !== 'Cr24' || crx.readUInt32LE(4) !== 3) throw new Error('Release CRX is not CRX3');
const headerSize = crx.readUInt32LE(8);
const header = crx.subarray(12, 12 + headerSize);
const rsaProof = lengthDelimitedFields(header).find(({ field }) => field === 2)?.value;
const crxPublicKey = rsaProof && lengthDelimitedFields(rsaProof).find(({ field }) => field === 1)?.value;
if (!crxPublicKey || crxPublicKey.toString('base64') !== manifest.key) throw new Error('CRX signing identity differs from manifest.key');
const crxSha256 = createHash('sha256').update(crx).digest('hex');
if (release.crxSha256 !== crxSha256) throw new Error('Release CRX SHA-256 does not match');
const crxPayloadDirectory = mkdtempSync(join(tmpdir(), 'jackyun-companion-crx-'));
try {
  const crxPayloadPath = join(crxPayloadDirectory, 'payload.zip');
  writeFileSync(crxPayloadPath, crx.subarray(12 + headerSize));
  const crxManifest = JSON.parse(execFileSync('unzip', ['-p', crxPayloadPath, 'manifest.json'], { encoding: 'utf8' }));
  if (crxManifest.version !== release.version) throw new Error('Release CRX version differs from stable release manifest');
} finally {
  rmSync(crxPayloadDirectory, { recursive: true, force: true });
}

console.log(`Companion package checks passed (${extensionId ? `fixed ID ${extensionId}` : 'development identity not provisioned'}).`);
