import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// These suites intentionally mutate a loopback fixture, never a live account.
const base = process.env.JACKYUN_TEST_URL || 'http://127.0.0.1:3154';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('UI acceptance requires a loopback fixture application');
const output = process.env.JACKYUN_UI_ACCEPTANCE_OUTPUT || 'artifacts/verification/ui-acceptance';
mkdirSync(output, { recursive: true });
const suites = [
  'ui-modernization', 'ui-shell', 'ui-shell-auth', 'navigation-feedback',
  'admin-ui', 'admin-announcement', 'admin-announcement-crud', 'quiz-ui',
  'ielts-dashboard', 'resource-directory', 'settings-ui', 'support-conversation',
  'reading-studio', 'novel-reading-position', 'quick-task-ui', 'active-legacy-ui',
  'study-guide-state', 'music-player-state', 'countdown-state', 'answer-sheet-legacy',
  'class-timeline:mts', 'cue-session-settings:mts', 'cue-route-draft:mts', 'cue-search:mts',
  'review-queue', 'mobile-navigation', 'sync-status-indicator', 'practice-cloud:mts', 'ielts-timer:mts',
  'offline-practice:mts', 'dida-schedule-ui:mts', 'ui-modernization-performance',
];
const results = [];
for (const suite of suites) {
  const [name, extension = 'mjs'] = suite.split(':');
  const directory = path.join(output, name);
  mkdirSync(directory, { recursive: true });
  const args = [`tests/${name}.browser.${extension}`];
  if (name === 'ui-modernization-performance') args.push('candidate', path.join(directory, 'performance.json'));
  const start = Date.now();
  const result = spawnSync(process.execPath, args, {
    env: { ...process.env, JACKYUN_TEST_URL: base, JACKYUN_AUTH_TEST_URL: base, JACKYUN_UI_ARTIFACTS: directory, JACKYUN_SCREENSHOT_DIR: directory },
    encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(path.join(directory, 'run.log'), `${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`);
  const passed = result.status === 0 && !result.error;
  results.push({ suite, passed, exitCode: result.status, durationMs: Date.now() - start });
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, node: process.version, results, limitations: ['Loopback fixtures, not production Auth/RLS or cloud accounts', 'Browser viewport emulation, not physical Android/iOS'] }, null, 2));
  console.log(`${passed ? 'PASS' : 'FAIL'} ${suite} (${Date.now() - start} ms)`);
  if (!passed) console.error((result.stderr || result.error?.message || '').slice(-1600));
}
process.exitCode = results.every(result => result.passed) ? 0 : 1;
