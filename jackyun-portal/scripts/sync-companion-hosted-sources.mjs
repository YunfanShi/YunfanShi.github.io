import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const checkOnly = process.argv.includes('--check');
const sourceDirectory = 'public/userscripts';
const targetDirectory = 'companion-extension/hosted-sources';
const sources = [
  ['jackyun-portal-companion.user.js', 'Companion Lite', 'reference'],
  ['znotes-quiz-helper.user.js', 'ZNotes Quiz Helper', 'integrated'],
  ['bestexam-batch-downloader.user.js', 'BestExam Batch Downloader', 'integrated'],
  ['discord-image-shield.user.js', 'Discord Image Shield', 'integrated-lite'],
  ['timezone-panel.user.js', 'Timezone Panel', 'integrated-lite'],
  ['jacks-ultimate-focus.user.js', 'Ultimate Focus', 'reference'],
  ['relax-interpreter.user.js', 'Relax Interpreter', 'reference'],
  ['save-my-exams-console.user.js', 'Save My Exams Console', 'source-only'],
  ['tr3000-manager.user.js', 'TR3000 Manager', 'source-only'],
];
const catalog = `${JSON.stringify({
  generatedFrom: '/userscripts',
  note: 'Exact hosted-source snapshots. Runtime integrations live in ../integrated-tools.js and are independently configurable.',
  scripts: sources.map(([file, name, integration]) => ({ file, name, integration })),
}, null, 2)}\n`;

if (!checkOnly) mkdirSync(targetDirectory, { recursive: true });
for (const [file] of sources) {
  const source = join(sourceDirectory, file);
  const target = join(targetDirectory, basename(file));
  if (!existsSync(source)) throw new Error(`Missing hosted source: ${source}`);
  if (checkOnly) {
    if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) throw new Error(`Bundled source is stale: ${file}`);
  } else copyFileSync(source, target);
}
const catalogPath = join(targetDirectory, 'catalog.json');
if (checkOnly) {
  if (!existsSync(catalogPath) || readFileSync(catalogPath, 'utf8') !== catalog) throw new Error('Bundled source catalog is stale');
} else writeFileSync(catalogPath, catalog);

console.log(checkOnly ? 'Companion hosted sources are current.' : `Bundled ${sources.length} hosted sources into Companion.`);
