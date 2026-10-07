import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const objectFile = object => `${hash(JSON.stringify([object.bucket, object.path]))}.bin`;

export function validateInventory(inventory) {
  if (inventory?.format !== 'jackyun-storage-inventory-v1' ||
      !/^[a-z]{20}$/.test(inventory.project ?? '') ||
      !Array.isArray(inventory.buckets) || !Array.isArray(inventory.objects)) {
    throw new Error('Invalid storage inventory.');
  }
  const buckets = new Map();
  for (const bucket of inventory.buckets) {
    if (typeof bucket.id !== 'string' || !bucket.id || buckets.has(bucket.id) || typeof bucket.public !== 'boolean') {
      throw new Error('Invalid or duplicate bucket.');
    }
    buckets.set(bucket.id, bucket);
  }
  const keys = new Set();
  const ids = new Set();
  for (const object of inventory.objects) {
    const key = JSON.stringify([object.bucket, object.path]);
    if (!buckets.has(object.bucket) || typeof object.path !== 'string' || !object.path ||
        typeof object.id !== 'string' || !object.id || ids.has(object.id) || keys.has(key) ||
        !Number.isSafeInteger(object.size) || object.size < 0) {
      throw new Error('Invalid, duplicate or size-less object.');
    }
    keys.add(key);
    ids.add(object.id);
  }
  return inventory;
}

// A new directory is mandatory: partial exports never overwrite earlier backups.
// download receives only the inventory object; it must return original, untransformed bytes.
export async function exportStorage(inventory, destination, download) {
  validateInventory(inventory);
  await mkdir(destination, { mode: 0o700 });
  await writeFile(join(destination, 'inventory.json'), JSON.stringify(inventory, null, 2), { flag: 'wx', mode: 0o600 });
  const exported = [];
  for (const object of inventory.objects) {
    const bytes = await download(object);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== object.size) {
      throw new Error('Downloaded object size differs from inventory. Export is incomplete.');
    }
    const file = objectFile(object);
    await writeFile(join(destination, file), bytes, { flag: 'wx', mode: 0o600 });
    exported.push({ ...object, file, sha256: hash(bytes) });
  }
  const manifest = { ...inventory, format: 'jackyun-storage-backup-v1', objects: exported };
  // Created only after every object succeeds; absence means no completed backup.
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return { objects: exported.length, bytes: exported.reduce((sum, object) => sum + object.size, 0) };
}

export async function verifyStorage(destination) {
  const inventory = validateInventory(JSON.parse(await readFile(join(destination, 'inventory.json'), 'utf8')));
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'jackyun-storage-backup-v1' || manifest.project !== inventory.project ||
      JSON.stringify(manifest.buckets) !== JSON.stringify(inventory.buckets) ||
      !Array.isArray(manifest.objects) || manifest.objects.length !== inventory.objects.length) {
    throw new Error('Backup manifest does not match inventory.');
  }
  let total = 0;
  for (let index = 0; index < inventory.objects.length; index++) {
    const source = inventory.objects[index];
    const actual = manifest.objects[index];
    const { file, sha256, ...metadata } = actual;
    if (JSON.stringify(metadata) !== JSON.stringify(source) || file !== objectFile(source) ||
        !/^[a-f0-9]{64}$/.test(sha256 ?? '')) {
      throw new Error('Backup object mapping or digest is invalid.');
    }
    const bytes = await readFile(join(destination, file));
    if (bytes.length !== source.size || hash(bytes) !== sha256) {
      throw new Error('Backup file is missing, truncated or corrupted.');
    }
    total += bytes.length;
  }
  return { objects: inventory.objects.length, bytes: total };
}

async function main() {
  const [command, source, destination] = process.argv.slice(2);
  if (command === 'verify' && source && !destination) {
    console.log(JSON.stringify(await verifyStorage(resolve(source))));
    return;
  }
  if (command !== 'export' || !source || !destination || process.argv.length !== 5) {
    throw new Error('Usage: node scripts/export-supabase-storage.mjs export inventory.json NEW_DIRECTORY | verify DIRECTORY');
  }
  const inventory = validateInventory(JSON.parse(await readFile(resolve(source), 'utf8')));
  // Construct the source host from the validated project, never from object metadata.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY securely on this operator machine.');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(`https://${inventory.project}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await exportStorage(inventory, resolve(destination), async object => {
    const { data, error } = await client.storage.from(object.bucket).download(object.path);
    // Do not log provider errors: they may contain private paths or credentials.
    if (error || !data) throw new Error('Storage download failed; incomplete backup retained for inspection.');
    return new Uint8Array(await data.arrayBuffer());
  });
  await verifyStorage(resolve(destination));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Storage migration failed. Check arguments, inventory, credentials and backup files locally. No completed backup is assumed.');
    process.exitCode = 1;
  });
}
