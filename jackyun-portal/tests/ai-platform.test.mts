import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePersonalSite } from '../src/lib/personal-site.ts';
import { isAdminIdentity } from '../src/lib/admin-auth.ts';
import { collapseStreamingMessageDuplicates } from '../src/lib/ai-conversations.ts';
import { readAiStream } from '../src/lib/ai-stream.ts';

test('personal site validator keeps only safe component types and web links', () => {
  const site = validatePersonalSite({ name: '学习主页', theme: 'purple', blocks: [
    { type: 'heading', text: '学习主页' },
    { type: 'links', title: '资源', items: [{ label: '安全', url: 'https://example.com' }, { label: '脚本', url: 'javascript:alert(1)' }] },
    { type: 'iframe', html: '<iframe src="https://evil.example">' },
  ] });
  assert.equal(site.theme, 'purple');
  assert.deepEqual(site.blocks.map((block) => block.type), ['heading', 'links']);
  const links = site.blocks[1];
  if (links.type === 'links') assert.deepEqual(links.items, [{ label: '安全', url: 'https://example.com' }]);
});

test('quota migration uses server-only atomic reservations and four plans', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260903100000_ai_platform_quotas_and_customization.sql', import.meta.url), 'utf8');
  for (const plan of ['free', 'plus', 'pro', 'ultra']) assert.match(sql, new RegExp(`\\('${plan}'`));
  assert.match(sql, /\('free', 'Free', 20000, 300000, 8000, 5\)/);
  assert.match(sql, /\('pro', 'Pro', 500000, 10000000, 32000, 100\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /SITE_GENERATION_QUOTA_EXCEEDED/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_ai_usage[\s\S]*authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_ai_usage[\s\S]*service_role/);
});

test('LLM proxy strips internal metering controls before forwarding', () => {
  const route = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  assert.match(route, /delete upstreamFields\.feature/);
  assert.match(route, /delete upstreamFields\.providerMode/);
  assert.match(route, /delete upstreamFields\.interfaceLanguage/);
  assert.match(route, /delete upstreamFields\._connection_test/);
  assert.match(route, /delete upstreamFields\._no_thinking/);
  assert.match(route, /delete upstreamFields\.catalogModelId/);
  assert.match(route, /resolveManagedAiModel/);
  assert.match(route, /isGlm53[\s\S]*delete upstreamFields\.thinking[\s\S]*reasoning_effort = 'low'/);
  assert.match(route, /else if \(\(connectionTest \|\| noThinking\) && isBigModel\)[\s\S]*thinking = \{ type: 'disabled' \}/);
  assert.match(route, /reserve_ai_usage/);
  assert.match(route, /finalize_ai_usage/);
  assert.match(route, /keySource === 'cloud' \? model/);
  assert.match(route, /feature === 'reasoning'/);
  assert.match(route, /Math\.ceil\(streamedBytes \/ 8\)/);
  assert.match(route, /if \(!adminClient\)[\s\S]*服务端配额配置/);
  assert.match(route, /supabase\.auth\.getClaims\(\)/);
  assert.match(route, /forceCloudRequest[\s\S]*\? \[\{ data: null \}, \{ data: null \}\]/);
});

test('AI stream parser preserves SSE JSON split across network chunks', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"你',
    '好"}}]}\n',
    'data: {"choices":[{"delta":{"content":"！"}}]}\n\ndata: [DONE]\n',
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk))); controller.close(); },
  });
  const result = await readAiStream(new Response(stream), () => {});
  assert.equal(result.content, '你好！');
});

test('model catalog migration enforces per-plan access and keeps tables server-only', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260908033130_ai_model_catalog_and_plan_access.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE public\.ai_model_catalog/);
  assert.match(sql, /CREATE TABLE public\.plan_ai_model_access/);
  assert.match(sql, /PRIMARY KEY \(plan_code, model_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_model_catalog, public\.plan_ai_model_access FROM anon, authenticated/);
  assert.match(sql, /admin_ai_usage_summary/);
});

