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
  if (host === 'jackyun.top' || host === 'jackyun.cn') {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'JACKYUN_COMPANION_AI_PROMPT') return;
      chrome.runtime.sendMessage({ type: 'AI_WEB_PROMPT', payload: {
        requestId: String(event.data.requestId || ''), provider: String(event.data.provider || ''), prompt: String(event.data.prompt || ''),
      } }).catch((error) => console.error('[BETA/BrowserAI] Companion automation failed', error));
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
  }

  function setNativeValue(element, value) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    } else {
      element.focus();
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AI_READ_RESPONSE') {
      const responses = assistantResponses();
      const latest = responses.at(-1);
      sendResponse({ ok: true, count: responses.length, text: latest?.textContent?.trim() || '', busy: generationBusy() });
      return true;
    }
    if (message.type !== 'AI_FILL_PROMPT') return false;
    try {
      const baselineCount = assistantResponses().length;
      const composer = aiComposer();
      if (!composer) throw new Error('找不到 AI 输入框，网页结构可能已更新');
      setNativeValue(composer, String(message.prompt || ''));
      composer.focus();
      if (message.submit) {
        const submit = [...document.querySelectorAll('button')].find((button) => {
          const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-testid') || ''}`.toLowerCase();
          return !button.disabled && button.getClientRects().length && /(send|submit|发送|提交)/.test(label);
        });
        if (submit) submit.click();
        else composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      }
      sendResponse({ ok: true, baselineCount });
    } catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
    return true;
  });
})();
