(function () {
  'use strict';
  if (globalThis.__jackyunCompanionContentLoaded) return;
  globalThis.__jackyunCompanionContentLoaded = true;
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const aiHosts = new Set(['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com', 'chat.qwen.ai', 'perplexity.ai', 'notebooklm.google.com']);
  const isAiPage = [...aiHosts].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
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
    try {
      chrome.runtime.sendMessage({ type: 'ACTIVITY', payload: { hostname: host, category, seconds, visits } })?.catch?.(() => {});
    } catch { /* A bridge update must not fail because activity tracking is temporarily unavailable. */ }
  }
  window.addEventListener('focus', () => {
    if (!visitSent) { send(0, 1); visitSent = true; }
  });
  if (document.hasFocus()) { send(0, 1); visitSent = true; }
  window.setInterval(() => { if (active()) send(15, 0); }, 15000);

  let automationOverlay = null;
  function removeAutomationOverlay() {
    if (!automationOverlay) return;
    clearInterval(automationOverlay.timer);
    clearTimeout(automationOverlay.hideTimer);
    automationOverlay.host.remove();
    automationOverlay = null;
  }

  function ensureAutomationOverlay() {
    if (automationOverlay) return automationOverlay;
    const overlayHost = document.createElement('div');
    overlayHost.id = 'jackyun-ai-automation-overlay';
    overlayHost.setAttribute('aria-live', 'polite');
    const shadow = overlayHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .screen { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; overflow: hidden; color: #f7fbff; background: radial-gradient(circle at 50% 15%, rgba(38, 130, 255, .2), transparent 34%), linear-gradient(145deg, #050a12 0%, #081528 52%, #06101d 100%); font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .screen::before { content: ''; position: absolute; inset: 0; opacity: .18; background-image: linear-gradient(rgba(116, 181, 255, .08) 1px, transparent 1px), linear-gradient(90deg, rgba(116, 181, 255, .08) 1px, transparent 1px); background-size: 52px 52px; mask-image: linear-gradient(to bottom, black, transparent 78%); }
        .glow { position: absolute; width: 34rem; height: 34rem; border-radius: 999px; background: #1976ff; filter: blur(150px); opacity: .12; animation: breathe 4s ease-in-out infinite; }
        .panel { position: relative; width: min(680px, calc(100vw - 48px)); box-sizing: border-box; padding: 38px; border: 1px solid rgba(147, 197, 253, .2); border-radius: 28px; background: rgba(7, 16, 30, .84); box-shadow: 0 30px 100px rgba(0, 0, 0, .48), inset 0 1px rgba(255, 255, 255, .06); backdrop-filter: blur(28px); }
        .brand { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .mark { display: flex; align-items: center; gap: 12px; color: #b9dcff; font-size: 13px; font-weight: 720; letter-spacing: .16em; text-transform: uppercase; }
        .orb { width: 12px; height: 12px; border-radius: 50%; background: #5ab4ff; box-shadow: 0 0 0 7px rgba(90, 180, 255, .1), 0 0 24px #329bff; animation: pulse 1.8s ease-in-out infinite; }
        .elapsed { color: #8fa8c4; font: 650 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; }
        h1 { margin: 42px 0 10px; color: #fff; font-size: clamp(30px, 5vw, 46px); line-height: 1.05; letter-spacing: -.045em; }
        .status { min-height: 25px; margin: 0; color: #9fc5e8; font-size: 16px; line-height: 1.55; }
        .track { position: relative; height: 2px; margin: 36px 0 28px; overflow: hidden; border-radius: 99px; background: rgba(159, 197, 232, .14); }
        .bar { height: 100%; width: var(--progress, 8%); border-radius: inherit; background: linear-gradient(90deg, #2c8cff, #7bc8ff); box-shadow: 0 0 16px #2c8cff; transition: width .45s cubic-bezier(.2,.8,.2,1); }
        .steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .step { display: grid; gap: 9px; color: #52677f; font-size: 11px; font-weight: 680; letter-spacing: .04em; }
        .step i { display: block; width: 7px; height: 7px; border-radius: 50%; background: #26374b; box-shadow: 0 0 0 5px rgba(38,55,75,.18); }
        .step.done, .step.active { color: #bfe1ff; }
        .step.done i, .step.active i { background: #59b5ff; box-shadow: 0 0 0 5px rgba(89,181,255,.1), 0 0 16px rgba(89,181,255,.65); }
        .step.active i { animation: pulse 1.35s ease-in-out infinite; }
        .privacy { margin-top: 34px; color: #5f7894; font-size: 12px; line-height: 1.5; }
        .dismiss { display: none; margin-top: 24px; border: 1px solid rgba(147,197,253,.25); border-radius: 12px; padding: 10px 16px; color: #d9ecff; background: rgba(82,139,197,.12); font: 650 13px/1 inherit; cursor: pointer; }
        .screen.error .orb { background: #ff667a; box-shadow: 0 0 0 7px rgba(255,102,122,.1), 0 0 24px rgba(255,102,122,.7); animation: none; }
        .screen.error .dismiss { display: inline-flex; }
        @keyframes pulse { 50% { opacity: .5; transform: scale(.78); } }
        @keyframes breathe { 50% { opacity: .18; transform: scale(1.08); } }
        @media (max-width: 560px) { .panel { width: calc(100vw - 28px); padding: 28px 22px; border-radius: 22px; } .steps { gap: 4px; } .step { font-size: 9px; } h1 { margin-top: 32px; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
      </style>
      <main class="screen" role="status">
        <div class="glow"></div>
        <section class="panel">
          <div class="brand"><div class="mark"><span class="orb"></span> JackYun Companion</div><div class="elapsed">00:00</div></div>
          <h1>AI IN PROGRESS</h1>
          <p class="status">Connecting to your AI workspace…</p>
          <div class="track"><div class="bar"></div></div>
          <div class="steps">
            <span class="step"><i></i>OPEN</span><span class="step"><i></i>SEND</span><span class="step"><i></i>WAIT</span><span class="step"><i></i>RECEIVE</span><span class="step"><i></i>RETURN</span>
          </div>
          <p class="privacy">Your request is being handled securely. Keep this tab open.</p>
          <button class="dismiss" type="button">Dismiss</button>
        </section>
      </main>`;
    (document.documentElement || document.body).appendChild(overlayHost);
    const startedAt = Date.now();
    const state = { host: overlayHost, shadow, startedAt, timer: 0, hideTimer: 0 };
    const updateElapsed = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
      const elapsed = shadow.querySelector('.elapsed');
      if (elapsed) elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };
    shadow.querySelector('.dismiss')?.addEventListener('click', removeAutomationOverlay);
    updateElapsed();
    state.timer = window.setInterval(updateElapsed, 1000);
    automationOverlay = state;
    return state;
  }

  function renderAutomationOverlay(message) {
    if (!isAiPage) return;
    const stages = ['opening', 'filling', 'waiting', 'receiving', 'complete'];
    const copy = {
      opening: 'Opening and connecting to your AI workspace…',
      filling: 'Preparing and sending your request…',
      waiting: 'Waiting for the model to respond…',
      receiving: 'Receiving and formatting the response…',
      complete: 'Response ready. Returning to JackYun…',
      error: 'Automation needs attention. Return to JackYun for details.',
    };
    const state = ensureAutomationOverlay();
    if (Number(message.startedAt) > 0) state.startedAt = Number(message.startedAt);
    const stage = stages.includes(message.stage) ? message.stage : message.stage === 'error' ? 'error' : 'opening';
    const activeIndex = stage === 'error' ? -1 : stages.indexOf(stage);
    const screen = state.shadow.querySelector('.screen');
    screen?.classList.toggle('error', stage === 'error');
    const title = state.shadow.querySelector('h1');
    if (title) title.textContent = stage === 'complete' ? 'AI COMPLETE' : stage === 'error' ? 'ACTION REQUIRED' : 'AI IN PROGRESS';
    const status = state.shadow.querySelector('.status');
    if (status) status.textContent = copy[stage];
    const bar = state.shadow.querySelector('.bar');
    if (bar) bar.style.setProperty('--progress', `${stage === 'error' ? 100 : [10, 32, 58, 82, 100][activeIndex]}%`);
    [...state.shadow.querySelectorAll('.step')].forEach((step, index) => {
      step.classList.toggle('done', activeIndex > index);
      step.classList.toggle('active', activeIndex === index);
    });
    clearTimeout(state.hideTimer);
    if (stage === 'complete') state.hideTimer = window.setTimeout(removeAutomationOverlay, 1800);
  }

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
          const result = response?.ok && response.result && typeof response.result === 'object' ? response.result : {};
          window.postMessage({ type: 'JACKYUN_COMPANION_CONVERSATIONS', requestId, conversations: Array.isArray(result.conversations) ? result.conversations : [], providerOpen: result.providerOpen === true }, location.origin);
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

  function enabledControl(control) {
    return Boolean(control && control.getAttribute('aria-disabled') !== 'true' && !control.disabled && !control.classList.contains('ds-button--disabled') && control.getClientRects().length);
  }

  function providerSubmitControl(composer) {
    const scopedRoot = composer.closest('form') || composer.parentElement?.parentElement || document;
    const controls = [...scopedRoot.querySelectorAll('button, [role="button"]'), ...document.querySelectorAll('button, [role="button"]')];
    if (host === 'chatgpt.com') {
      return [...document.querySelectorAll('[data-testid="send-button"], [data-testid="composer-submit-button"], button[aria-label*="Send prompt" i]')]
        .filter(enabledControl).at(-1) || null;
    }
    if (host === 'chat.deepseek.com') {
      return controls.filter((control) => enabledControl(control) && control.matches('.ds-button--primary[role="button"]')).at(-1) || null;
    }
    if (host === 'chat.qwen.ai') {
      return [...document.querySelectorAll('.message-input-right-button-send')].filter(enabledControl).at(-1) || null;
    }
    return controls.find((button) => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-testid') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`.toLowerCase();
      return enabledControl(button) && (button.type === 'submit' || /(send|submit|发送|提交)/.test(label));
    }) || null;
  }

  async function submitPrompt(composer) {
    // React-based composers (especially ChatGPT) render/enable their send button
    // after the input event has committed. Poll briefly instead of falling through
    // to requestSubmit while the page still considers the composer empty.
    const deadline = Date.now() + (host === 'chatgpt.com' ? 3000 : 1200);
    do {
      const submit = providerSubmitControl(composer);
      if (submit) {
        submit.click();
        return host === 'chatgpt.com' ? 'chatgpt-button' : 'button';
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);

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

  function responseMarkdown(element) {
    const escapeText = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>])/g, '\\$1');
    const walk = (node, listDepth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue);
      if (!(node instanceof Element)) return '';
      const tag = node.tagName.toLowerCase();
      const children = () => [...node.childNodes].map((child) => walk(child, listDepth)).join('');
      if (tag === 'br') return '\n';
      if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${children().trim()}\n\n`;
      if (tag === 'strong' || tag === 'b') return `**${children()}**`;
      if (tag === 'em' || tag === 'i') return `*${children()}*`;
      if (tag === 'del' || tag === 's') return `~~${children()}~~`;
      if (tag === 'a') return `[${children().trim()}](${node.getAttribute('href') || ''})`;
      if (tag === 'blockquote') return `${children().trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      if (tag === 'pre') {
        const code = node.querySelector('code');
        const language = code?.className.match(/language-([\w-]+)/)?.[1] || '';
        return `\n\`\`\`${language}\n${String(code?.textContent || node.textContent || '').replace(/\n$/, '')}\n\`\`\`\n\n`;
      }
      if (tag === 'code') return `\`${String(node.textContent || '').replace(/`/g, '\\`')}\``;
      if (tag === 'ul' || tag === 'ol') return `${[...node.children].map((child, index) => `${tag === 'ol' ? `${index + 1}.` : '-'} ${walk(child, listDepth + 1).trim()}`).join('\n')}\n\n`;
      if (tag === 'li') return children();
      if (tag === 'table') {
        const rows = [...node.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th,td')].map((cell) => String(cell.textContent || '').trim().replace(/\|/g, '\\|')));
        if (!rows.length) return '';
        const width = Math.max(...rows.map((row) => row.length));
        const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
        return `${normalized.map((row, index) => `${index === 1 ? `| ${Array(width).fill('---').join(' | ')} |\n` : ''}| ${row.join(' | ')} |`).join('\n')}\n\n`;
      }
      const value = children();
      return ['p', 'div', 'section', 'article'].includes(tag) ? `${value.trim()}\n\n` : value;
    };
    return walk(element).replace(/\n{3,}/g, '\n\n').trim() || element.textContent?.trim() || '';
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
      trigger = [...document.querySelectorAll('button[data-testid*="model" i], button[aria-label*="model" i]')].find(visible)
        || [...document.querySelectorAll('button')].find((button) => visible(button) && /^(Instant|Thinking effort|Auto|Fast|ChatGPT|GPT[-\s]?\d|o\d)/i.test(button.textContent?.trim() || '')) || null;
    } else if (host === 'gemini.google.com') {
      trigger = document.querySelector('[data-test-id="bard-mode-menu-button"], button[aria-label^="Open mode picker"]');
    } else {
      trigger = [...document.querySelectorAll('button, [role="button"]')].find((button) => visible(button) && /(model|模型|模式)/i.test(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`)) || null;
    }
    if (!trigger) throw new Error('找不到模型选择按钮；请确认已登录，或让网站使用默认模型');
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
      trigger.click();
    }
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const options = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [role="option"], [role="radio"]');
      if ([...options].some(visible)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return trigger;
  }

  async function listWebModels(keepOpen = false) {
    const trigger = await openModelPicker();
    let options = [];
    if (host === 'chatgpt.com') options = [...document.querySelectorAll('[role="menuitemradio"], [role="menu"] [role="menuitem"], [role="listbox"] [role="option"]')];
    else if (host === 'gemini.google.com') options = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
    else if (host === 'chat.deepseek.com') options = [...document.querySelectorAll('[role="radio"], input[type="radio"]')];
    else options = [...document.querySelectorAll('[role="menuitemradio"], [role="menu"] [role="menuitem"], [role="option"], [role="radio"]')];
    const models = options.filter(visible).map((element) => {
      const label = modelLabel(element);
      const selected = element.getAttribute('aria-checked') === 'true' || element.getAttribute('aria-selected') === 'true' || element.checked === true || Boolean(element.querySelector?.('[aria-label="Selected"], [data-icon="check"]'));
      return { id: label, label, selected };
    }).filter((model) => model.label && model.label.length <= 100);
    const uniqueModels = [...new Map(models.map((model) => [model.id, model])).values()];
    if (!keepOpen && trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
    if (!uniqueModels.length) throw new Error('模型菜单已打开，但没有读取到可选模型；请确认账号已登录');
    return { models: uniqueModels, trigger, options };
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
    if (message.type === 'AI_AUTOMATION_STATUS' && isAiPage) {
      renderAutomationOverlay(message);
      sendResponse({ ok: true });
      return false;
    }
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
      const codeBlocks = latest ? [...latest.querySelectorAll('pre')].map((element) => String(element.querySelector('code')?.textContent || element.textContent || '').trim()).filter(Boolean) : [];
      const rawText = latest ? String(latest.innerText || latest.textContent || '').trim() : '';
      sendResponse({ ok: true, count: responses.length, newCount: newResponses.length, text: latest ? responseMarkdown(latest) : '', rawText, codeBlocks, busy: generationBusy() });
      return true;
    }
    if (message.type !== 'AI_FILL_PROMPT') return false;
    (async () => {
      const baselineResponses = assistantResponses();
      const baselineCount = baselineResponses.length;
      const baselineText = baselineResponses.at(-1) ? responseMarkdown(baselineResponses.at(-1)) : '';
      baselineResponses.forEach((element) => { element.dataset.jackyunAiBaseline = 'true'; });
      const composer = aiComposer();
      if (!composer) throw new Error('找不到 AI 输入框，网页结构可能已更新');
      setNativeValue(composer, String(message.prompt || ''));
      composer.focus();
      if (!composerValue(composer).trim()) throw new Error('已找到输入框，但网页没有接受 Prompt');
      const submittedBy = message.submit ? await submitPrompt(composer) : 'none';
      sendResponse({ ok: true, baselineCount, baselineText, submittedBy });
    })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
