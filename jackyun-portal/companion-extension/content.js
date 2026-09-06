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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'AI_FILL_PROMPT') return false;
    try {
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
      sendResponse({ ok: true });
    } catch (error) { sendResponse({ ok: false, error: error.message || String(error) }); }
    return true;
  });
})();
