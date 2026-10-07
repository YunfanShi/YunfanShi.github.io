import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { exportStorage, verifyStorage, validateInventory } from './export-supabase-storage.mjs';

export async function importStorageDownloads(inventory, destination, archives) {
  validateInventory(inventory);
  const expected = new Map(inventory.objects.map(object => [JSON.stringify([object.bucket, object.path]), object]));
  const entries = new Map();
  for (const { bucket, bytes } of archives) {
    if (!inventory.buckets.some(item => item.id === bucket)) throw new Error('Archive uses unknown bucket.');
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const key = JSON.stringify([bucket, entry.name]);
      // Read only expected entries into memory; never extract ZIP paths to disk.
      if (entry.unsafeOriginalName !== entry.name || !expected.has(key) || entries.has(key)) {
        throw new Error('Unexpected, duplicate or unsafe ZIP entry.');
      }
      entries.set(key, entry);
    }
  }
  if (entries.size !== expected.size) throw new Error('Downloads do not cover every inventory object.');
  const result = await exportStorage(inventory, destination, object => entries.get(JSON.stringify([object.bucket, object.path])).async('nodebuffer'));
  await verifyStorage(destination);
  return result;
}

async function main() {
  const [inventoryPath, destination, ...archiveArgs] = process.argv.slice(2);
  if (!inventoryPath || !destination || !archiveArgs.length) {
    throw new Error('Usage: node scripts/import-storage-downloads.mjs inventory.json NEW_DIRECTORY bucket=archive.zip ...');
  }
  const inventory = JSON.parse(await readFile(resolve(inventoryPath), 'utf8'));
  const archives = [];
  for (const argument of archiveArgs) {
    const delimiter = argument.indexOf('=');
    if (delimiter < 1 || delimiter === argument.length - 1) throw new Error('Use bucket=archive.zip.');
    archives.push({ bucket: argument.slice(0, delimiter), bytes: await readFile(resolve(argument.slice(delimiter + 1))) });
  }
  console.log(JSON.stringify(await importStorageDownloads(inventory, resolve(destination), archives)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Storage ZIP import failed. Inspect archives and inventory locally; incomplete backup cannot be used.');
    process.exitCode = 1;
  });
}
