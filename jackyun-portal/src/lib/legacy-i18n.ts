import type { Language } from '@/lib/i18n';

// Shared UI vocabulary used by every legacy HTML document rendered in LegacyFrame.
// Text is translated at the text-node level so dynamically rendered controls are
// covered too, while user-entered values are never inspected or translated.
const LEGACY_ENGLISH: Record<string, string> = {
  '加载中...': 'Loading...', '保存': 'Save', '保存设置': 'Save settings', '取消': 'Cancel', '确认': 'Confirm', '关闭': 'Close', '删除': 'Delete', '编辑': 'Edit', '添加': 'Add', '新建': 'New', '返回': 'Back', '刷新': 'Refresh', '搜索': 'Search', '清空': 'Clear', '全部': 'All', '开始': 'Start', '暂停': 'Pause', '继续': 'Resume', '停止': 'Stop', '完成': 'Complete', '完成了': 'Completed', '重置': 'Reset', '导入': 'Import', '导出': 'Export', '下载': 'Download', '上传': 'Upload', '复制': 'Copy', '分享': 'Share', '设置': 'Settings', '帮助': 'Help', '关于': 'About', '返回首页': 'Back to home', '提交': 'Submit', '提交反馈': 'Submit feedback', '查看详情': 'View details', '展开': 'Expand', '收起': 'Collapse', '上一页': 'Previous', '下一页': 'Next',
  '学习计划': 'Study Plan', '学习指南': 'Study Guide', '学习进度': 'Learning progress', '今日计划': 'Today’s plan', '任务': 'Tasks', '目标': 'Goals', '日程': 'Schedule', '时间表': 'Timetable', '番茄钟': 'Pomodoro', '倒计时': 'Countdown', '倒计日': 'Countdown', '词汇': 'Vocabulary', '诗词': 'Poetry', '音乐': 'Music', '答题卡': 'Answer Sheet', '题库': 'Question bank', '练习': 'Practice', '测验': 'Quiz', '错题': 'Mistakes', '复习': 'Review', '统计': 'Statistics', '历史记录': 'History', '通知': 'Notifications', '消息': 'Messages', '更新日志': 'Changelog', '数据管理': 'Data management',
  '请输入': 'Please enter', '暂无数据': 'No data yet', '暂无内容': 'No content yet', '操作成功': 'Completed successfully', '操作失败': 'Operation failed', '网络错误': 'Network error', '请稍后重试': 'Please try again later', '确定要删除吗？': 'Are you sure you want to delete this?', '未登录': 'Not signed in', '退出登录': 'Sign out', '登录': 'Sign in', '注册': 'Sign up', '用户名': 'Username', '密码': 'Password', '邮箱': 'Email', '名称': 'Name', '标题': 'Title', '内容': 'Content', '备注': 'Notes', '日期': 'Date', '时间': 'Time', '语言': 'Language',
};

export function legacyLanguageBridge(language: Language): string {
  return `<script id="__jackyun_legacy_i18n">
(function () {
  var dictionary = ${JSON.stringify(LEGACY_ENGLISH)};
  var language = ${JSON.stringify(language)};
  var keys = Object.keys(dictionary).sort(function(a, b) { return b.length - a.length; });
  function translate(value) {
    if (language !== 'en' || !value) return value;
    if (dictionary[value.trim()]) return value.replace(value.trim(), dictionary[value.trim()]);
    var result = value;
    for (var i = 0; i < keys.length; i++) result = result.split(keys[i]).join(dictionary[keys[i]]);
    return result;
  }
  function eligible(node) {
    var parent = node.parentElement;
    return parent && !/^(SCRIPT|STYLE|CODE|PRE|TEXTAREA|OPTION)$/i.test(parent.tagName) && !parent.closest('[data-jy-no-translate]');
  }
  function apply(root) {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (!eligible(node) || !node.nodeValue || !node.nodeValue.trim()) continue;
      if (node.__jyOriginalText === undefined) node.__jyOriginalText = node.nodeValue;
      node.nodeValue = language === 'en' ? translate(node.__jyOriginalText) : node.__jyOriginalText;
    }
    var attrs = document.querySelectorAll('[placeholder],[title],[aria-label]');
    for (var i = 0; i < attrs.length; i++) {
      var el = attrs[i]; ['placeholder', 'title', 'aria-label'].forEach(function(attr) {
        var value = el.getAttribute(attr); if (!value) return;
        // dataset keys cannot contain hyphens ("aria-label" used to throw here
        // and abort translation/initialisation for the whole legacy page).
        var key = '__jyOriginal_' + attr.replace(/-/g, '_');
        if (el[key] === undefined) el[key] = value;
        el.setAttribute(attr, language === 'en' ? translate(el[key]) : el[key]);
      });
    }
  }
  function refresh(nextLanguage) { language = nextLanguage === 'en' ? 'en' : 'zh'; apply(document.body); }
  window.__jackyunLanguage = refresh;
  window.addEventListener('message', function(event) { if (event.data && event.data.type === 'jackyun-language') refresh(event.data.language); });
  window.addEventListener('jackyun-language-change', function(event) { refresh(event.detail && event.detail.language); });
  document.addEventListener('DOMContentLoaded', function() {
    apply(document.body);
    new MutationObserver(function(mutations) { if (language === 'en') mutations.forEach(function(m) { for (var i = 0; i < m.addedNodes.length; i++) if (m.addedNodes[i].nodeType === 1) apply(m.addedNodes[i]); }); }).observe(document.body, { childList: true, subtree: true });
  });
})();
</script>`;
}
