'use client';
import { useEffect, useRef, useState } from 'react';
import { studyButtonClass } from './question-bank-manager';
const steps = [
  { title: '先安排本周限时新题', text: '主科各一次 20–30 分钟，Statistics / CS 轮换约 20 分钟。新作业题首次独立计时可抵扣；先做题，再修 Cue/PQ。今日与周视图的限时新题卡片可安排训练并记录首次用时、✓ / △ / ○ 和主要卡点；熟题 A 与整卷 C 单独保留，不计新题正确率。', target: 'today' },
  { title: 'Schedule：先看今天需要做什么', text: '今天和周视图汇总课程、手动任务与到期复习。先配置学习目录，再导入课表；无课表也能直接学习。课程较多时自动减少批次，剩余复习顺延。', target: 'today' },
  { title: '知识 CUE 和题库分别管理', text: '知识 CUE 用于检索核心概念；题库用于日常练习，保存来源、短编号、答案解析和独立历史。它们共用学科和 Unit，题目可以关联 CUE。', target: 'questions' },
  { title: '把笔记交给 AI，再预览导入', text: '在批量导入中点“复制提示词及数据”，附上当前笔记和要求交给 AI。将 JSON 导回并检查；修改使用真实 ID。“导出当前数据”保存当前范围内容，完整历史恢复请使用账户备份。AI 标记缺图后，在题库编辑上传并关联图片。', target: 'questions' },
  { title: '学习、评价和恢复进度', text: '学习页先看各科，再选 Unit 或历史表现；可分别学 CUE、题目或统一学习。作答后用 √ / △ / ○ 评价掌握程度，备注和错因可选。中途退出保存进度；当天完成项不再自动重复安排。AI 辅助难度结合真实记录，计划间隔最长 18 天。', target: 'cue' },
  { title: '看表现图，找到下一步', text: '学习记录默认显示学科表现，可切换 Unit、CUE type、知识能力、题型和错因；登录后可生成有证据的 AI 报告。图片、题库和进度随学习数据同步，需登录并确认同步成功。设置中可随时重新打开本介绍。', target: 'records' },
] as const;
export default function ScheduleGuide({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: 'today' | 'questions' | 'cue' | 'records') => void }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const step = steps[index];
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="schedule-guide-title" className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-[var(--foreground)] shadow-2xl backdrop:bg-black/60"><p className="text-xs text-[var(--muted-foreground)]">Schedule 新手教程与功能介绍 · {index + 1} / {steps.length}</p><h2 id="schedule-guide-title" className="mt-3 text-xl font-semibold">{step.title}</h2><p className="mt-4 text-sm leading-7">{step.text}</p><div className="mt-5 flex flex-wrap gap-2"><button className={studyButtonClass} disabled={index === 0} onClick={() => setIndex(index - 1)}>上一步</button><button className={studyButtonClass} onClick={() => index === steps.length - 1 ? onClose() : setIndex(index + 1)}>{index === steps.length - 1 ? '开始使用' : '下一步'}</button><button className={studyButtonClass} onClick={() => { onNavigate(step.target); onClose(); }}>打开对应功能</button><button className={studyButtonClass} onClick={onClose}>暂时跳过</button></div></dialog>;
}
