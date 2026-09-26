import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const products = readFileSync(new URL('../public/products.html', import.meta.url), 'utf8');
const source = products.slice(products.indexOf('    let deferredInstallPrompt = null;'), products.indexOf("    fetch('/downloads/companion-release.json')"));
function setup(userAgent, overrides = {}) {
  const elements = new Map();
  const element = (id) => { if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, innerHTML: '', addEventListener() {}, classList: { add() {}, remove() {} } }); return elements.get(id); };
  const events = {};
  const context = { navigator: { userAgent, platform: '', maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }), window: { isSecureContext: true }, document: { getElementById: element, querySelectorAll: () => [] }, addEventListener: (key, fn) => { events[key] = fn; }, ...overrides };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, events, elements, element };
}
test('installation page has its own manifest and worker registration', () => {
  assert.match(products, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(products, /serviceWorker.register\('\/sw.js'/);
});
for (const [name, ua, expected] of [
  ['iPhone Chrome', 'iPhone CriOS/140 Safari', /Safari.*添加到主屏幕/s],
  ['iPhone Edge', 'iPhone EdgiOS/140 Safari', /Safari.*添加到主屏幕/s],
  ['Mac Safari', 'Macintosh Version/26 Safari/605', /添加到程序坞/],
  ['Android Chrome', 'Android Chrome/140 Safari/537', /Android Chrome \/ Edge/],
  ['Android Edge', 'Android EdgA/140 Safari/537', /Android Chrome \/ Edge/],
  ['desktop Edge', 'Windows Edg/140', /电脑 Edge/],
  ['desktop Chrome', 'Windows Chrome/140 Safari/537', /电脑 Chrome/],
]) test(`${name} receives useful manual installation steps without a native prompt`, async () => {
  const { context, element } = setup(ua);
  await vm.runInContext('installPwa()', context);
  assert.match(element('modal-content').innerHTML, expected);
});
test('native prompt rejection falls back to manual steps', async () => {
  const { context, events, element } = setup('Chrome/140');
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { throw new Error('not allowed'); } });
  await vm.runInContext('installPwa()', context);
  assert.match(element('modal-content').innerHTML, /电脑 Chrome/);
});
test('native prompt is consumed once, installed event disables installation', async () => {
  const { context, events, element } = setup('Chrome/140');
  let calls = 0;
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { calls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await vm.runInContext('installPwa()', context);
  await vm.runInContext('installPwa()', context);
  assert.equal(calls, 1);
  events.appinstalled(); assert.equal(element('install-pwa').disabled, true);
});
test('mobile study keeps memo and navigation available and long definitions in document flow', () => {
  const control = readFileSync(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  assert.match(control, /aria-expanded={memoOpen}[^>]*>CUE 备忘录/);
  assert.match(control, /grid grid-cols-3[^\n]*aria-label="日程视图"/);
  assert.match(control, /sm:hidden[^\n]*显示答案与判分依据/);
  assert.match(control, /max-h-\[70dvh\]/);
});
