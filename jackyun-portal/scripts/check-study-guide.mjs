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
  '核心概念是什么、为什么成立或有用、在什么条件下使用、实际怎么用',
  '并在后面补上正确说法或正确条件', '听课 / 看教材→理解概念',
  '返回教材 / 老师 / AI→再做→当天或第二天复习',
  '题目信息→中间知识点→结论', '逐步更新成知识地图',
  '这是什么？为什么？什么时候用？', '先做简单题',
  '大题 / Explain 题', '计算前先完整列出已知信息',
  '错题费曼大扫荡', '已经升级到“7天”和“14天”',
  '不看正文段落和推导', '实在太累时可以闭眼默想',
  '这段时间整体效率如何', '能量守恒题', '动量守恒题',
  '用秒表记录实际分钟数', '状态往往是在行动中产生的',
  '图书馆等不同地点', '考试策略负责把能力转换成分数',
  '遇到具体问题后再找对应方法',
  '固定起床时间', 'Body Scan', '午睡尽量不超过30分钟',
  '14d879P1Li640upWdYp6ngxyK_XH00aZge_03Ep4GO4c',
  'BV1tibi6xEN4', 'BV1EhB9BLEHs', 'BV1MCZjB3EzQ',
  'BV1UL9uBrEyk', 'BV155djBVEva', 'BV1SSGn6kEUb',
  'onkeydown="if(event.key===\'Enter\'||event.key===\' \''
];
const missing = required.filter((text) => !html.includes(text));
if (missing.length) throw new Error(`Study Guide checks failed: ${missing.join(', ')}`);
if ((html.match(/data-tab="/g) || []).length !== 5) throw new Error('Study Guide must keep exactly five primary tabs');
if (html.includes('Conclusion')) throw new Error('Study Guide still contains the removed Conclusion format');
if (html.includes('1UwFnXLYsxqOnAzKGhg65JtCJrVH7i9w1GeTrJJ75PCI')) throw new Error('Study Guide still links to the superseded source document');
console.log('Study Guide content and compatibility checks passed.');
