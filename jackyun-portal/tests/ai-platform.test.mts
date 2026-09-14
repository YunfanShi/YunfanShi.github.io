import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePersonalSite } from '../src/lib/personal-site.ts';
import { isAdminIdentity } from '../src/lib/admin-auth.ts';
import { collapseStreamingMessageDuplicates } from '../src/lib/ai-conversations.ts';
import { readAiStream } from '../src/lib/ai-stream.ts';
import { expectsStructuredAiResponse, hasNewAiResponse, selectAiResponseText } from '../companion-extension/ai-response-detection.mjs';
import { extractTtsText, stripTtsAnnotations } from '../src/lib/tts-config.ts';
import { parseProviderModels } from '../src/lib/ai-provider-models.ts';
import { AI_PROVIDER_PRESETS } from '../src/lib/ai-provider-presets.ts';
import { buildSmartSelectionMessages, parseSmartSelection } from '../src/lib/ai-smart-selection.ts';
import { classifyAiModelFailure } from '../src/lib/ai-model-health.ts';
import { inferAiModelCapabilities } from '../src/lib/ai-model-capabilities.ts';

test('TTS annotations stay hidden and subtitles use only the selected language', () => {
  const escaped = '正文内容\n\n[TTS\\_LANG:zh-CN]中文朗读摘要。[/TTS\\_LANG]\n[TTS_LANG:en-US]English subtitle.[/TTS_LANG]';
  assert.equal(stripTtsAnnotations(escaped), '正文内容');
  assert.equal(extractTtsText(escaped), '中文朗读摘要。');
  assert.equal(stripTtsAnnotations('正文内容\n[TTS\\_LANG:zh-CN]正在流式生成'), '正文内容');
});

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
  assert.match(route, /delete upstreamFields\.webSearch/);
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