test('streaming chat keeps one assistant bubble and repairs old partial duplicates', () => {
  const repaired = collapseStreamingMessageDuplicates([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'A' },
    { role: 'assistant', content: 'An answer' },
    { role: 'system', content: 'tool result' },
    { role: 'assistant', content: 'Done' },
  ]);
  assert.deepEqual(repaired.map((message) => message.content), ['Hello', 'An answer', 'tool result', 'Done']);
  const chat = readFileSync(new URL('../src/components/modules/ai-chat-fab.tsx', import.meta.url), 'utf8');
  assert.match(chat, /streamingMessageId/);
  assert.match(chat, /findIndex\(\(message\) => message\.id === streamingMessageId\)/);
});

test('settings cloud connection test is a bounded minimal probe', () => {
  const panel = readFileSync(new URL('../src/components/settings/ai-config-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /Reply with exactly OK/);
  assert.match(panel, /max_tokens: 64/);
  assert.match(panel, /_connection_test: true/);
  assert.match(panel, /AbortController/);
  assert.match(panel, /20_000/);
});

test('IELTS word lookup reserves enough output for always-thinking GLM models', () => {
  const reading = readFileSync(new URL('../src/components/modules/ielts/reading-workbench.tsx', import.meta.url), 'utf8');
  assert.match(reading, /maxTokens: 1600, noThinking: true/);
  assert.match(reading, /wordCount \* 3\), noThinking: true/);
  assert.match(reading, /stream: true, feature: 'reasoning'/);
  assert.match(reading, /readAiStreamingResponseContent/);
  assert.match(reading, /loading === 'article' && generationProgress/);
  assert.match(reading, /finally \{ setLoading\(null\); setGenerationProgress\(null\); \}/);
  const config = readFileSync(new URL('../src/lib/ai-config.ts', import.meta.url), 'utf8');
  assert.match(config, /body\._no_thinking = true/);
  assert.doesNotMatch(config, /body as Record<string, unknown>\)\.thinking/);
});

test('personal site studio keeps streamed previews stable and exposes direct interactions', () => {
  const studio = readFileSync(new URL('../src/components/modules/personal-site-studio.tsx', import.meta.url), 'utf8');
  assert.match(studio, /const siteId = site\?\.id \?\? crypto\.randomUUID\(\)/);
  assert.match(studio, /type="checkbox"/);
  assert.match(studio, /onProgress\(block\.value \+ 10\)/);
  assert.match(studio, /aria-label="上移组件"/);
  assert.match(studio, /QUICK_PROMPTS/);
});

