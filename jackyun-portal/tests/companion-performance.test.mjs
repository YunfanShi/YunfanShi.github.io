import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const extension = new URL('../companion-extension/', import.meta.url);
const background = readFileSync(new URL('background.js', extension), 'utf8');
const popup = readFileSync(new URL('popup.js', extension), 'utf8');

test('popup cold start uses one local bootstrap request', () => {
  assert.match(background, /message\.type === 'POPUP_BOOTSTRAP'/);
  assert.match(background, /async function getPopupBootstrap\(\)/);
  assert.match(popup, /send\(\{ type: 'POPUP_BOOTSTRAP' \}\)/);

  for (const legacyRequest of ['STATUS', 'SAFEGUARD_GET_CONFIG', 'TOOLS_GET_CONFIG', 'ADBLOCK_GET_CONFIG', 'BETA_AI_LOGS']) {
    assert.doesNotMatch(popup, new RegExp(`send\\(\\{ type: '${legacyRequest}' \\}\\)`));
  }
});
