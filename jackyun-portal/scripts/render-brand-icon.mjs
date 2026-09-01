import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ImageResponse } from 'next/og.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const workspaceDir = path.resolve(projectDir, '..');
const svgPath = path.join(projectDir, 'public', 'jackyun-icon.svg');
const svg = await readFile(svgPath, 'utf8');
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

async function render(size) {
  const response = new ImageResponse(
    {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: { type: 'img', props: { src: source, width: size, height: size } },
      },
    },
    { width: size, height: size },
  );
  return Buffer.from(await response.arrayBuffer());
}

const png512 = await render(512);
await Promise.all([
  writeFile(path.join(projectDir, 'public', 'Webicon.png'), png512),
  writeFile(path.join(workspaceDir, 'Webicon.png'), png512),
]);

console.log('Rendered JackYun brand icon: public/Webicon.png and ../Webicon.png');
