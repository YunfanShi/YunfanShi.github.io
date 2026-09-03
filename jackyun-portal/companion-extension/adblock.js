(function () {
  'use strict';

  const CORE_SELECTORS = [
    'ins.adsbygoogle',
    '[id="google_ads_iframe"]',
    '[id^="google_ads_iframe_"]',
    '[id^="div-gpt-ad-"]',
    '[data-ad-slot]',
    '[data-ad-client]',
    '[data-ad-unit]',
    '[aria-label="广告"]',
    '[aria-label="Advertisement"]',
    '[aria-label="Sponsored"]',
    '[class~="advertisement"]',
    '[class~="advertising"]',
    '[class~="sponsored-content"]',
    '[id="ad-container"]',
    '[id="ad-wrapper"]',
    '[class="ad-container"]',
    '[class="ad-wrapper"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="cpro.baidu.com"]',
    'iframe[src*="pos.baidu.com"]'
  ];
  const EXTRA_SELECTORS = [
    '[data-advertisement]',
    '[data-advertiser]',
    '[data-sponsored]',
    '[data-testid="ad"]',
    '[data-testid="placementTracking"]',
    '.ad-banner',
    '.ad-slot',
    '.ad-unit',
    '.ad-placeholder',
    '.advertisement-banner',
    '.sponsor-banner',
    '.sponsored-post',
    '#BAIDU_DUP_wrapper_u',
    '[id^="BAIDU_DUP_wrapper_"]',
    '[class^="ec-ad"]',
    '[class*=" ec-ad"]',
    '.video-ads',
    '.ytp-ad-module',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-ad-slot-renderer'
  ];

  function normalizeHost(value) {
    return String(value || '').toLowerCase().replace(/^www\./, '');
  }

  function matchesAllowedHost(host, allowlist) {
    return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  }

  chrome.storage.local.get(['adblock']).then(({ adblock }) => {
    const config = { enabled: true, cosmetic: true, ...(adblock || {}) };
    const host = normalizeHost(location.hostname);
    const allowlist = Array.isArray(config.siteAllowlist) ? config.siteAllowlist.map(normalizeHost) : [];
    if (!config.enabled || !config.cosmetic || matchesAllowedHost(host, allowlist)) return;

    const style = document.createElement('style');
    style.id = 'jackyun-adblock-cosmetic';
    style.textContent = `${[...CORE_SELECTORS, ...(config.privacy ? EXTRA_SELECTORS : [])].join(',')} { display: none !important; visibility: hidden !important; }`;
    (document.head || document.documentElement).append(style);

    const removeLabelledAds = () => {
      for (const element of document.querySelectorAll('aside, ins, iframe, [role="complementary"]')) {
        const label = (element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().toLowerCase();
        if (['广告', '推广', '赞助', 'advertisement', 'sponsored'].includes(label)) element.remove();
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', removeLabelledAds, { once: true });
    else removeLabelledAds();
  }).catch(() => {});
})();