test('BETA interface tools do not expose arbitrary code execution', () => {
  const tools = readFileSync(new URL('../src/lib/ai-tools.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/settings/ai-visibility-control.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/actions/ai-admin.ts', import.meta.url), 'utf8');
  assert.match(tools, /id: 'customize_interface'/);
  assert.match(tools, /id: 'reset_interface_preferences'/);
  assert.doesNotMatch(tools, /\beval\s*\(/);
  assert.doesNotMatch(tools, /new Function\s*\(/);
  assert.doesNotMatch(tools, /\/api\/ui-customization/);
  assert.doesNotMatch(settings, /\/api\/ui-customization|云端备份/);
  assert.doesNotMatch(admin, /ui_customization_backups/);
});

test('administrator identity is consistent for email and OAuth sign-in', () => {
  const environment = { ADMIN_USERS: 'owner@example.com', ADMIN_EMAILS: 'admin@example.com' } as NodeJS.ProcessEnv;
  assert.equal(isAdminIdentity({ email: 'OWNER@example.com' }, 'user', environment), true);
  assert.equal(isAdminIdentity({ email: 'admin@example.com' }, 'user', environment), true);
  assert.equal(isAdminIdentity({ email: 'member@example.com' }, 'user', environment), false);
  assert.equal(isAdminIdentity({ email: 'member@example.com' }, 'admin', environment), true);
});

test('BETA browser AI bridge covers modern and legacy AI request paths', () => {
  const config = readFileSync(new URL('../src/lib/ai-config.ts', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/components/modules/browser-ai-bridge.tsx', import.meta.url), 'utf8');
  const legacy = readFileSync(new URL('../src/components/modules/legacy-frame.tsx', import.meta.url), 'utf8');
  const extension = readFileSync(new URL('../companion-extension/background.js', import.meta.url), 'utf8');
  assert.match(config, /providerMode\?: 'cloud' \| 'personal' \| 'browser'/);
  assert.match(config, /requestBrowserAi\(messages/);
  assert.match(bridge, /本地网页 AI/);
  assert.match(bridge, /sm:max-w-\[540px\]/);
  assert.match(bridge, /查看完整 Prompt/);
  assert.match(bridge, /activateRequest\(next\)/);
  assert.match(legacy, /JACKYUN_BROWSER_AI_REQUEST/);
  assert.match(extension, /eligibility = await api\('\/beta'\)/);
  assert.match(extension, /prompt_failed/);
  assert.match(extension, /waitForAiReply/);
  assert.match(extension, /AI_AUTOMATION_STATUS/);
  assert.match(extension, /reply_received/);
  const content = readFileSync(new URL('../companion-extension/content.js', import.meta.url), 'utf8');
  const browserAi = readFileSync(new URL('../src/lib/browser-ai.ts', import.meta.url), 'utf8');
  assert.match(content, /AI_READ_RESPONSE/);
  assert.match(content, /JACKYUN_COMPANION_AI_STATUS/);
  assert.match(bridge, /AutomationProgress/);
  assert.match(browserAi, /getBrowserAiConversationTarget/);
  assert.match(bridge, /conversationMode: next\.conversationMode/);
  assert.match(extension, /AI_LIST_CONVERSATIONS/);
  assert.match(extension, /providerConversationUrl/);
  assert.match(extension, /conversationMode === 'selected'/);
  assert.match(content, /message-input-right-button-send/);
  assert.match(content, /JACKYUN_COMPANION_CONVERSATIONS/);
  assert.match(extension, /isConversationUrl/);
  assert.match(extension, /ensureAiPageReady/);
  assert.match(extension, /AI_LIST_MODELS/);
  assert.match(extension, /AI_SELECT_MODEL/);
  assert.match(extension, /消息已发送，已等待/);
  assert.match(content, /bard-mode-menu-button/);
  assert.match(content, /menuitemradio/);
  assert.match(content, /AI_SELECT_MODEL/);
  assert.match(bridge, /Automation heartbeat timeout/);
  assert.doesNotMatch(bridge, />progress_activity</);
  const workspace = readFileSync(new URL('../src/components/ai/ai-workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /JACKYUN_COMPANION_LIST_MODELS/);
  assert.match(workspace, /browserModel=\{selectedModel\.id < 0/);
});

test('admin operations protect the owner, reset quota windows, notify users, and start chats', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260907090000_admin_messaging_quota_resets_and_owner.sql', import.meta.url), 'utf8');
  assert.match(sql, /profiles_single_super_admin_idx/i);
  assert.match(sql, /The super administrator account cannot be suspended/i);
  assert.match(sql, /is_super_admin_user\(\)/i);
  assert.match(sql, /admin_reset_ai_quota/i);
  assert.match(sql, /ai_quota_resets/i);
  assert.match(sql, /admin_start_user_chat/i);
  assert.match(sql, /recipient_user_id, related_ticket_id/i);
  assert.match(sql, /BETA 测试资格已撤销/);
  const users = readFileSync(new URL('../src/components/admin/user-operations-panel.tsx', import.meta.url), 'utf8');
  assert.match(users, /重置每日 AI 额度/);
  assert.match(users, /降级为普通用户/);
  assert.match(users, /发起私聊/);
});

test('notification inbox renders sanitized HTML instead of showing source text', () => {
  const inbox = readFileSync(new URL('../src/components/modules/notification-inbox.tsx', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/components/modules/markdown-renderer.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /<MarkdownRenderer content=\{selected\.content\}/);
  assert.match(renderer, /rehypeRaw/);
  assert.match(renderer, /rehypeSanitize/);
});
