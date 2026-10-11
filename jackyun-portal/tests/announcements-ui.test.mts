import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as domain from '../src/lib/announcements.ts';
const require = createRequire(import.meta.url);
const item = { id: 'test-notice', title: 'CUE 功能暂时维护', content: '正在修复，请先使用答题卡。', content_type: 'markdown', delivery_type: 'banner', category: 'bug', priority: 'urgent', is_pinned: true, scope_type: 'pages', target_paths: ['/schedule'], incident_status: 'investigating', action_label: '查看帮助', action_url: '/help', is_active: true, start_time: null, end_time: null, created_at: '2026-10-06T02:00:00Z', updated_at: '2026-10-06T02:00:00Z', revision: 1, recipient_user_id: null };
function load(path: string, mocks: Record<string, unknown>, globals = {}) {
  const compiled = { exports: {} as Record<string, React.ComponentType> };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module: compiled, exports: compiled.exports, require: (name: string) => mocks[name] ?? (name === '@/lib/site-dialog' ? { siteAlert: async () => {}, siteConfirm: async () => true } : require(name)), ...globals });
  return compiled.exports;
}
const badges = load('../src/components/modules/announcement-content.tsx', { '@/lib/announcements': domain });
const markdown = { __esModule: true, default: ({ content }: { content: string }) => React.createElement('p', null, content) };

test('admin editor saves categories, page targets, dates and recovery reminders; preview makes no writes', async () => {
  const saved: Array<{ id: string; input: Record<string, unknown> }> = [];
  let save: (() => Promise<void>) | undefined;
  let stateIndex = 0;
  let preview = false;
  const form = { ...item, custom_paths: '/ielts', start_time: domain.announcementLocalTime('2026-10-07T02:00:00Z'), end_time: domain.announcementLocalTime('2026-10-07T04:00:00Z'), notify_again: true };
  const jsx = require('react/jsx-runtime');
  const runtime = { ...jsx, jsx: (type: unknown, props: { children?: unknown; onClick?: () => Promise<void> }, key: unknown) => { if (type === 'button' && props.children === '保存公告') save = props.onClick; return jsx.jsx(type, props, key); } };
  const hooks = { ...React, useEffect: () => {}, useState: (initial: unknown) => {
    const index = stateIndex++;
    const overrides: Record<number, unknown> = { 0: [item], 1: false, 7: true, 8: item.id, 9: form, 11: preview };
    return [index in overrides ? overrides[index] : initial, () => {}];
  } };
  const component = load('../src/components/admin/announcements-manager.tsx', {
    react: hooks, 'react/jsx-runtime': runtime, '@/lib/announcements': domain,
    '@/components/modules/announcement-content': badges, '@/components/modules/markdown-renderer': markdown,
    '@/actions/admin': { getAllNotifications: async () => [item], updateNotification: async (id: string, input: Record<string, unknown>) => { saved.push({ id, input }); return { success: true }; } },
  }).NotificationManagerPanel;
  const html = renderToStaticMarkup(React.createElement(component));
  assert.ok(html.includes('BUG / 故障')); assert.match(html, /重新提醒已读用户/); assert.match(html, /指定页面/); assert.ok(html.includes('/schedule'));
  assert.ok(save); await save();
  assert.equal(saved.length, 1); assert.equal(saved[0].input.category, 'bug'); assert.equal(saved[0].input.delivery_type, 'banner');
  assert.deepEqual(Array.from(saved[0].input.target_paths as string[]), ['/schedule', '/ielts']);
  assert.equal(saved[0].input.start_time, '2026-10-07T02:00:00.000Z'); assert.equal(saved[0].input.notify_again, true);
  stateIndex = 0; preview = true;
  const previewHtml = renderToStaticMarkup(React.createElement(component));
  assert.match(previewHtml, /此页面在显示范围内/); assert.match(previewHtml, /查看帮助/); assert.match(previewHtml, /预览不会发布/);
  assert.equal(saved.length, 1);
  if (process.env.ANNOUNCEMENT_PREVIEW_FILE) writeFileSync(process.env.ANNOUNCEMENT_PREVIEW_FILE, html);
});
test('page banners disappear immediately on navigation and do not render a modal', () => {
  let path = '/schedule';
  const component = load('../src/components/modules/site-announcements.tsx', {
    react: { ...React, useState: () => [{ userId: 'tester', items: [item] }, () => {}], useEffect: () => {} },
    'next/navigation': { usePathname: () => path },
    '@/components/auth/auth-mode-provider': { useAuthMode: () => ({ signedIn: true, userId: 'tester' }) },
    '@/lib/notification-client': { useNotificationSnapshot: () => ({ snapshot: { items: [item] } }) },
    '@/lib/announcements': domain, './announcement-content': badges, './markdown-renderer': markdown, '@/actions/admin': {},
  }).default;
  const banner = renderToStaticMarkup(React.createElement(component));
  assert.match(banner, /当前页面公告/); assert.match(banner, /CUE 功能暂时维护/); assert.doesNotMatch(banner, /role="dialog"/);
  path = '/music'; assert.equal(renderToStaticMarkup(React.createElement(component)), '');
  path = '/scheduler'; assert.equal(renderToStaticMarkup(React.createElement(component)), '');
});

test('shared inbox retains public announcements when no support ticket is open', () => {
  let stateIndex = 0;
  const component = load('../src/components/modules/notification-inbox.tsx', {
    react: { ...React, useEffect: () => {}, useState: (initial: unknown) => [stateIndex++ === 1 ? true : initial, () => {}] },
    'next/dynamic': { __esModule: true, default: () => () => null },
    'next/navigation': { usePathname: () => '/schedule' },
    '@/components/auth/auth-mode-provider': { useAuthMode: () => ({ userId: 'tester' }) },
    '@/lib/notification-client': { useNotificationSnapshot: () => ({ snapshot: { items: [{ ...item, related_ticket_id: null, is_read: false }] }, refresh: () => {} }) },
    '@/lib/announcements': domain, './announcement-content': badges,
    '@/actions/admin': {},
  }, { window: { setInterval: () => 1, addEventListener: () => {}, removeEventListener: () => {}, clearInterval: () => {} } }).default;
  const html = renderToStaticMarkup(React.createElement(component));
  assert.match(html, /CUE 功能暂时维护/);
});
