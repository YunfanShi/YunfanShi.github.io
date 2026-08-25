import { readFileSync } from 'node:fs';

const html = readFileSync('public/StudyGuide.html', 'utf8');
const required = [
  '今日', '学习', '习题', '考试', '拖延症应对',
  '内容版本 2026-08-19', 'studyguide_progress',
  '今日闭环', '三步拆解', '逆向刷题', '费曼四层',
  '红绿灯', '1 → 3 → 5 → 7 → 14天', '状态底座',
  '检测优先于输入', '问题导向的完整闭环', '只主攻2–3科',
  '强弱科与背诵分流', '每日双总结', '周复盘与下周主攻',
  '去数字化→符号化→从问题逆向推导中间量',
  '固定起床时间', 'Body Scan', '午睡尽量不超过30分钟',
  '14d879P1Li640upWdYp6ngxyK_XH00aZge_03Ep4GO4c',
  'BV1tibi6xEN4', 'BV1EhB9BLEHs', 'BV1MCZjB3EzQ',
  'BV1UL9uBrEyk', 'BV155djBVEva', 'BV1SSGn6kEUb',
  'onkeydown="if(event.key===\'Enter\'||event.key===\' \''
];
const missing = required.filter((text) => !html.includes(text));
if (missing.length) throw new Error(`Study Guide checks failed: ${missing.join(', ')}`);
if ((html.match(/data-tab="/g) || []).length !== 5) throw new Error('Study Guide must keep exactly five primary tabs');
if (html.includes('1UwFnXLYsxqOnAzKGhg65JtCJrVH7i9w1GeTrJJ75PCI')) throw new Error('Study Guide still links to the superseded source document');
console.log('Study Guide content and compatibility checks passed.');
