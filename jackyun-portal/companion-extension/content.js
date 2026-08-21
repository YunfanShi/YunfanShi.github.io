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
})();
