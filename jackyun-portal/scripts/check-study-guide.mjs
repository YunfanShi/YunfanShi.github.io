import { readFileSync } from 'node:fs';

const html = readFileSync('public/StudyGuide.html', 'utf8');
const required = [
  '今日', '学习', '习题', '考试', '拖延症应对',
  '内容版本 2026-08-29', 'studyguide_progress',
  '什么时候用', '做到什么算完成', '今日闭环与三句总结',
  '红绿灯', '1 → 3 → 5 → 7 → 14天',
  '检测优先于输入', '一条学习主线', '只主攻2–3科',
  '不知道看哪个板块时', '理解 → 连接 → 间隔复习 → 应用',
  '先闭卷回忆', '再对照纠正', '用题目验证', '安排下次复习',
  '只筛不会的', '画一张知识联系图', '决定下周重点',
  '完全不会', '会公式但不会用', '会基础题但怕陌生题',
  '题目信息 → 调用的知识点 → 为什么调用',
  '核心概念是什么、为什么成立或有用、在什么条件下使用、实际怎么用',
  '并在后面补上正确说法或正确条件',
  '不看正文段落和推导', '错题费曼大扫荡',
  '合书说清核心概念与使用条件', '做1道最基础的题',
  '信息提取错误', '知识调用失败', '执行流程错误',
  '漏条件则保持当前间隔', '连续2次正确应用才归档',
  '非主攻科仍保留', '打造固定启动仪式', '按分值为各题分配时间',
  '旧知识 → 新知识 → 能解决的问题',
  '上午 · 2小时', '下午 · 2小时', '晚上 · 1小时', '4个25+5番茄钟', '2个50+10',
  '计划经常完不成', '只保留一个任务', '休息不刷短视频',
  '14d879P1Li640upWdYp6ngxyK_XH00aZge_03Ep4GO4c',
  'BV1tibi6xEN4', 'BV1EhB9BLEHs', 'BV1MCZjB3EzQ',
  'BV1UL9uBrEyk', 'BV155djBVEva', 'BV1SSGn6kEUb',
  'onkeydown="if(event.key===\'Enter\'||event.key===\' \''
];
const missing = required.filter((text) => !html.includes(text));
if (missing.length) throw new Error(`Study Guide checks failed: ${missing.join(', ')}`);
if ((html.match(/data-tab="/g) || []).length !== 5) throw new Error('Study Guide must keep exactly five primary tabs');
if (html.includes('Conclusion')) throw new Error('Study Guide still contains the removed Conclusion format');
if (html.includes('大声读三遍')) throw new Error('Study Guide still treats repeated reading as the concept mastery check');
if (html.includes('21天条件反射')) throw new Error('Study Guide still promises a fixed 21-day habit rule');
if (html.includes('3分钟熔断机制')) throw new Error('Study Guide still uses the fixed three-minute exam cutoff');
if (html.includes('1UwFnXLYsxqOnAzKGhg65JtCJrVH7i9w1GeTrJJ75PCI')) throw new Error('Study Guide still links to the superseded source document');
console.log('Study Guide content and compatibility checks passed.');