test('Companion preserves structured AI responses instead of Markdown-escaping them', () => {
  const json = '{"summary":"ok","issues":[]}';
  const escapedMarkdown = '\\{"summary":"ok","issues":\\[\\]\\}';
  assert.equal(expectsStructuredAiResponse('Return only valid JSON.\n\n[RESPONSE FORMAT]\nPreserve JSON or NDJSON exactly when requested.'), true);
  assert.equal(expectsStructuredAiResponse('Explain why JSON parsing can fail.\n\n[RESPONSE FORMAT]\nPreserve JSON or NDJSON exactly when requested.'), false);
  assert.equal(selectAiResponseText({ rawText: json, text: escapedMarkdown }, true), json);
  assert.equal(selectAiResponseText({ rawText: `Copy code\n${json}`, codeBlocks: [json], text: `Copy code\n${escapedMarkdown}` }, true), json);

  const ndjson = '{"kind":"start"}\n{"kind":"done"}';
  assert.equal(selectAiResponseText({ rawText: ndjson, text: ndjson.replace(/[{}]/g, (character) => `\\${character}`) }, true), ndjson);
  assert.equal(selectAiResponseText({ rawText: json, text: escapedMarkdown }, false), escapedMarkdown);
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

test('aggregator model discovery normalizes OpenRouter metadata and ignores invalid duplicates', () => {
  const models = parseProviderModels({ data: [
    { id: 'openai/gpt-4.1', name: 'GPT-4.1', description: 'General model', context_length: 1048576, pricing: { prompt: '0.000002', completion: '0.000008' }, supported_parameters: ['tools'] },
    { id: 'openai/gpt-4.1', name: 'Duplicate' },
    { id: '', name: 'Invalid' },
  ] });
  assert.equal(models.length, 1);
  assert.deepEqual(models[0], { modelId: 'openai/gpt-4.1', displayName: 'GPT-4.1', description: 'General model', contextWindow: 1048576, inputCostPerMillion: 2, outputCostPerMillion: 8, supportsAgent: true, capabilities: ['agent', 'tools', 'long_context'] });
});

test('provider presets cover aggregators and direct model vendors while remaining editable data', () => {
  assert.ok(AI_PROVIDER_PRESETS.length >= 8);
  assert.equal(AI_PROVIDER_PRESETS.find((item) => item.id === 'openrouter')?.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(AI_PROVIDER_PRESETS.find((item) => item.id === 'deepseek')?.baseUrl, 'https://api.deepseek.com/v1');
  assert.ok(AI_PROVIDER_PRESETS.some((item) => item.kind === '聚合平台'));
  assert.ok(AI_PROVIDER_PRESETS.some((item) => item.kind === '模型厂商'));
  const directModels = parseProviderModels({ data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash-vision-exp' }] });
  assert.equal(directModels.length, 3);
  assert.equal(directModels[0].inputCostPerMillion, 0);
});

test('Admin supports aggregator discovery plus global and per-plan multi-selection', () => {
  const actions = readFileSync(new URL('../src/actions/ai-admin.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/admin/ai-platform-panel.tsx', import.meta.url), 'utf8');
  const endpoints = readFileSync(new URL('../src/lib/llm-endpoint.ts', import.meta.url), 'utf8');
  assert.match(actions, /discoverAiProviderModels/);
  assert.match(actions, /fetch\(`\$\{baseUrl\}\/models`/);
  assert.match(actions, /importAiProviderModels/);
  assert.match(actions, /saveEnabledAiModels/);
  assert.match(actions, /savePlanAiModelAccess/);
  assert.match(panel, /读取聚合平台全部模型/);
  assert.match(panel, /全选全部模型/);
  assert.match(panel, /套餐可用模型/);
  assert.match(panel, /常用 API 预设/);
  assert.match(panel, /未知 API/);
  assert.match(endpoints, /'openrouter\.ai'/);
});

test('smart selection accepts only server-approved catalog IDs', () => {
  assert.equal(parseSmartSelection('{"modelId":42}', [41, 42]), 42);
  assert.equal(parseSmartSelection('```json\n{"model_id":41}\n```', [41, 42]), 41);
  assert.equal(parseSmartSelection('{"modelId":999}', [41, 42]), null);
  assert.equal(parseSmartSelection('Use model 42 because it is stronger', [41, 42]), null);
  const messages = buildSmartSelectionMessages([{ role: 'user', content: '分析这段复杂代码' }], [{ id: 42, displayName: 'Strong', modelId: 'strong', description: 'coding', routingDescription: 'best for code review', capabilities: ['code', 'reasoning'], supportsAgent: true, inputCostPerMillion: 1, outputCostPerMillion: 2, contextWindow: 128000, health: { totalErrors: 2, testRuns: 8, testAttempts: 10, lastErrorAt: null, lastTestAt: '2026-09-14T12:00:00Z', lastTestAvailable: true, attemptsToConnect: 2, connectionMs: 320, firstTokenMs: 810, totalMs: 1700, tokensPerSecond: 24, recentAttempts: [{ attempt: 1, available: false, httpStatus: 503, connectionMs: 200, firstTokenMs: null, totalMs: 500, tokensPerSecond: null, error: 'temporary failure' }, { attempt: 2, available: true, httpStatus: 200, connectionMs: 320, firstTokenMs: 810, totalMs: 1700, tokensPerSecond: 24, error: null }] } }], 'agent');
  assert.match(messages[0].content, /untrusted data/);
  assert.match(messages[0].content, /high latency/);
  assert.match(messages[1].content, /"id":42/);
  assert.match(messages[1].content, /"attemptsToConnect":2/);
});

test('smart selection is configured server-side and restricted to plan models', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260914120816_ai_smart_model_selection.sql', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../src/lib/ai-model-catalog.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/admin/ai-platform-panel.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../src/components/ai/ai-workspace.tsx', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE public\.ai_platform_settings/);
  assert.match(sql, /smart_router_model_id bigint REFERENCES public\.ai_model_catalog/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_platform_settings FROM PUBLIC, anon, authenticated/);
  assert.match(catalog, /resolveSmartAiRouting/);
  assert.match(catalog, /plan_ai_model_access/);
  assert.match(route, /parseSmartSelection\(completionText, candidates\.map/);
  assert.match(route, /routing\.candidates\.find/);
  assert.match(route, /body\.routingOnly === true/);
  assert.match(route, /modelName: chosen\.model\.display_name/);
  assert.match(route, /p_feature: 'smart_routing'/);
  assert.match(route, /catalog_model_id: Number\(routing\.router\.model\.id\)/);
  assert.match(route, /delete upstreamFields\.smartSelect/);
  assert.match(panel, /智能选择判断模型/);
  assert.match(panel, /saveSmartRouterModel/);
  assert.match(workspace, /displayName: '智能选择'/);
  assert.match(workspace, /smartSelect: model\.isSmartSelection/);
  assert.match(workspace, /Nex AGI:/);
});

test('model operations include rich capabilities, web search, attribution, and safe auto-unlisting', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260914122645_ai_model_operations_and_health.sql', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../src/actions/ai-admin.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/admin/ai-platform-panel.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../src/components/ai/ai-workspace.tsx', import.meta.url), 'utf8');
  assert.match(sql, /model_failure_threshold/);
  assert.match(sql, /record_ai_model_result/);
  assert.match(sql, /billing.*authentication.*permission.*model_unavailable/s);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_ai_model_result[\s\S]*authenticated/);
  assert.match(route, /compound_custom/);
  assert.match(route, /requiredCapabilities/);
  assert.match(route, /X-JackYun-Model/);
  assert.match(route, /recordAiModelResult/);
  assert.match(actions, /setAiModelEnabled/);
  assert.match(actions, /deleteAiModel/);
  assert.match(panel, /给智能选择 AI 的详细说明/);
  assert.match(panel, /永久删除/);
  assert.match(workspace, /message\.routed \? 'Nex AGI: ' : '来自 '/);
  assert.match(workspace, />联网<\/button>/);

  assert.equal(classifyAiModelFailure(402, 'Payment required'), 'billing');
  assert.equal(classifyAiModelFailure(401, 'invalid API key'), 'authentication');
  assert.equal(classifyAiModelFailure(404, 'model not found'), 'model_unavailable');
  assert.equal(classifyAiModelFailure(429, 'rate limit exceeded'), null);
  assert.equal(classifyAiModelFailure(503, 'upstream timeout'), null);
  assert.deepEqual(inferAiModelCapabilities({ modelId: 'groq/compound' }), ['web_search', 'code', 'reasoning', 'tools']);
});

test('admin model testing retries failures, uses two workers, and default routing targets a catalog model', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260914125537_ai_default_model_and_ordering.sql', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../src/actions/ai-admin.ts', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  const adminPanel = readFileSync(new URL('../src/components/admin/ai-platform-panel.tsx', import.meta.url), 'utf8');
  const testPanel = readFileSync(new URL('../src/components/admin/ai-model-test-panel.tsx', import.meta.url), 'utf8');
  const healthSql = readFileSync(new URL('../supabase/migrations/20260914235059_ai_model_test_history_and_routing_health.sql', import.meta.url), 'utf8');
  assert.match(sql, /default_model_id bigint REFERENCES public\.ai_model_catalog\(id\) ON DELETE SET NULL/);
  assert.match(sql, /default_model_id = p_model_id/);
  assert.match(actions, /export async function saveDefaultAiModel/);
  assert.match(actions, /export async function testAiCatalogModel/);
  assert.match(actions, /firstTokenMs/);
  assert.match(actions, /tokensPerSecond/);
  assert.match(proxy, /select\('default_model_id'\)/);
  assert.match(proxy, /defaultModel\?\.model_id/);
  assert.match(adminPanel, /href="\/admin\/ai\/test"/);
  assert.match(adminPanel, /平台默认模型/);
  assert.match(adminPanel, /模型列表顺序/);
  assert.match(adminPanel, /max-h-16 overflow-y-auto/);
  assert.match(actions, /attemptNumber <= 3/);
  assert.match(actions, /record_ai_model_test/);
  assert.match(testPanel, /Promise\.all\(\[worker\(\), worker\(\)\]\)/);
  assert.match(testPanel, /失败自动重试 2 次/);
  assert.match(healthSql, /total_error_count bigint/);
  assert.match(healthSql, /last_test_log jsonb/);
  assert.match(healthSql, /record_ai_model_test/);
  assert.match(healthSql, /REVOKE ALL ON FUNCTION public\.record_ai_model_test[\s\S]*authenticated/);
});

