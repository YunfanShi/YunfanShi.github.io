(function () {
  'use strict';
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const rules = [
    ['AI 助手', ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com', 'chat.qwen.ai', 'perplexity.ai', 'notebooklm.google.com']],
    ['考试资料', ['bestexamhelp.com', 'znotes.org', 'papacambridge.com', 'revisiontown.com', 'savemyexams.com', 'physicsandmathstutor.com', 'cambridgeinternational.org', 'pearson.com', 'ielts.org', 'chinaielts.org']],
    ['编程学习', ['luogu.com.cn', 'w3schools.com', 'freecodecamp.org', 'ocw.mit.edu', 'github.com']],
    ['课程平台', ['khanacademy.org', 'edx.org', 'coursera.org', 'youtube.com']],
    ['语言学习', ['bbc.co.uk', 'dictionary.cambridge.org', 'youglish.com', 'ankiweb.net']],
    ['数理工具', ['wolframalpha.com', 'geogebra.org', 'phet.colorado.edu']],
    ['研究阅读', ['scholar.google.com', 'arxiv.org', 'wikipedia.org', 'archive.org']],
    ['JackYun', ['jackyun.top', 'jackyun.cn']],
  ];
  const category = rules.find(([, hosts]) => hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))?.[0];
  if (!category) return;
  let visitSent = false;
  function active() { return !document.hidden && document.hasFocus(); }
  function send(seconds, visits = 0) {
    chrome.runtime.sendMessage({ type: 'ACTIVITY', payload: { hostname: host, category, seconds, visits } }).catch(() => {});
  }
  window.addEventListener('focus', () => {
    if (!visitSent) { send(0, 1); visitSent = true; }
  });
  if (document.hasFocus()) { send(0, 1); visitSent = true; }
  window.setInterval(() => { if (active()) send(15, 0); }, 15000);

  // Portal → Companion bridge. The background verifies the signed-in account's
  // BETA enrollment before it opens or changes any third-party AI page.
  if (host === 'jackyun.top' || host === 'jackyun.cn' || host === 'yunfanshi.github.io') {
    const portalStatus = (payload) => window.postMessage({
      type: 'JACKYUN_COMPANION_AI_STATUS', ...payload,
    }, location.origin);
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.type === 'JACKYUN_COMPANION_PING') {
        window.postMessage({ type: 'JACKYUN_COMPANION_READY', version: chrome.runtime.getManifest().version }, location.origin);
        return;
      }
      if (event.data?.type === 'JACKYUN_COMPANION_LIST_CONVERSATIONS') {
        const requestId = String(event.data.requestId || '');
        chrome.runtime.sendMessage({ type: 'AI_LIST_CONVERSATIONS', provider: String(event.data.provider || '') }).then((response) => {
          window.postMessage({ type: 'JACKYUN_COMPANION_CONVERSATIONS', requestId, conversations: response?.ok && Array.isArray(response.result) ? response.result : [] }, location.origin);
        }).catch(() => window.postMessage({ type: 'JACKYUN_COMPANION_CONVERSATIONS', requestId, conversations: [] }, location.origin));
        return;
      }
      if (event.data?.type === 'JACKYUN_COMPANION_LIST_MODELS') {
        const requestId = String(event.data.requestId || '');
        chrome.runtime.sendMessage({ type: 'AI_LIST_MODELS', provider: String(event.data.provider || '') }).then((response) => {
          window.postMessage({ type: 'JACKYUN_COMPANION_MODELS', requestId, models: response?.ok && Array.isArray(response.result) ? response.result : [], error: response?.ok ? '' : String(response?.error || '') }, location.origin);
        }).catch((error) => window.postMessage({ type: 'JACKYUN_COMPANION_MODELS', requestId, models: [], error: error?.message || String(error) }, location.origin));
        return;
      }
      if (event.data?.type !== 'JACKYUN_COMPANION_AI_PROMPT') return;
      const requestId = String(event.data.requestId || '');
      portalStatus({ requestId, stage: 'opening', detail: 'Companion 已接收请求，正在验证 BETA 资格…' });
      chrome.runtime.sendMessage({ type: 'AI_WEB_PROMPT', payload: {
        requestId, provider: String(event.data.provider || ''), prompt: String(event.data.prompt || ''),
        conversationMode: String(event.data.conversationMode || 'new'), conversationUrl: String(event.data.conversationUrl || ''), model: String(event.data.model || ''),
      } }).catch((error) => {
        console.error('[BETA/BrowserAI] Companion automation failed', error);
        portalStatus({ requestId, stage: 'error', detail: 'Companion 后台未能处理请求。', error: error?.message || String(error) });
      });
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type !== 'AI_AUTOMATION_STATUS') return false;
      window.postMessage({
        type: 'JACKYUN_COMPANION_AI_STATUS', requestId: String(message.requestId || ''),
        stage: String(message.stage || ''), detail: String(message.detail || ''),
        reply: typeof message.reply === 'string' ? message.reply : undefined,
        error: typeof message.error === 'string' ? message.error : undefined,
      }, location.origin);
      return false;
    });
    window.postMessage({ type: 'JACKYUN_COMPANION_READY', version: chrome.runtime.getManifest().version }, location.origin);
  }

  function setNativeValue(element, value) {
    element.focus();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!document.execCommand('insertText', false, value)) element.textContent = value;
    }
    element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function composerValue(element) {
    return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement ? element.value : element.textContent || '';
  }

  function submitPrompt(composer) {
    const scopedRoot = composer.closest('form') || composer.parentElement?.parentElement || document;
    const controls = [...scopedRoot.querySelectorAll('button, [role="button"]'), ...document.querySelectorAll('button, [role="button"]')];
    const enabled = (control) => control.getAttribute('aria-disabled') !== 'true' && !control.disabled && !control.classList.contains('ds-button--disabled') && control.getClientRects().length;
    if (host === 'chat.deepseek.com') {
      const deepseekSend = controls.filter((control) => enabled(control) && control.matches('.ds-button--primary[role="button"]')).at(-1);
      if (deepseekSend) { deepseekSend.click(); return 'deepseek-button'; }
    }
    if (host === 'chat.qwen.ai') {
      const qwenSend = [...document.querySelectorAll('.message-input-right-button-send')].filter((control) => enabled(control)).at(-1);
      if (qwenSend) { qwenSend.click(); return 'qwen-button'; }
    }
    const submit = controls.find((button) => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-testid') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`.toLowerCase();
      return enabled(button) && (button.type === 'submit' || /(send|submit|发送|提交)/.test(label));
    });
    if (submit) { submit.click(); return 'button'; }
    const form = composer.closest('form');
    if (form && typeof form.requestSubmit === 'function') { form.requestSubmit(); return 'form'; }
    const eventOptions = { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true };
    composer.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    composer.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    composer.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    return 'keyboard';
  }

  function aiComposer() {
    const selectors = [
      '#prompt-textarea', 'textarea[data-testid*="composer"]', 'textarea[placeholder]',
      'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"][data-lexical-editor="true"]',
      'rich-textarea div[contenteditable="true"]', 'textarea', 'div[contenteditable="true"]',
    ];
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find((item) => item.getClientRects().length && !item.closest('[aria-hidden="true"]'));
      if (element) return element;
    }
    return null;
  }

  function assistantResponses() {
    const selectors = {
      'chatgpt.com': '[data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"]',
      'claude.ai': '[data-is-streaming="false"], .font-claude-response',
      'gemini.google.com': 'message-content .markdown, message-content',
      'chat.deepseek.com': '.ds-markdown',
      'chat.qwen.ai': '.qwen-markdown, [class*="response-content"]',
      'perplexity.ai': '[data-testid="answer"] .prose, [data-testid="answer"]',
    };
    const selector = selectors[host] || '[data-message-author-role="assistant"], [data-testid="answer"]';
    return [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length && element.textContent?.trim());
  }

  function generationBusy() {
    return [...document.querySelectorAll('button')].some((button) => {
      if (!button.getClientRects().length) return false;
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-testid') || ''} ${button.textContent || ''}`.toLowerCase();
      return /(stop generating|stop response|停止生成|停止回答|停止响应|cancel generation)/.test(label);
    }) || Boolean(document.querySelector('[data-is-streaming="true"]'));
  }

  function visible(element) {
    return Boolean(element && element.getClientRects().length && element.getAttribute('aria-hidden') !== 'true');
  }

  function modelLabel(element) {
    const lines = String(element?.innerText || element?.textContent || element?.getAttribute('aria-label') || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const useful = lines.find((line) => !/^(selected|new)$/i.test(line)) || '';
    if (host === 'gemini.google.com') return useful.match(/^(?:\d+(?:\.\d+)+\s+(?:Flash-Lite|Flash|Pro)|Extended thinking)/i)?.[0] || useful;
    return useful.replace(/^Selected\s+/i, '').trim();
  }

  async function openModelPicker() {
    let trigger = null;
    if (host === 'chatgpt.com') {
      trigger = [...document.querySelectorAll('button')].find((button) => visible(button) && /^(Instant|Thinking effort|Auto|Fast)$/i.test(button.textContent?.trim() || '')) || null;
    } else if (host === 'gemini.google.com') {
      trigger = document.querySelector('[data-test-id="bard-mode-menu-button"], button[aria-label^="Open mode picker"]');
    }
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    return trigger;
  }

  async function listWebModels(keepOpen = false) {
    const trigger = await openModelPicker();
    let options = [];
    if (host === 'chatgpt.com') options = [...document.querySelectorAll('[role="menuitemradio"]')];
    else if (host === 'gemini.google.com') options = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
    else if (host === 'chat.deepseek.com') options = [...document.querySelectorAll('[role="radio"], input[type="radio"]')];
    else options = [...document.querySelectorAll('[role="menuitemradio"], [role="option"], [role="radio"]')];
    const models = options.filter(visible).map((element) => {
      const label = modelLabel(element);
      const selected = element.getAttribute('aria-checked') === 'true' || element.getAttribute('aria-selected') === 'true' || element.checked === true || Boolean(element.querySelector?.('[aria-label="Selected"], [data-icon="check"]'));
      return { id: label, label, selected };
    }).filter((model) => model.label && model.label.length <= 100);
    if (!keepOpen && trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
    return { models: [...new Map(models.map((model) => [model.id, model])).values()], trigger, options };
  }

  async function selectWebModel(requested) {
    const model = String(requested || '').trim();
    if (!model) return { ok: true, selected: '' };
    const result = await listWebModels(true);
    const option = result.options.find((element) => modelLabel(element) === model);
    if (!option) {
      if (result.trigger?.getAttribute('aria-expanded') === 'true') result.trigger.click();
      throw new Error(`当前账号没有模型“${model}”`);
    }
    if (option.getAttribute('aria-checked') !== 'true' && option.getAttribute('aria-selected') !== 'true' && option.checked !== true) option.click();
    else if (result.trigger?.getAttribute('aria-expanded') === 'true') result.trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 180));
    return { ok: true, selected: model };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AI_PAGE_STATUS') {
      sendResponse({ ok: true, provider: host, url: location.href });
      return true;
    }
    if (message.type === 'AI_LIST_MODELS') {
      listWebModels().then(({ models }) => sendResponse({ ok: true, models })).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    if (message.type === 'AI_SELECT_MODEL') {
      selectWebModel(message.model).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    }
    if (message.type === 'AI_READ_RESPONSE') {
      const responses = assistantResponses();
      const newResponses = responses.filter((element) => element.dataset.jackyunAiBaseline !== 'true');
      const latest = newResponses.at(-1) || responses.at(-1);
      sendResponse({ ok: true, count: responses.length, newCount: newResponses.length, text: latest?.textContent?.trim() || '', busy: generationBusy() });
      return true;
    }
    if (message.type !== 'AI_FILL_PROMPT') return false;
    try {
      const baselineResponses = assistantResponses();
      const baselineCount = baselineResponses.length;
      const baselineText = baselineResponses.at(-1)?.textContent?.trim() || '';
      baselineResponses.forEach((element) => { element.dataset.jackyunAiBaseline = 'true'; });
      const composer = aiComposer();
      if (!composer) throw new Error('找不到 AI 输入框，网页结构可能已更新');
      setNativeValue(composer, String(message.prompt || ''));
      composer.focus();
      if (!composerValue(composer).trim()) throw new Error('已找到输入框，但网页没有接受 Prompt');
      const submittedBy = message.submit ? submitPrompt(composer) : 'none';
      sendResponse({ ok: true, baselineCount, baselineText, submittedBy });
    } catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
    return true;
  });
})();
