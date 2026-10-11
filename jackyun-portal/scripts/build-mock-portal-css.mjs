import { readFile, writeFile, mkdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const content = await readFile('public/MockPortal.html', 'utf8');
const result = await postcss([tailwindcss({
  content: [{ raw: content, extension: 'html' }],
  theme: { extend: { colors: { primary: '#1A73E8', success: '#34A853', warning: '#FBBC04', danger: '#EA4335' } } },
})]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
await mkdir('public/shared', { recursive: true });
await writeFile('public/shared/mock-portal.css', result.css);
console.log('Built local MockPortal styles');
