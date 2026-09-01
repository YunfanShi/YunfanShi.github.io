(async function () {
  'use strict';
  if (window.top !== window) return;

  const response = await chrome.runtime.sendMessage({ type: 'TOOLS_GET_CONFIG' }).catch(() => null);
  if (!response?.ok) return;
  const config = response.result || {};
  const host = location.hostname.replace(/^www\./, '').toLowerCase();

  function cleanTrackingLinks() {
    if (!config.cleanTrackingLinks || !/^https?:$/.test(location.protocol)) return;
    const url = new URL(location.href);
    const removable = /^(?:utm_[a-z]+|fbclid|gclid|dclid|msclkid|yclid|mc_[ce]id|igshid|si|spm|scm)$/i;
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (removable.test(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) history.replaceState(history.state, '', url);
  }

  function installZNotesHelper() {
    if (!config.znotesQuizHelper || !/(^|\.)znotes\.org$/.test(host)) return;
    const toast = document.createElement('div');
    toast.id = 'jackyun-znotes-toast';
    toast.style.cssText = 'position:fixed;top:24px;left:50%;z-index:2147483645;display:none;transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:#172033;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 10px 30px #0003';
    document.body.appendChild(toast);
    const show = (text) => { toast.textContent = text; toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, 1200); };
    const options = () => {
      const container = document.querySelector('.attempt-quiz,main');
      if (!container) return [];
      for (const selector of ['[class*="option-card"]', '.attempt-quiz-type-card', '[class*="QuizOption"]', 'div[role="button"]', '.zn-button-outlined']) {
        const found = [...container.querySelectorAll(selector)];
        if (found.length >= 2) return found.slice(0, 4);
      }
      return [];
    };
    document.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
      if (/^[1-4]$/.test(event.key)) {
        const option = options()[Number(event.key) - 1];
        if (option) { option.click(); show(`已选择 ${event.key}`); }
      } else if (event.key === 'Enter') {
        const next = document.querySelector('.attempt-quiz-footer button:not([disabled]),button.zn-button-filled:not([disabled]),[class*="NextQuestion"]');
        if (next) { next.click(); show('下一题'); }
      }
    });
  }

  function installBestExamDownloads() {
    if (!config.bestExamDownloads || host !== 'bestexamhelp.com' || !location.pathname.startsWith('/exam/')) return;
    const header = document.querySelector('main h1');
    if (!header || document.querySelector('#jackyun-bestexam-downloads')) return;
    const button = document.createElement('button');
    button.id = 'jackyun-bestexam-downloads';
    button.type = 'button';
    button.textContent = '整理本页 PDF';
    button.style.cssText = 'margin-left:12px;padding:9px 14px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer';
    button.addEventListener('click', () => {
      const links = [...document.querySelectorAll('main ul li a[href]')];
      for (const link of links) {
        const target = new URL(link.href);
        if (target.pathname.endsWith('.php')) target.pathname = target.pathname.replace(/-/g, '_').replace(/\.php$/, '.pdf');
        link.href = target.href;
        link.setAttribute('download', target.pathname.split('/').at(-1) || 'paper.pdf');
      }
      button.textContent = links.length ? `已整理 ${links.length} 个 PDF` : '未找到试卷链接';
    });
    header.appendChild(button);
  }

  function installDiscordImageShield() {
    if (!config.discordImageShield || !/(^|\.)discord\.com$/.test(host)) return;
    const style = document.createElement('style');
    style.textContent = `[data-jy-image-shield]{position:relative!important;display:inline-grid!important;min-width:140px;min-height:82px;place-items:center;border-radius:12px;background:#182033!important;overflow:hidden;cursor:pointer}[data-jy-image-shield] img{filter:blur(24px)!important;opacity:.18!important;pointer-events:none}[data-jy-image-shield]::after{content:'JackYun 已隐藏图片 · 点击查看';position:absolute;inset:auto 10px 10px;color:#dbeafe;font:700 11px Arial,sans-serif;text-align:center}[data-jy-image-shield][data-revealed] img{filter:none!important;opacity:1!important}[data-jy-image-shield][data-revealed]::after{display:none}`;
    document.head.appendChild(style);
    const inspect = (root = document) => {
      for (const image of root.querySelectorAll?.('main img[src]:not([data-jy-seen])') || []) {
        image.dataset.jySeen = '1';
        if (image.width < 80 && image.height < 80) continue;
        const wrapper = image.parentElement;
        if (!wrapper) continue;
        wrapper.dataset.jyImageShield = '1';
        wrapper.addEventListener('click', () => { wrapper.dataset.revealed = '1'; }, { once: true });
      }
    };
    inspect();
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node instanceof Element && inspect(node)))).observe(document.body, { childList: true, subtree: true });
  }

  function installTimezoneBadge() {
    if (!config.timezoneBadges || !['discord.com', 'message.bilibili.com'].includes(host)) return;
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483644;padding:9px 12px;border:1px solid #ffffff24;border-radius:12px;background:#111827e8;color:#e5edff;font:600 11px ui-monospace,monospace;box-shadow:0 10px 30px #0004;backdrop-filter:blur(12px)';
    const render = () => { badge.textContent = `中国 ${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())} · CST(UTC−6) ${new Intl.DateTimeFormat('en-US',{timeZone:'America/Regina',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())}`; };
    render();
    setInterval(render, 1000);
    document.body.appendChild(badge);
  }

  cleanTrackingLinks();
  installZNotesHelper();
  installBestExamDownloads();
  installDiscordImageShield();
  installTimezoneBadge();
})();