test('managed usage is attributed to the actual API source for cost breakdowns', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260914094935_ai_provider_usage_breakdown.sql', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/admin/ai-platform-panel.tsx', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN provider_id uuid REFERENCES public\.ai_provider_configs/);
  assert.match(sql, /admin_ai_usage_by_provider/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_ai_usage_by_provider/);
  assert.match(proxy, /provider_id: managedProviderId, catalog_model_id: managedCatalogModelId/);
  assert.match(panel, /按 API 来源计费/);
  assert.match(panel, /估算总费用/);
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
  assert.match(extension, /conversationMode === 'jackyun'/);
  assert.match(extension, /browserAiJackYunConversations/);
  assert.match(extension, /首次启动：正在打开 AI 网站/);
  assert.match(content, /message-input-right-button-send/);
  assert.match(content, /JACKYUN_COMPANION_CONVERSATIONS/);
  assert.match(extension, /isConversationUrl/);
  assert.match(extension, /ensureAiPageReady/);
  assert.match(extension, /AI_LIST_MODELS/);
  assert.match(extension, /AI_SELECT_MODEL/);
  assert.match(extension, /页面可见.*条回复/);
  assert.match(content, /bard-mode-menu-button/);
  assert.match(content, /menuitemradio/);
  assert.match(content, /AI_SELECT_MODEL/);
  assert.match(content, /jackyunAiBaseline/);
  assert.match(extension, /response\.baselineText/);
  assert.match(extension, /hasNewAiResponse/);
  assert.match(extension, /reinjectCompanionBridge/);
  assert.match(extension, /chrome\.scripting\.executeScript/);
  assert.match(content, /__jackyunCompanionContentLoaded/);
  assert.match(content, /data-testid="send-button"/);
  assert.match(content, /composer-submit-button/);
  assert.match(content, /await submitPrompt\(composer\)/);
  assert.match(content, /Date\.now\(\) \+ \(host === 'chatgpt\.com' \? 3000 : 1200\)/);
  assert.match(content, /function responseMarkdown/);
  assert.match(content, /function chatGptModelTrigger/);
  assert.match(content, /Instant\|Auto\|Fast\|Thinking/);
  assert.match(content, /Light\|Standard\|Medium\|Heavy\|Extended/);
  assert.match(content, /switch model\|切换模型/);
  assert.match(content, /data-radix-collection-item/);
  assert.match(content, /AI IN PROGRESS/);
  assert.match(content, /renderAutomationOverlay/);
  assert.match(content, /Keep this tab open/);
  assert.match(content, /prefers-reduced-motion/);
  assert.match(content, /模型菜单已打开，但没有读取到可选模型/);
  assert.match(content, /menuitemradio.*menuitem.*option/);
  const safeguard = readFileSync(new URL('../companion-extension/safeguard.js', import.meta.url), 'utf8');
  assert.match(safeguard, /const aiHosts = new Set/);
  assert.match(safeguard, /hostname\.endsWith\(`\.\$\{host\}`\)/);
  const popup = readFileSync(new URL('../companion-extension/popup.js', import.meta.url), 'utf8');
  assert.match(popup, /currentAiAutomation/);
  assert.match(extension, /currentAiAutomation/);
  assert.match(extension, /payload\.aiTabId = tab\.id/);
  assert.match(extension, /chrome\.tabs\.sendMessage\(aiTabId/);
  assert.match(bridge, /Automation heartbeat timeout/);
  assert.match(bridge, /jackyun-browser-ai-recent-choice/);
  assert.match(bridge, /第一次使用 \{providerName\}/);
  assert.match(bridge, /E-HEARTBEAT/);
  assert.match(bridge, /查看错误详情/);
  assert.doesNotMatch(bridge, /AutomationProgress stage=\{automationStage\} detail=\{notice\} elapsedSeconds=\{elapsedSeconds\} \/>\{notice &&/);
  assert.doesNotMatch(bridge, />progress_activity</);
  const workspace = readFileSync(new URL('../src/components/ai/ai-workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /JACKYUN_COMPANION_LIST_MODELS/);
  assert.match(workspace, /browserModel=\{selectedModel\.id < 0/);
  assert.match(workspace, /modelRefreshKey/);
  assert.match(workspace, /label="Chat"/);
  assert.match(workspace, /label="Work"/);
  const settings = readFileSync(new URL('../src/components/settings/ai-config-panel.tsx', import.meta.url), 'utf8');
  assert.match(settings, /使用 JackYun AI 专属对话/);
  const floatingAi = readFileSync(new URL('../src/components/modules/deferred-ai-chat.tsx', import.meta.url), 'utf8');
  const agent = readFileSync(new URL('../src/components/modules/ai-chat-fab.tsx', import.meta.url), 'utf8');
  assert.match(floatingAi, /<AiChatFab initiallyOpen/);
  assert.doesNotMatch(floatingAi, /pathname === ['"]\/ai['"]/);
  assert.match(floatingAi, /打开聊天 \/ Agent/);
  assert.match(agent, /assistantMode === 'chat'/);
  assert.match(agent, /workspaceMode: assistantMode/);
  assert.match(agent, /!embedded && <div className="grid shrink-0 grid-cols-2/);
  assert.match(agent, /function AgentEmptyState/);
  assert.match(agent, /grid-cols-\[16rem_minmax\(0,1fr\)\]/);
  assert.match(agent, /row-start-1 row-end-5/);
  const adminDebug = readFileSync(new URL('../src/components/admin/admin-debug-console.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(adminDebug, /aria-label="打开管理员调试窗口"/);
  const companionLite = readFileSync(new URL('../public/userscripts/jackyun-portal-companion.user.js', import.meta.url), 'utf8');
  assert.match(companionLite, /root\.hidden = isPortal/);
});

test('browser AI detects replies when a virtualized message list keeps the same node count', () => {
  assert.equal(hasNewAiResponse({ count: 3, newCount: 0, text: '新的回复' }, 3, '旧的回复'), true);
  assert.equal(hasNewAiResponse({ count: 3, newCount: 1, text: '相同回复' }, 3, '相同回复'), true);
  assert.equal(hasNewAiResponse({ count: 3, newCount: 0, text: '相同回复' }, 3, '相同回复'), false);
  assert.equal(hasNewAiResponse({ count: 4, newCount: 0, text: '回复' }, 3, '回复'), true);
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
