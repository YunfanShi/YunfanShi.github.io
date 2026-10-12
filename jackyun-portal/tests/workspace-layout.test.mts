import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceLayout, browserWorkspaceLayout } from '../src/lib/workspace-layout.ts';
test('phone portrait and touch landscape have a dedicated layout', () => {
  assert.equal(workspaceLayout(390, 844, true), 'phone');
  assert.equal(workspaceLayout(844, 390, true), 'phone');
  assert.equal(workspaceLayout(320, 568, false), 'phone');
});
test('a software keyboard cannot turn a tablet into a landscape phone', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const viewport = { innerWidth: 900, innerHeight: 1000, matchMedia: () => ({ matches: true }) };
  let editing = false;
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: viewport });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: { matches: () => editing } } });
    assert.equal(browserWorkspaceLayout(), 'tablet');
    editing = true; viewport.innerHeight = 420;
    assert.equal(browserWorkspaceLayout(), 'tablet');
    // A real rotation also changes width, so it reclassifies the layout.
    viewport.innerWidth = 844; viewport.innerHeight = 390;
    assert.equal(browserWorkspaceLayout(), 'phone');
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
test('wide touch tablets retain tablet layout in both orientations', () => {
  for (const [width, height] of [[768,1024],[1024,768],[1180,820],[1366,1024]]) assert.equal(workspaceLayout(width, height, true), 'tablet');
});
test('a touchscreen laptop with a primary fine pointer keeps desktop layout', () => {
  assert.equal(workspaceLayout(1440, 900, false), 'desktop');
  assert.equal(workspaceLayout(1024, 768, false), 'desktop');
  assert.equal(workspaceLayout(900, 700, false), 'tablet');
});
