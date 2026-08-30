(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JackYunSafeGuardRules = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const CHINESE_HOSTS = [
    'baidu.com', 'bilibili.com', 'zhihu.com', 'weibo.com', 'qq.com', 'douban.com',
    'xiaohongshu.com', 'douyin.com', 'toutiao.com', '163.com', 'sohu.com', 'sina.com.cn',
    'csdn.net', 'juejin.cn', 'cnblogs.com', 'segmentfault.com', 'gitee.com', 'aliyun.com',
    'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'meituan.com', 'ctrip.com',
  ];

  const ENTERTAINMENT_HOSTS = [
    'bilibili.com', 'douyin.com', 'ixigua.com', 'youku.com', 'iqiyi.com', 'v.qq.com',
    'mgtv.com', 'acfun.cn', 'kuaishou.com', 'huya.com', 'douyu.com', 'yy.com',
    '4399.com', '7k7k.com', '17173.com', '3dmgame.com', 'ali213.net', 'gamersky.com',
    'nga.cn', 'taptap.cn', 'taptap.com', '4399.cn', '9game.cn', '3839.com',
  ];

  const EDUCATION_HOSTS = [
    'icourse163.org', 'xuetangx.com', 'zhihuishu.com', 'xuexi.cn', 'chaoxing.com',
    'mooc1.chaoxing.com', 'leetcode.cn', 'luogu.com.cn', 'nowcoder.com', 'openjudge.cn',
    'csdn.net', 'juejin.cn', 'cnblogs.com', 'segmentfault.com', 'baike.baidu.com',
    'wenku.baidu.com', 'scholar.google.com', 'wikipedia.org', 'coursera.org', 'edx.org',
    'khanacademy.org', 'cambridgeinternational.org', 'savemyexams.com', 'znotes.org',
  ];

  const CATEGORY_SITES = [
    ['pornhub.com', 'Pornography'], ['xvideos.com', 'Pornography'], ['xnxx.com', 'Pornography'],
    ['xhamster.com', 'Pornography'], ['onlyfans.com', 'Pornography'], ['chaturbate.com', 'Pornography'],
    ['youtube.com', 'Videos'], ['netflix.com', 'Videos'], ['wattpad.com', 'Novels'],
    ['roblox.com', 'Gaming'],
  ];

  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    blockChinese: true,
    translationGraceMinutes: 2,
    translatedSessionMinutes: 60,
    studySessionMinutes: 30,
    activeCategories: Object.freeze({ Pornography: true, Videos: false, Novels: false, Gaming: false, Social: false }),
    customSites: Object.freeze([]),
    customEducationHosts: Object.freeze([]),
    customEntertainmentHosts: Object.freeze([]),
  });

  function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0];
  }

  function matchesHost(hostname, candidate) {
    const host = normalizeHost(hostname);
    const rule = normalizeHost(candidate);
    return Boolean(rule && (host === rule || host.endsWith(`.${rule}`)));
  }

  function matchesAny(hostname, hosts) {
    return hosts.some((candidate) => matchesHost(hostname, candidate));
  }

  function normalizeConfig(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const active = raw.activeCategories && typeof raw.activeCategories === 'object' ? raw.activeCategories : {};
    const list = (key) => Array.isArray(raw[key]) ? raw[key].map(normalizeHost).filter(Boolean).slice(0, 500) : [];
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      enabled: raw.enabled !== false,
      blockChinese: raw.blockChinese !== false,
      translationGraceMinutes: Math.min(10, Math.max(1, Number(raw.translationGraceMinutes) || 2)),
      translatedSessionMinutes: Math.min(240, Math.max(5, Number(raw.translatedSessionMinutes) || 60)),
      studySessionMinutes: Math.min(120, Math.max(5, Number(raw.studySessionMinutes) || 30)),
      activeCategories: { ...DEFAULT_CONFIG.activeCategories, ...active },
      customSites: Array.isArray(raw.customSites) ? raw.customSites.slice(0, 1000).map((site) => ({ d: normalizeHost(site?.d), c: String(site?.c || '') })).filter((site) => site.d && site.c) : [],
      customEducationHosts: list('customEducationHosts'),
      customEntertainmentHosts: list('customEntertainmentHosts'),
    };
  }

  function isLikelyChineseHost(hostname) {
    const host = normalizeHost(hostname);
    return host.endsWith('.cn') || host.endsWith('.中国') || matchesAny(host, CHINESE_HOSTS);
  }

  function languageStats(text, lang = '') {
    const sample = String(text || '').replace(/\s+/g, ' ').slice(0, 120000);
    const han = (sample.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const latin = (sample.match(/[a-z]/gi) || []).length;
    const kana = (sample.match(/[\u3040-\u30ff]/g) || []).length;
    const letters = han + latin + kana;
    const normalizedLang = String(lang || '').trim().toLowerCase();
    const chineseShare = letters ? han / letters : 0;
    return { han, latin, kana, letters, chineseShare, lang: normalizedLang };
  }

  function isChineseContent(stats) {
    if (stats.lang === 'zh' || stats.lang.startsWith('zh-')) return true;
    if (stats.kana > Math.max(12, stats.han * 0.25)) return false;
    return stats.han >= 20 && stats.chineseShare >= 0.22;
  }

  function isEnglishPresentation(stats) {
    if ((stats.lang === 'en' || stats.lang.startsWith('en-')) && stats.latin >= 80) return true;
    return stats.latin >= 160 && stats.latin >= Math.max(160, stats.han * 1.4);
  }

  function categoryReason(hostname, configValue) {
    const config = normalizeConfig(configValue);
    const sites = [...CATEGORY_SITES.map(([d, c]) => ({ d, c })), ...config.customSites];
    const matched = sites.find((site) => matchesHost(hostname, site.d) && config.activeCategories[site.c]);
    return matched?.c || null;
  }

  function studyEligibility({ hostname, title = '', path = '', text = '', config: configValue }) {
    const config = normalizeConfig(configValue);
    const host = normalizeHost(hostname);
    const entertainment = [...ENTERTAINMENT_HOSTS, ...config.customEntertainmentHosts];
    if (matchesAny(host, entertainment)) return { allowed: false, reason: 'Chinese video or gaming sites cannot use Study Purpose bypass.' };
    const education = [...EDUCATION_HOSTS, ...config.customEducationHosts];
    if (host.endsWith('.edu.cn') || matchesAny(host, education)) return { allowed: true, reason: 'Recognized educational domain.' };
    const haystack = `${title} ${path} ${String(text).slice(0, 6000)}`.toLowerCase();
    const keywords = ['课程', '学习', '教育', '考试', '题库', '知识', '学术', '大学', '学校', '教材', '论文', '编程', '数学', '英语', 'course', 'learn', 'education', 'exam', 'tutorial', 'documentation'];
    const hits = keywords.filter((keyword) => haystack.includes(keyword));
    return hits.length >= 2
      ? { allowed: true, reason: `Educational page signals: ${hits.slice(0, 3).join(', ')}` }
      : { allowed: false, reason: 'This page is not on the educational list and lacks enough educational signals.' };
  }

  return {
    CATEGORY_SITES,
    DEFAULT_CONFIG,
    normalizeHost,
    normalizeConfig,
    matchesHost,
    isLikelyChineseHost,
    languageStats,
    isChineseContent,
    isEnglishPresentation,
    categoryReason,
    studyEligibility,
  };
});
