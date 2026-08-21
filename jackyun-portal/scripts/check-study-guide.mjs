import { readFileSync } from 'node:fs';

const html = readFileSync('public/StudyGuide.html', 'utf8');
const required = [
  '今日', '学习', '习题', '考试', '拖延症应对',
  '内容版本 2026-08-19', 'studyguide_progress',
  '今日闭环', '三步拆解', '逆向刷题', '费曼四层',
  '红绿灯', '1 → 3 → 5 → 7 → 14天', '状态底座',
  'onkeydown="if(event.key===\'Enter\'||event.key===\' \''
];
const missing = required.filter((text) => !html.includes(text));
if (missing.length) throw new Error(`Study Guide checks failed: ${missing.join(', ')}`);
if ((html.match(/data-tab="/g) || []).length !== 5) throw new Error('Study Guide must keep exactly five primary tabs');
console.log('Study Guide content and compatibility checks passed.');
