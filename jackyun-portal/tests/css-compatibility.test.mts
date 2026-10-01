import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import config from '../tailwind.config.mjs';
import { retryStylesheet } from '../src/lib/stylesheet-recovery.ts';

const input = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const result = await postcss([tailwindcss(config), autoprefixer]).process(input, { from: new URL('../src/app/globals.css', import.meta.url).pathname });

test('app utilities use CSS readable by older Android engines', () => {
  // Old engines drop entire @layer blocks, losing all v4 layout utilities.
  assert.equal(/@layer\b|@property\b|oklch\(/.test(result.css), false, 'core utilities must not require modern CSS layers or colors');
  assert.match(result.css, /\.flex\s*\{\s*display: flex/);
  assert.match(result.css, /\.hidden\s*\{\s*display: none/);
  assert.match(result.css, /@media \(min-width: 768px\)/);
  assert.match(result.css, /transform: translate/);
  assert.match(result.css, /\.bg-white\s*\{[^}]*background-color: rgb\(/);
});

test('both dark and gray themes and article typography are generated', () => {
  assert.match(result.css, /dark\\:bg-.*data-theme="gray".*data-theme="dark"/);
  assert.match(result.css, /\.prose\s*\{/);
});

function link(overrides = {}) {
  return { rel: 'stylesheet', href: 'https://example.com/_next/static/css/app.css?dpl=current', disabled: false, sheet: null, dataset: {}, ...overrides } as unknown as HTMLLinkElement;
}

test('missing CSS retries once without reloading the page or dropping deployment query', () => {
  const stylesheet = link();
  assert.equal(retryStylesheet(stylesheet, 'https://example.com'), true);
  assert.equal(new URL(stylesheet.href).searchParams.get('dpl'), 'current');
  assert.equal(new URL(stylesheet.href).searchParams.get('_jackyun_css_retry'), '1');
  assert.equal(retryStylesheet(stylesheet, 'https://example.com'), false);
});

test('loaded, disabled and third-party stylesheets are left alone', () => {
  for (const stylesheet of [link({ sheet: {} }), link({ disabled: true }), link({ href: 'https://cdn.example.com/site.css' }), link({ href: 'https://example.com/other.css' })]) {
    assert.equal(retryStylesheet(stylesheet, 'https://example.com'), false);
  }
});
