import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const privateRoot = join(root, '.migration-private');
const selected = [
  'azure/backend/errors.mjs', 'azure/backend/auth.mjs', 'azure/backend/account-state.mjs', 'azure/backend/backup-capture.mjs', 'azure/backend/database.mjs',
  'azure/backend/sync-api.mjs', 'azure/backend/sync-v4.mjs', 'azure/backend/sync-v5.mjs', 'azure/backend/server.mjs', 'azure/backend/functions-adapter.mjs',
  'azure/backend/functions.mjs', 'src/lib/local-workspace.ts', 'src/lib/error-codes.ts', 'src/lib/sync/hash.ts',
  'src/lib/sync/schedule-safety.ts', 'src/lib/sync/delta.ts', 'src/lib/sync/transfer.ts', 'src/lib/sync/compression.ts', 'src/lib/sync/resource-model.ts', 'src/lib/sync/writing-resource-model.ts',
];

export async function buildFunctionPackage(outputDirectory = privateRoot) {
  const output = resolve(outputDirectory);
  const within = relative(privateRoot, output);
  if (within.startsWith(`..${sep}`) || within === '..' || resolve(privateRoot, within) !== output) throw new Error('Output must remain within the ignored migration directory');
  await mkdir(output, { recursive: true });
  const stage = join(output, `functions-stage-${randomUUID()}`);
  await mkdir(stage);
  for (const path of selected) {
    const target = join(stage, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(join(root, path), target);
  }
  const pkg = JSON.parse(await readFile(join(root, 'azure/backend/functions-package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'azure/backend/package-lock.json'), 'utf8'));
  lock.name = pkg.name;
  lock.version = pkg.version;
  lock.packages[''].name = pkg.name;
  lock.packages[''].version = pkg.version;
  if (JSON.stringify(lock.packages[''].dependencies) !== JSON.stringify(pkg.dependencies)) throw new Error('Function dependencies must exactly match the verified backend lockfile');
  await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(join(stage, 'package-lock.json'), JSON.stringify(lock, null, 2));
  await copyFile(join(root, 'azure/backend/host.json'), join(stage, 'host.json'));
  if (!process.env.npm_execpath) throw new Error('Run this packager through npm run build:azure-functions');
  const install = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, encoding: 'utf8' });
  if (install.error || install.status !== 0) throw new Error('Installing the locked production dependencies failed');
  const zip = new JSZip();
  const files = [];
  async function add(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not permitted in the deployment package');
      if (entry.isDirectory()) await add(path);
      else {
        const name = relative(stage, path).split(sep).join('/');
        const bytes = await readFile(path);
        zip.file(name, bytes);
        files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await add(stage);
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const archive = join(output, `jackyun-functions-${pkg.version}-${randomUUID()}.zip`);
  await writeFile(archive, bytes);
  const manifest = { version: pkg.version, archive, stage, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), files };
  await writeFile(`${archive}.manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildFunctionPackage(process.argv[2]);
  console.log(JSON.stringify({ archive: result.archive, stage: result.stage, bytes: result.bytes, sha256: result.sha256, files: result.files.length }));
}
