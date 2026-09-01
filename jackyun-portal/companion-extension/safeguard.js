(function () {
  'use strict';
  if (window.top !== window || !globalThis.JackYunSafeGuardRules) return;

  const rules = globalThis.JackYunSafeGuardRules;
  const hostname = rules.normalizeHost(location.hostname);
  let config = rules.normalizeConfig();
  let overlayHost = null;
  let statusHost = null;
  let translateTimer = null;
  let contentObserver = null;
  let eligibilityObserver = null;
  let eligibilityTimer = null;
  let lastReason = '';

  const send = (message) => chrome.runtime.sendMessage(message).then((response) => {
    if (!response?.ok) throw new Error(response?.error || 'SafeGuard operation failed');
    return response.result;
  });

  function pageStats() {
    const text = document.body?.innerText || document.documentElement?.innerText || '';
    return rules.languageStats(text, document.documentElement?.lang || '');
  }

  function visibleSubtitleText() {
    const selectors = [
      '[class*="subtitle" i]', '[class*="caption" i]', '[class*="danmaku" i]',
      '.ytp-caption-segment', '.bpx-player-subtitle-panel-text', '[class*="bilibili-player-video-subtitle"]',
    ];
    return [...document.querySelectorAll(selectors.join(','))]
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
      .map((node) => node.innerText || node.textContent || '').join(' ').slice(0, 20000);
  }

  function presentationAssessment() {
    return rules.presentationAssessment({
      pageText: document.body?.innerText || document.documentElement?.innerText || '',
      pageLang: document.documentElement?.lang || '',
      subtitleText: visibleSubtitleText(),
    });
  }

  function removeOverlay() {
    overlayHost?.remove();
    overlayHost = null;
    eligibilityObserver?.disconnect();
    eligibilityObserver = null;
    clearTimeout(eligibilityTimer);
    document.documentElement.style.removeProperty('overflow');
  }

  function removeStatus() {
    statusHost?.remove();
    statusHost = null;
  }

  function showStatus(message) {
    removeStatus();
    statusHost = document.createElement('div');
    statusHost.id = 'jackyun-safeguard-status';
    const shadow = statusHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>:host{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483646}div{max-width:340px;padding:12px 16px;border-radius:14px;background:#202124;color:#fff;font:500 13px/1.45 Arial,sans-serif;box-shadow:0 4px 18px #0005}</style><div></div>`;
    shadow.querySelector('div').textContent = message;
    (document.documentElement || document).appendChild(statusHost);
  }

  async function beginTranslation(existingSession = null) {
    const expiresAt = existingSession?.mode === 'translate' && existingSession.expiresAt > Date.now()
      ? existingSession.expiresAt
      : Date.now() + config.translationGraceMinutes * 60000;
    if (!existingSession) await send({ type: 'SAFEGUARD_SET_SESSION', payload: { hostname, mode: 'translate', expiresAt } });
    removeOverlay();
    showStatus(`SafeGuard: translate this page to English within ${config.translationGraceMinutes} minute(s). The visible text will be checked automatically.`);
    clearInterval(translateTimer);
    translateTimer = setInterval(async () => {
      const session = await send({ type: 'SAFEGUARD_GET_SESSION', hostname }).catch(() => null);
      if (!session) {
        clearInterval(translateTimer);
        removeStatus();
        return showOverlay('The page is still primarily Chinese after the translation window.', true);
      }
      if (session.mode !== 'translate') return clearInterval(translateTimer);
      const assessment = presentationAssessment();
      if (assessment.accepted) {
        clearInterval(translateTimer);
        const verifiedUntil = Date.now() + config.translatedSessionMinutes * 60000;
        await send({ type: 'SAFEGUARD_SET_SESSION', payload: { hostname, mode: 'translated', expiresAt: verifiedUntil } });
        showStatus(`${assessment.reason} This site is available for ${config.translatedSessionMinutes} minutes.`);
        setTimeout(removeStatus, 6000);
      } else if (Date.now() >= session.expiresAt) {
        clearInterval(translateTimer);
        removeStatus();
        showOverlay('The page is still primarily Chinese after the translation window.', true);
      }
    }, 3000);
  }

  async function beginStudySession(eligibility) {
    if (!eligibility.allowed) return;
    const expiresAt = Date.now() + config.studySessionMinutes * 60000;
    await send({ type: 'SAFEGUARD_SET_SESSION', payload: { hostname, mode: 'study', expiresAt } });
    removeOverlay();
    showStatus(`Study Purpose session active for ${config.studySessionMinutes} minutes. ${eligibility.reason}`);
    setTimeout(removeStatus, 7000);
  }

  function showOverlay(reason, force = false, allowBypass = true) {
    if (overlayHost && !force) return;
    removeOverlay();
    lastReason = reason;
    let eligibility = rules.studyEligibility({ hostname, title: document.title, path: location.pathname, text: document.body?.innerText || '', config });
    overlayHost = document.createElement('div');
    overlayHost.id = 'jackyun-safeguard-overlay';
    const shadow = overlayHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host{all:initial;position:fixed;inset:0;z-index:2147483647;color-scheme:light}
        *{box-sizing:border-box} .screen{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:#f8f9fa;color:#202124;font-family:Arial,"Noto Sans",sans-serif}
        .bar{position:absolute;inset:0 0 auto;height:60px;display:flex;align-items:center;gap:12px;padding:0 24px;background:#fff;border-bottom:1px solid #e0e0e0;color:#5f6368;font-weight:600}
        .logo{display:grid;width:28px;height:28px;place-items:center;border-radius:9px;background:#1a73e8;color:#fff}.card{width:min(560px,94vw);padding:42px;border-radius:28px;background:#fff;box-shadow:0 8px 32px #3c404326;text-align:center}
        .shield{display:grid;width:72px;height:72px;margin:0 auto 22px;place-items:center;border-radius:50%;background:#fce8e6;color:#c5221f;font-size:34px}h1{margin:0 0 14px;font-size:28px}p{margin:0;color:#5f6368;line-height:1.55}.reason{margin:22px 0;padding:11px;border-radius:10px;background:#f1f3f4;font:13px/1.45 ui-monospace,monospace;overflow-wrap:anywhere}
        .actions{display:grid;gap:10px;margin-top:20px}button{min-height:44px;padding:10px 18px;border:1px solid #dadce0;border-radius:22px;background:#fff;color:#1967d2;font-weight:700;cursor:pointer}button.primary{border-color:#0b57d0;background:#0b57d0;color:#fff}button:disabled{cursor:not-allowed;color:#9aa0a6;background:#f1f3f4}.hint{margin-top:14px;font-size:12px;color:#80868b}
      </style>
      <div class="screen"><div class="bar"><span class="logo">JY</span>JackYun Companion · English SafeGuard</div><main class="card"><div class="shield">🛡️</div><h1>先把页面变成英文</h1><p>此页面已暂停。请启动浏览器翻译或沉浸式翻译；Companion 会持续检查正文与字幕，通过后自动放行。</p><div class="reason"></div><div class="actions"><button class="primary" id="translate">开始强制翻译检查</button><button id="study">这是学习页面</button></div><p class="hint" id="study-hint"></p></main></div>`;
    shadow.querySelector('.reason').textContent = `${hostname} · ${reason}`;
    const study = shadow.querySelector('#study');
    shadow.querySelector('#translate').disabled = !allowBypass;
    const refreshStudyEligibility = () => {
      eligibility = rules.studyEligibility({ hostname, title: document.title, path: location.pathname, text: document.body?.innerText || '', config });
      study.disabled = !allowBypass || !eligibility.allowed;
      shadow.querySelector('#study-hint').textContent = allowBypass ? eligibility.reason : 'Category blocks cannot be bypassed with translation or Study Purpose.';
    };
    refreshStudyEligibility();
    if (allowBypass && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshStudyEligibility, { once: true });
    if (allowBypass) {
      setTimeout(refreshStudyEligibility, 2000);
      eligibilityObserver = new MutationObserver(() => {
        clearTimeout(eligibilityTimer);
        eligibilityTimer = setTimeout(refreshStudyEligibility, 500);
      });
      eligibilityObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    shadow.querySelector('#translate').addEventListener('click', () => beginTranslation().catch(() => showOverlay(lastReason, true)));
    study.addEventListener('click', () => beginStudySession(eligibility).catch(() => {}));
    (document.documentElement || document).appendChild(overlayHost);
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
  }

  async function inspect() {
    const [savedConfig, session] = await Promise.all([
      send({ type: 'SAFEGUARD_GET_CONFIG' }),
      send({ type: 'SAFEGUARD_GET_SESSION', hostname }),
    ]);
    config = rules.normalizeConfig(savedConfig);
    if (!config.enabled) return;
    const category = rules.categoryReason(hostname, config);
    if (category) return showOverlay(`Blocked category: ${category}`, false, false);
    if (!config.blockChinese) return;
    const education = rules.studyEligibility({ hostname, title: document.title, path: location.pathname, text: document.body?.innerText || '', config });
    if (config.excludeEducation && education.allowed) return;
    if (session?.expiresAt > Date.now()) {
      if (session.mode === 'translate') beginTranslation(session).catch(() => {});
      return;
    }
    if (rules.isLikelyChineseHost(hostname)) return showOverlay('Chinese website detected');
    const detectContent = () => {
      if (!overlayHost && rules.isChineseContent(pageStats())) {
        contentObserver?.disconnect();
        showOverlay('Chinese page content detected');
      }
    };
    const watchContent = () => {
      detectContent();
      if (overlayHost || contentObserver) return;
      let scanTimer = null;
      contentObserver = new MutationObserver(() => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(detectContent, 500);
      });
      contentObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchContent, { once: true });
    else watchContent();
  }

  inspect().catch(() => {});
})();
