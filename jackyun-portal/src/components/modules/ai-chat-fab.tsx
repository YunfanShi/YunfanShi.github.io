'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { callAiApi, getAiConfig, getProModel, ThinkingLevel, getThinkingLevel, saveThinkingLevel, getThinkingTemperature, SafetyMode, getSafetyMode, saveSafetyMode, getTokenPrice, saveTokenPrice } from '@/lib/ai-config';
import { getToolsDescription, getPlatformOverview, parseToolCall, parseToolCalls, executeToolCall, ToolScope, AI_TOOLS, ConsentInfo, ToolRiskLevel, getPageContext, ConversationSource } from '@/lib/ai-tools';
import logger from '@/lib/logger';
import { speakWithConfig, stopSpeaking, isAutoSpeakAiEnabled, extractTtsText, extractDualLangText, getTtsConfig, isSpeaking } from '@/lib/tts-config';
import { estimateAiCost } from '@/lib/utils';
import MarkdownRenderer from './markdown-renderer';
import 'katex/dist/katex.min.css';

// ── Conversation types ──────────────────────────────────────────────────────
// ConversationSource 类型已从 ai-tools.ts 导入

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  source: ConversationSource;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 重试次数 */
  retryCount?: number;
  /** 是否已折叠显示（工具调用结果等系统消息） */
  collapsed?: boolean;
  /** AI 思考过程（reasoning_content），与最终回复分离存储 */
  reasoningContent?: string;
  /** token 消耗统计（输入+输出） */
  tokenUsage?: { input?: number; output?: number };
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jackyun-ai-conversations';
const ACTIVE_ID_KEY = 'jackyun-ai-active-conversation';
const MAX_CONTEXT_ROUNDS = 30; // 保留最近 30 轮（60 条消息）
const MAX_CONVERSATIONS = 50; // 最多保留 50 个对话
const MAX_AGENT_LOOPS = 8; // Agent 最大推理循环次数（防止死循环）

interface AiChatFabProps {
  scope?: ToolScope;
  systemPromptSuffix?: string;
  embedded?: boolean;
  embeddedTitle?: string;
  /** 当前页面路径（用于 source 标记） */
  currentPath?: string;
}

// ── Consent Dialog 类型 ─────────────────────────────────────────────────────

interface ConsentDialogState {
  tool: string;
  toolName: string;
  consent: ConsentInfo;
  /** 当前弹窗模式：confirm=确认 / ask=疑问对话 / review=独立审查 */
  mode: 'confirm' | 'ask' | 'review';
  /** 疑问对话消息 */
  askMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  askInput: string;
  askLoading: boolean;
  /** 审查结果 */
  reviewResult: string;
  reviewLoading: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSourceFromPath(path: string): ConversationSource {
  if (!path || path === '/' || path === '/dashboard') return 'dashboard';
  const p = path.replace(/^\//, '').split('/')[0];
  const map: Record<string, ConversationSource> = {
    control: 'control',
    'timetable-hub': 'timetable-hub',
    'study-guide': 'study-guide',
    study: 'study',
    quiz: 'quiz',
    vocab: 'vocab',
    music: 'music',
    poem: 'poem',
    settings: 'settings',
    goal: 'goal',
    relax: 'relax',
    countdown: 'countdown',
    tools: 'tools',
    help: 'help',
  };
  return map[p] || 'other';
}

/** iframe 内 Legacy 页面上报的页面标识 → ConversationSource 映射 */
function getSourceFromIframePage(page: string): ConversationSource | null {
  const iframeMap: Record<string, ConversationSource> = {
    goal: 'goal',
    control: 'control',
    timetablehub: 'timetable-hub',
    'study-guide': 'study-guide',
    studyguide: 'study-guide',
    studyplan: 'study',
    study: 'study',
    countdown: 'countdown',
    igcountdown: 'countdown',
    quizwise: 'quiz',
    quiz: 'quiz',
    vocab: 'vocab',
    music: 'music',
    poem: 'poem',
    relax: 'relax',
    mockportal: 'other',
    answersheet: 'other',
    helpcenter: 'help',
  };
  const key = page.toLowerCase();
  return iframeMap[key] || null;
}

function getSourceLabel(source: ConversationSource): string {
  const labels: Record<ConversationSource, string> = {
    dashboard: '🏠 主页',
    control: '📋 日程中心',
    'timetable-hub': '🗓 时间表',
    'study-guide': '📖 学习指导',
    study: '📚 学习计划',
    quiz: '🧠 QuizWise',
    vocab: '📝 词汇',
    music: '🎵 音乐',
    poem: '📜 诗词',
    settings: '⚙️ 设置',
    goal: '🎯 目标',
    relax: '🎮 放松',
    countdown: '⏱ 倒计时',
    tools: '🔧 工具',
    help: '📖 帮助中心',
    other: '💬 通用',
  };
  return labels[source] || '💬 通用';
}

function truncateConversation(conv: Conversation): Conversation {
  const msgs = conv.messages;
  if (msgs.length <= MAX_CONTEXT_ROUNDS * 2) return conv;
  const nonSystem = msgs.filter(m => m.role !== 'system');
  const kept = nonSystem.slice(-MAX_CONTEXT_ROUNDS * 2);
  const systemMsgs = msgs.filter(m => m.role === 'system').slice(-2);
  return { ...conv, messages: [...kept, ...systemMsgs] };
}

// ── Storage ─────────────────────────────────────────────────────────────────

function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch { return []; }
}

function saveConversations(convs: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch { /* localStorage full */ }
}

function loadActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ID_KEY);
}

function saveActiveId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

// ── Page Quick Actions ─────────────────────────────────────────────────────
// 每个页面的快捷操作按钮，显示在 FAB 对话框输入框上方
interface QuickAction {
  label: string;
  prompt: string;
}

  const PAGE_QUICK_ACTIONS: Partial<Record<ConversationSource, QuickAction[]>> = {
    goal: [
      { label: '📊 总体分析', prompt: '请分析我当前所有目标的完成情况和进度，给出整体评估。' },
      { label: '🎯 优先级建议', prompt: '根据目标截止日期和完成度，给我今天应优先做的优先级建议。' },
      { label: '📅 制定今日计划', prompt: '根据我的目标帮我制定今天的学习计划，考虑我的固定时间块，预估每个任务需要多少分钟。' },
      { label: '⚠️ 风险预警', prompt: '检查哪些目标有逾期风险，分析原因并给出补救措施。' },
    ],
    control: [
      { label: '📅 今日排程', prompt: '请查看我今天的日程安排，列出今天的任务时间表。' },
      { label: '🔍 检查冲突', prompt: '请检查我的时间表是否有任务冲突或时间重叠问题。' },
      { label: '📊 时间分析', prompt: '分析我本周的时间分配情况，哪些科目分配时间不足？' },
      { label: '⚡ 快速填充', prompt: '帮我把未安排的任务自动排入合适的空闲时段。' },
    ],
    'timetable-hub': [
      { label: '📋 查看方案', prompt: '请查看我的时间表方案，列出所有任务和排程状态。' },
      { label: '🔍 检查冲突', prompt: '请检查我的时间表是否有任务冲突或时间重叠问题。' },
      { label: '⚡ 智能排程', prompt: '请帮我把未安排的任务自动排入合适的时间段。' },
      { label: '📊 时间分析', prompt: '分析我本周的时间分配情况，哪些科目分配时间不足？' },
    ],
  dashboard: [
    { label: '🔍 全局分析', prompt: '请给我今天的全局概览：目标进度、今日日程、待办事项汇总。' },
    { label: '📊 今日概览', prompt: '总结我今天的关键信息和任务。' },
    { label: '💡 智能建议', prompt: '基于我的数据，给我三条今日提升效率的建议。' },
  ],
  study: [
    { label: '📋 查看计划', prompt: '查看我的学习计划和大纲情况。' },
    { label: '🔄 更新进度', prompt: '帮我更新学习计划的进度和红绿灯状态。' },
    { label: '📊 学习分析', prompt: '分析我的学习情况，哪些科目掌握得好，哪些需要加强？' },
  ],
  quiz: [
    { label: '📝 开始测验', prompt: '帮我从当前知识库生成一份测验。' },
    { label: '📊 成绩分析', prompt: '分析我的测验成绩，找出薄弱点。' },
    { label: '🎯 薄弱点训练', prompt: '根据我的错题记录，为我生成针对薄弱点的练习。' },
  ],
  vocab: [
    { label: '📝 复习单词', prompt: '根据我的记忆曲线，今天应该复习哪些单词？' },
    { label: '📊 词汇统计', prompt: '统计我的词汇学习进度和掌握情况。' },
  ],
  music: [
    { label: '🎵 播放音乐', prompt: '帮我在音乐播放器中播放一首适合学习的歌。' },
    { label: '⏸️ 停止播放', prompt: '停止当前音乐播放。' },
  ],
  relax: [
    { label: '🎮 推荐放松', prompt: '我现在想放松一下，有什么推荐？' },
  ],
  countdown: [
    { label: '⏱ 查看倒计时', prompt: '查看我最近的重要倒计时事件。' },
    { label: '⚠️ 紧急事件', prompt: '哪些倒计时事件即将到期需要我注意？' },
  ],
};

// ── TTS Subtitle Portal Component ──────────────────────────────────────────

function TtsSubtitle({
  text,
  visible,
  onClose,
}: {
  text: string;
  visible: boolean;
  onClose: () => void;
}) {
  if (typeof window === 'undefined') return null;
  if (!visible || !text) return null;

  const ttsConfig = getTtsConfig();
  const lang = ttsConfig.ttsLanguage || 'zh-CN';
  const langLabel = lang === 'en-US' ? 'EN' : '中';

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        bottom: '60px',
        left: '50%',
        translate: '-50% 0',
        zIndex: 9999,
        maxWidth: '90vw',
        width: 'auto',
        padding: '10px 20px',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#fff',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: lang === 'en-US' ? '#1565C0' : '#2E7D32',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {langLabel}
        </span>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 500,
            lineHeight: 1.4,
            letterSpacing: '0.3px',
            textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#FF5252',
            flexShrink: 0,
            marginLeft: '4px',
          }}
        >
          ✕
        </span>
      </div>
    </div>,
    document.body
  );
}

// ── Consent Dialog Component ────────────────────────────────────────────────

function ConsentDialog({
  state,
  onApprove,
  onReject,
  onClose,
  onAskSubmit,
  onReview,
}: {
  state: ConsentDialogState;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  onAskSubmit: (question: string) => Promise<void>;
  onReview: () => Promise<void>;
}) {
  const [askInput, setAskInput] = useState('');
  const [asking, setAsking] = useState(false);
  const askBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    askBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.askMessages, state.askLoading]);

  const handleAskSubmit = async () => {
    const q = askInput.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      await onAskSubmit(q);
      setAskInput('');
    } finally {
      setAsking(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--card)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--card-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>AI 操作确认</span>
            {state.mode === 'review' && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#7B1FA2', color: '#fff' }}>独立审查</span>
            )}
            {state.mode === 'ask' && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#FB8C00', color: '#fff' }}>疑问对话</span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
          {/* 操作信息 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 操作 */}
            <div style={{ background: 'var(--background)', borderRadius: '12px', padding: '12px 16px', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#4285F4', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>🔧</span> 要执行的操作
              </div>
              <div style={{ fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.5 }}>{state.consent.action}</div>
            </div>
            {/* 目的 */}
            <div style={{ background: 'var(--background)', borderRadius: '12px', padding: '12px 16px', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E88E5', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>🎯</span> 操作目的
              </div>
              <div style={{ fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.5 }}>{state.consent.purpose}</div>
            </div>
            {/* 后果 */}
            <div style={{ background: '#FFF8E1', borderRadius: '12px', padding: '12px 16px', border: '1px solid #FFE082' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#F57F17', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⚠️</span> 可能的影响
              </div>
              <div style={{ fontSize: '14px', color: '#795548', lineHeight: 1.5 }}>{state.consent.consequence}</div>
            </div>
          </div>

          {/* 疑问对话模式 */}
          {state.mode === 'ask' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '4px' }}>💬 与 AI 沟通你的疑问</div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px', background: 'var(--background)', borderRadius: '12px', minHeight: '60px' }}>
                {state.askMessages.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'center', padding: '16px 8px' }}>
                    你可以问 AI 为什么要这样做、有什么替代方案，或任何你关心的问题。
                  </div>
                )}
                {state.askMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      background: m.role === 'user' ? '#4285F4' : 'var(--card)',
                      color: m.role === 'user' ? '#fff' : 'var(--foreground)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--card-border)',
                      wordBreak: 'break-word',
                    }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {state.askLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ display: 'inline-flex', gap: '3px', padding: '8px 12px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--card-border)' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ width: 6, height: 6, background: '#4285F4', borderRadius: '50%' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ width: 6, height: 6, background: '#4285F4', borderRadius: '50%', animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ width: 6, height: 6, background: '#4285F4', borderRadius: '50%', animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={askBottomRef} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={askInput}
                  onChange={e => setAskInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAskSubmit(); }}
                  placeholder="输入你的问题..."
                  disabled={asking}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleAskSubmit}
                  disabled={!askInput.trim() || asking}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4285F4',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: asking ? 'not-allowed' : 'pointer',
                    opacity: asking || !askInput.trim() ? 0.6 : 1,
                  }}
                >
                  发送
                </button>
              </div>
            </div>
          )}

          {/* 独立审查模式 */}
          {state.mode === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '4px' }}>🔍 独立 AI 审查结果</div>
              {state.reviewLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--background)', borderRadius: '12px', fontSize: '13px', color: 'var(--muted-foreground)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7B1FA2] animate-bounce" style={{ width: 6, height: 6, background: '#7B1FA2', borderRadius: '50%' }} />
                  独立审查员正在评估该操作的合理性和风险...
                </div>
              ) : (
                <div style={{ padding: '12px 16px', background: '#F3E5F5', borderRadius: '12px', border: '1px solid #CE93D8', fontSize: '13px', lineHeight: 1.6, color: '#4A148C', whiteSpace: 'pre-wrap' }}>
                  {state.reviewResult || '请点击下方按钮发起审查。'}
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={onApprove}
              disabled={state.mode === 'review' && state.reviewLoading}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: '#34A853',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✅ 同意修改
            </button>
            <button
              onClick={() => {
                if (!state.consent) return;
                // 切回疑问模式
                onAskSubmit('这个操作具体是做什么的？请详细解释一下。');
              }}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--card-border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ❓ 有疑问
            </button>
            <button
              onClick={() => onReview()}
              disabled={state.mode === 'review' && state.reviewLoading}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #CE93D8',
                background: '#F3E5F5',
                color: '#7B1FA2',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔍 审查
            </button>
            <button
              onClick={onReject}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: '#EA4335',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🚫 不同意
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AiChatFab({
  scope = 'global',
  systemPromptSuffix = '',
  embedded = false,
  embeddedTitle = 'AI 助手',
  currentPath: propPath,
}: AiChatFabProps) {
  const pathname = usePathname();
  const currentPath = propPath || pathname || '';
  const [open, setOpen] = useState(embedded);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvIdState] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  // TTS subtitle: 使用 extractTtsText 获取实际朗读文本，显示在屏幕中下方
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // 思考深度级别（默认中）
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(() => getThinkingLevel());
  // 操作模式（YOLO / 安全）
  const [safetyMode, setSafetyMode] = useState<SafetyMode>(() => getSafetyMode());
  // token 价格（元/1M）
  const [tokenPrice, setTokenPrice] = useState<number>(() => getTokenPrice());
  // 设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 打断当前流式输出
  const abortControllerRef = useRef<AbortController | null>(null);
  // 消息容器引用（用于判断用户是否在底部）
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  // 确认弹窗
  const [consentDialog, setConsentDialog] = useState<ConsentDialogState | null>(null);
  // 等待用户确认的 resolve 函数
  const consentResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSpeakDoneRef = useRef(false);
  const initializedRef = useRef(false);
  const isBusyRef = useRef(false);
  const requestIdRef = useRef(0);
  const messagesRef = useRef<Message[]>([]);
  // 同步的当前会话 ID ref（避免 state 异步更新导致的首次对话消息丢失问题）
  const activeConvIdRef = useRef<string | null>(null);

  // 同步 ref 和 state 的会话 ID 设置函数
  const setActiveConvId = useCallback((id: string | null) => {
    activeConvIdRef.current = id;
    setActiveConvIdState(id);
  }, []);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const messages = activeConv?.messages ?? [];
  messagesRef.current = messages;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const loaded = loadConversations();
    setConversations(loaded);
    const activeId = loadActiveId();
    if (activeId && loaded.some(c => c.id === activeId)) {
      setActiveConvId(activeId);
    } else if (loaded.length > 0) {
      setActiveConvId(loaded[0].id);
    } else {
      createNewConversation();
    }
  }, []);

  // 智能自动滚动：只在用户已在底部时跟随
  useEffect(() => {
    if (isUserAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // 监听容器滚动，判断用户位置
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (!container) return;
      isUserAtBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [open]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };
  useEffect(() => { autoResize(); }, [input]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  const createNewConversation = useCallback(() => {
    const source = getEffectiveSource();
    const newConv: Conversation = {
      id: generateId(),
      title: '新对话',
      messages: [],
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations(prev => {
      const updated = [newConv, ...prev].slice(0, MAX_CONVERSATIONS);
      saveConversations(updated);
      return updated;
    });
    setActiveConvId(newConv.id);
    setSidebarOpen(false);
    return newConv;
  }, [currentPath, setActiveConvId]);

  const switchConversation = (id: string) => {
    setActiveConvId(id);
    saveActiveId(id);
    setSidebarOpen(false);
    setError(null);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeConvId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id);
        saveActiveId(remaining[0].id);
      } else {
        createNewConversation();
      }
    }
  };

  const updateConversation = useCallback((updater: (prev: Conversation) => Conversation, targetConvId?: string) => {
    const targetId = targetConvId || activeConvIdRef.current || activeConvId;
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== targetId) return c;
        const newConv = updater(c);
        return truncateConversation(newConv);
      });
      saveConversations(updated);
      return updated;
    });
  }, [activeConvId]);

  /** 根据页面 source 自动匹配对应的 ToolScope（当未显式传入 scope 时使用） */
  const getScopeFromSource = useCallback((src: ConversationSource): ToolScope => {
    if (scope !== 'global') return scope; // 已显式指定 scope 的页面不受影响
    const scopeMap: Partial<Record<ConversationSource, ToolScope>> = {
      dashboard: 'dashboard',
      goal: 'goal',
      control: 'control',
      'timetable-hub': 'control',
      study: 'study',
      'study-guide': 'study_guide',
      quiz: 'quiz',
      vocab: 'vocab',
      music: 'music',
      poem: 'poem',
      relax: 'relax',
      countdown: 'countdown',
      settings: 'settings',
      tools: 'tools',
      help: 'global',
      other: 'global',
    };
    return scopeMap[src] || 'global';
  }, [scope]);

  function getSystemMessage(): Message {
    const source = getEffectiveSource();
    const effectiveScope = getScopeFromSource(source);
    const toolsDesc = getToolsDescription(effectiveScope);
    const pageContext = getPageContext(source);

    const scopeName: Record<ToolScope, string> = {
      global: `你是 JackYun Portal 的**全局智能管家**，掌管整个平台的所有功能。`,
      dashboard: `你是 JackYun Portal 的**智能管家**，正在主页仪表盘为用户提供服务。你可以快速查看目标、日程、学习计划等所有数据。`,
      quiz: '你是 QuizWise 题目的智能辅导老师，可以帮助分析题目、批改答案。',
      plan: '你是学习计划助手，可以帮助管理学习进度、安排计划。',
      control: '你是日程中心助手，可以帮助管理时间表、控制计时和音乐。',
      study_guide: '你是 JackYun Portal 的**学习指导导师（StudyGuide）**，专注于帮助用户掌握高效学习方法。',
      goal: '你是目标管理助手，帮助用户创建、修改、跟踪所有学习生活目标。',
      study: '你是学习计划助手，帮助用户管理学习进度、查看学科进度和红绿灯状态。',
      vocab: '你是英语词汇助手，帮助用户复习和管理单词。',
      music: '你是音乐助手，帮助用户播放和搜索音乐。',
      poem: '你是诗词助手，帮助用户学习和背诵经典诗词。',
      relax: '你是放松娱乐助手，帮助用户放松心情、播放音乐。',
      countdown: '你是倒计时助手，帮助用户查看和管理考试倒计时。',
      settings: '你是设置助手，帮助用户配置 AI、TTS 等系统选项。',
      tools: '你是工具助手，帮助用户使用各种实用小工具。',
      help: '你是 JackYun Portal 的帮助中心 AI 客服，熟悉平台所有功能的使用方法，可以指导用户操作任何页面。',
    };

    let content = `${scopeName[effectiveScope] || scopeName.global}\n\n`;
    content += `【当前页面】\n${pageContext}\n\n`;
    content += `${getPlatformOverview()}\n\n`;
    content += `${toolsDesc}\n${systemPromptSuffix}`.trim();
    return { role: 'system', content };
  }

  /**
   * 请求用户确认（替代 window.confirm）
   * 返回 true=同意执行, false=拒绝
   */
  function requestConsent(toolCall: { tool: string; params: Record<string, string> }, toolDef: { name: string; consentInfo?: (params: Record<string, string>) => ConsentInfo; riskLevel?: ToolRiskLevel }): Promise<boolean> {
    // YOLO 模式：全部通过，不弹窗
    if (safetyMode === 'yolo') return Promise.resolve(true);
    // 安全模式：低风险工具自动通过
    if (toolDef.riskLevel === 'low' || !toolDef.riskLevel) return Promise.resolve(true);

    return new Promise(resolve => {
      const consent = toolDef.consentInfo?.(toolCall.params) || {
        action: `执行 ${toolDef.name}`,
        purpose: '',
        consequence: '',
      };
      consentResolverRef.current = (approved: boolean) => {
        consentResolverRef.current = null;
        setConsentDialog(null);
        resolve(approved);
      };
      setConsentDialog({
        tool: toolCall.tool,
        toolName: toolDef.name,
        consent,
        mode: 'confirm',
        askMessages: [],
        askInput: '',
        askLoading: false,
        reviewResult: '',
        reviewLoading: false,
      });
    });
  }

  /** 处理疑问提问：在弹窗内与 AI 对话 */
  const handleAskSubmit = useCallback(async (question: string): Promise<void> => {
    if (!consentDialog) return;
    const userQuestion = question.trim();
    if (!userQuestion) return;

    // 追加用户问题
    const updatedAskMessages = [...consentDialog.askMessages, { role: 'user' as const, content: userQuestion }];
    setConsentDialog(prev => prev ? { ...prev, askMessages: updatedAskMessages, askLoading: true } : prev);

    try {
      const config = getAiConfig();
      if (!config.baseUrl || !config.apiKey) {
        throw new Error('请先在设置页面配置 AI API Key');
      }

      // 构造解释消息：带上操作上下文
      const explainMessages = [
        { role: 'system', content: `你是一个正在向用户解释操作理由的 AI 助手。用户对以下操作有疑问，请用友好、详细的语言解释。\n\n当前操作：${consentDialog.consent.action}\n操作目的：${consentDialog.consent.purpose}\n可能影响：${consentDialog.consent.consequence}\n\n请直接回答用户的问题，给出清晰的解释。` },
        ...updatedAskMessages.slice(-6), // 只保留最近6条对话
      ];

      const res = await callAiApi(explainMessages, { stream: false, temperature: 0.5 });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || '抱歉，我暂时无法回答这个问题。';

      setConsentDialog(prev => prev ? {
        ...prev,
        askMessages: [...prev.askMessages, { role: 'assistant', content: answer }],
        askLoading: false,
        mode: 'ask',
      } : prev);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '获取解释失败';
      setConsentDialog(prev => prev ? {
        ...prev,
        askMessages: [...prev.askMessages, { role: 'assistant', content: `❌ ${errMsg}` }],
        askLoading: false,
        mode: 'ask',
      } : prev);
    }
  }, [consentDialog]);

  /** 发起独立审查 */
  const handleReview = useCallback(async (): Promise<void> => {
    if (!consentDialog) return;
    setConsentDialog(prev => prev ? { ...prev, mode: 'review', reviewLoading: true, reviewResult: '' } : prev);

    try {
      const config = getAiConfig();
      if (!config.baseUrl || !config.apiKey) {
        throw new Error('请先在设置页面配置 AI API Key');
      }

      const reviewPrompt = `你是独立的 AI 审查员。以下是一个 AI 助手即将对用户执行的操作。请从客观、独立的角度评估这个操作是否合理。\n\n请从以下方面分析：\n1. 这个操作是否合理？为什么？\n2. 操作有哪些潜在风险或负面影响？\n3. 有没有更安全或更优的替代方案？\n4. 最终结论：建议执行还是不执行？\n\n待审查的操作信息：\n🔧 操作：${consentDialog.consent.action}\n🎯 目的：${consentDialog.consent.purpose}\n⚠️ 可能影响：${consentDialog.consent.consequence}\n\n请给出简洁但全面的审查意见。`;

      const reviewMessages = [
        { role: 'system', content: '你是独立的 AI 审查员，负责评估其他 AI 的操作是否合理。你的判断完全独立，不受操作执行方的影响。' },
        { role: 'user', content: reviewPrompt },
      ];

      const res = await callAiApi(reviewMessages, { stream: false, temperature: 0.7 });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const reviewResult = data.choices?.[0]?.message?.content || '（审查结果为空）';

      setConsentDialog(prev => prev ? { ...prev, reviewResult, reviewLoading: false, mode: 'review' } : prev);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '审查失败';
      setConsentDialog(prev => prev ? { ...prev, reviewResult: `❌ 审查失败：${errMsg}`, reviewLoading: false, mode: 'review' } : prev);
    }
  }, [consentDialog]);

  /** 从 reasoning content 中提取摘要标题（前 30 字符） */
  function summarizeReasoning(content: string): string {
    const clean = content.replace(/[\n\r]+/g, ' ').trim();
    const truncated = clean.length > 30 ? clean.slice(0, 30) + '...' : clean;
    return truncated || 'AI 处理中...';
  }

  /** 折叠系统消息为一行摘要 */
  function summarizeSystemMessage(content: string): string {
    // 工具执行结果 → 摘要
    if (content.startsWith('🔧 工具执行结果：')) {
      const result = content.replace('🔧 工具执行结果：', '');
      // 取前几个结果
      const lines = result.split('\n').filter(Boolean);
      const firstLine = lines[0] || '';
      const summary = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
      return `🔧 工具执行结果：${summary}${lines.length > 1 ? `（共 ${lines.length} 行）` : ''}`;
    }
    // 用户拒绝
    if (content.startsWith('🚫')) return content.slice(0, 80) + (content.length > 80 ? '...' : '');
    return content.length > 80 ? content.slice(0, 80) + '...' : content;
  }

  /** 折叠的 ToolCall 消息内容（用于渲染详情） */
  function getSystemMessageFull(content: string): string {
    return content;
  }

  /**
   * 流式发送单次 AI 请求，并实时追加/更新 assistant 消息
   * 返回完整 assistantContent（含 tool_call 标签）
   */
  async function streamAiReply(
    apiMessages: Array<{ role: string; content: string }>,
    convId: string,
    replaceIndex?: number,
    options: { model?: string; temperature?: number; maxTokens?: number } = {},
  ): Promise<{ content: string; tokenUsage?: { input?: number; output?: number } }> {
    const config = getAiConfig();
    if (!config.baseUrl || !config.apiKey) {
      throw new Error('请先在设置页面配置 AI API Key');
    }

    // 根据思考深度传入对应的 temperature（真正影响 AI 的推理深度）
    // 创建 AbortController 用于打断
    abortControllerRef.current = new AbortController();

    const res = await callAiApi(apiMessages, {
      stream: true,
      temperature: options.temperature ?? getThinkingTemperature(thinkingLevel),
      model: options.model,
      maxTokens: options.maxTokens,
      // @ts-ignore - signal passes through to fetch
      signal: abortControllerRef.current.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let errMsg: string;
      try {
        const err = JSON.parse(text);
        errMsg = err.error?.message ?? err.message ?? `HTTP ${res.status}`;
      } catch {
        errMsg = text || `HTTP ${res.status}`;
      }
      throw new Error(errMsg);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('无法读取 AI 响应流');

    // 记录 AI 请求日志（全站持久化）
    logger.info('AI', `请求发送: ${apiMessages[apiMessages.length - 1]?.content?.slice(0, 60) || '(空)'}`, {
      model: config.model,
      messages: apiMessages.length,
      ts: new Date().toISOString(),
    });

    const decoder = new TextDecoder();
    let assistantContent = '';       // 最终回复（content，用户可见 + 用于工具解析）
    let reasoningContent = '';       // 思考过程（reasoning_content，折叠显示，不用于 TTS）
    let messageAdded = false;
    let tokenUsage: { input?: number; output?: number } | undefined;

    // 记录请求开始时间用于计算输入 token
    const inputChars = apiMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estimatedInputTokens = Math.ceil(inputChars / 4);

    setStatusText('AI 正在思考...');

    // ═══ P1-4 性能优化：节流 UI 更新 ═══
    // 流式 chunk 可能每秒几十个，逐个更新 React state + 写 localStorage 会造成频繁
    // re-render 和主线程卡顿。这里节流为每 100ms 最多更新一次，大幅降低渲染压力。
    let lastUiUpdate = 0;

    /** 节流方式批量更新对话（首次务必更新，后续 100ms 节流，流结束后强制 flush） */
    const flushToUi = (force = false) => {
      const now = Date.now();
      if (!force && now - lastUiUpdate < 100) return;
      lastUiUpdate = now;
      if (!messageAdded) {
        messageAdded = true;
      }
      updateConversation(conv => {
        const updated = [...conv.messages];
        const newMsg: Message = {
          role: 'assistant',
          content: assistantContent,
          reasoningContent: reasoningContent || undefined,
          tokenUsage: tokenUsage || (assistantContent ? { input: estimatedInputTokens, output: Math.ceil(assistantContent.length / 4) } : undefined),
        };
        if (replaceIndex !== undefined && replaceIndex >= 0 && updated[replaceIndex]?.role === 'assistant') {
          updated[replaceIndex] = newMsg;
        } else {
          updated.push(newMsg);
        }
        return { ...conv, messages: updated, updatedAt: new Date().toISOString() };
      }, convId);
      setStatusText(assistantContent ? 'AI 正在回复...' : 'AI 正在思考...');
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string; reasoning_content?: string } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const deltaContent = parsed.choices?.[0]?.delta?.content ?? '';
            const deltaReasoning = parsed.choices?.[0]?.delta?.reasoning_content ?? '';

            // 解析 token 消耗（SSE 末尾 usage 字段）
            if (parsed.usage?.prompt_tokens || parsed.usage?.completion_tokens) {
              tokenUsage = {
                input: parsed.usage.prompt_tokens,
                output: parsed.usage.completion_tokens,
              };
            }

            if (!deltaContent && !deltaReasoning) continue;

            // 分离存储：reasoning 过程单独收集，不混入最终回复
            if (deltaReasoning) reasoningContent += deltaReasoning;
            if (deltaContent) {
              assistantContent += deltaContent;
            }

            // 节流更新 UI
            flushToUi();
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }

    // 流结束：强制 flush 最终内容（含 token 用量）
    flushToUi(true);

    setStatusText('');
    return { content: assistantContent, tokenUsage };
  }

  /** 追加系统消息 */
  function addSystemMessage(content: string, convId: string) {
    // 失败消息（❌ 开头）默认展开，让用户看到真实错误
    const isError = content.includes('❌');
    updateConversation(conv => ({
      ...conv,
      messages: [...conv.messages, { role: 'system', content, collapsed: !isError }],
      updatedAt: new Date().toISOString(),
    }), convId);
  }

  /**
   * Agent 主循环：读取 → 执行 → 再读取 → 再执行 ...
   */
  async function runAgentLoop(initialApiMessages: Array<{ role: string; content: string }>, convId: string, replaceIndex?: number, continueAfterLimit = false): Promise<void> {
    let apiMessages = [...initialApiMessages];
    let loopCount = 0;
    let currentReplaceIndex = replaceIndex;

    // ── 任务统计 ───────────────────────────────────────────────
    const loopStartTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalToolCalls = 0;
    let completedExplicitly = false;

    // ═══ 智能模型路由（P0-3）：根据任务复杂度选择策略 ═══
    // easy   → Flash 直接回答（最多 2 轮，不调 Pro）
    // medium → Flash 思考+执行（3 轮）
    // hard   → Pro 首轮深度思考 → Flash 后续执行（8 轮）
    const proModel = getProModel();
    const lastUserMsg = initialApiMessages.filter(m => m.role === 'user').pop()?.content || '';
    const trimmed = lastUserMsg.trim();
    const isSimpleChat = /^(你好|hi|hello|hey|谢谢|再见|拜拜|在吗|你是谁|你会什么|能做什么|好的|ok|嗯|感谢|早安|晚安|哈喽|嗨)\b/i.test(trimmed) || trimmed.length <= 12;
    const isComplexTask = trimmed.length > 25 && /(分析|总结|生成|制定|排程|规划|批量|创建|修改|删除|更新|帮我|建议|评估|报告|统计|预测)/.test(trimmed);
    const taskMode: 'easy' | 'medium' | 'hard' = isSimpleChat
      ? 'easy'
      : (isComplexTask && !!proModel)
        ? 'hard'
        : 'medium';

    // 推理轮数上限：easy=2（直接答）/ medium=3 / hard=8（主页上限 6）
    const baseMaxLoops = taskMode === 'easy' ? 2 : taskMode === 'hard' ? 8 : 3;
    const isDashboard = getEffectiveSource() === 'dashboard';
    const effectiveMaxLoops = continueAfterLimit
      ? baseMaxLoops
      : (isDashboard ? Math.max(1, Math.min(baseMaxLoops, 6)) : baseMaxLoops);

    // ⚠️ 智能去重：记录已执行过的只读工具（同一轮内不重复读取相同数据）
    // 写操作（manage_*/toggle_*/skip_*）会清除读取记录，允许重新读取以确认修改结果
    const executedReadTools = new Set<string>();
    let lastWriteTool: string | null = null;

    while (loopCount < effectiveMaxLoops) {
      loopCount++;
      setStatusText(loopCount === 1 ? 'AI 正在思考...' : `Agent 正在推理（第 ${loopCount} 轮）...`);

      // 自动压缩：检查上下文总字符数，超过 8000 字压缩早期消息
      const totalChars = apiMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      if (totalChars > 8000 && apiMessages.length > 20 && !continueAfterLimit) {
        const recent = apiMessages.slice(-20);
        const old = apiMessages.slice(0, -20);
        try {
          setStatusText('正在压缩对话历史...');
          const config = getAiConfig();
          if (config.baseUrl && config.apiKey) {
            const res = await callAiApi([
              { role: 'system', content: '请将以下对话历史压缩为一段简洁摘要（保留关键信息：用户目标、已完成的操作、当前状态）。只输出摘要。' },
              ...old,
            ], { stream: false, temperature: 0.3 });
            if (res.ok) {
              const data = await res.json();
              const summary = data.choices?.[0]?.message?.content || '';
              if (summary) {
                apiMessages = [
                  { role: 'system', content: `[压缩摘要] ${summary.slice(0, 500)}` },
                  ...recent,
                ];
              }
            }
          }
        } catch { /* 压缩失败不影响主流程 */ }
      }

      // 流式调用 AI（直接显示内容）
      // 重试时第一轮替换旧消息，后续轮次正常追加
      // ═══ 智能模型路由 ═══
      // easy/medium → 默认 Flash 全程处理
      // hard → 首轮用 Pro 深度思考（配 8000 token），后续轮用 Flash 快速执行工具
      const useProForThisRound = taskMode === 'hard' && loopCount === 1 && !!proModel;
      const { content: assistantContent, tokenUsage: roundUsage } = await streamAiReply(
        apiMessages,
        convId,
        currentReplaceIndex,
        {
          model: useProForThisRound ? proModel : undefined,
          ...(useProForThisRound ? { maxTokens: 8000, temperature: 0.1 } : {}),
        }
      );
      currentReplaceIndex = undefined;

      // 累计 token 消耗
      if (roundUsage) {
        totalInputTokens += roundUsage.input || 0;
        totalOutputTokens += roundUsage.output || 0;
      }

      // ⚠️ 关键修复：把 AI 自己的回复也加入消息队列！
      // 这样下一轮推理能看到自己说了什么，避免反复读取而不执行修改
      apiMessages.push({ role: 'assistant', content: assistantContent });

      // 检测 [TASK_COMPLETE] 标记 → 任务已完成，停止推理
      if (assistantContent.includes('[TASK_COMPLETE]')) {
        completedExplicitly = true;
        break;
      }

      // 解析工具调用（即使没有可见文本，只要有 tool_call 就继续执行）
      const toolCalls = parseToolCalls(assistantContent);

      if (!assistantContent.trim() && toolCalls.length === 0) {
        // 记录空响应日志（全站持久化）- 便于用户去设置页查看原因
        logger.error('AI', '空响应: AI 流式响应完成但无 content 和 tool_call', {
          model: getAiConfig().model,
          hasReasoning: messages[messages.length - 1]?.reasoningContent ? true : false,
          ts: new Date().toISOString(),
        });
        updateConversation(conv => ({
          ...conv,
          messages: [...conv.messages, { role: 'assistant', content: '（AI 没有返回内容，请点击重试。已记录日志，可到设置页面查看详细原因）' }],
          updatedAt: new Date().toISOString(),
        }), convId);
        break;
      }

      if (toolCalls.length === 0) break; // 没有工具调用，任务完成

      let loopHasToolCall = false;
      for (const tc of toolCalls) {
        const toolDef = AI_TOOLS.find(t => t.id === tc.tool);
        loopHasToolCall = true;

        setStatusText(`正在执行「${toolDef?.name || tc.tool}」...`);

        // ⚠️ 智能去重：只读工具（read_*/get_*）在同一轮循环中只执行一次
        // 如果中间有写操作（manage_*/toggle_*/skip_*），清除记录允许重新读取以确认修改
        const isReadTool = /^(read_|get_)/.test(tc.tool);
        const isWriteTool = /^(manage_|toggle_|skip_|finish_|switch_|create_)/.test(tc.tool);
        if (isReadTool && !isWriteTool) {
          if (executedReadTools.has(tc.tool)) {
            const skipMsg = `⏭️ 已跳过重复读取：${tc.tool}（数据已在本次对话中获取，直接使用已有结果）`;
            addSystemMessage(skipMsg, convId);
            apiMessages.push({ role: 'assistant', content: skipMsg });
            continue;
          }
          executedReadTools.add(tc.tool);
        } else if (isWriteTool) {
          // 写操作会改变数据，清除对应数据源的读取记录
          executedReadTools.clear();
          lastWriteTool = tc.tool;
        }

        // 需要用户确认的写操作 → 弹窗
        if (toolDef?.requiresConsent) {
          const approved = await requestConsent(tc, toolDef);
          if (!approved) {
            const sysMsg = `🚫 用户拒绝了「${toolDef.name}」操作`;
            addSystemMessage(sysMsg, convId);
            apiMessages.push({ role: 'system', content: sysMsg });
            continue;
          }
        }

        // 高风险工具执行前：保存修改前数据快照（数据回退点）
        const highRisk = toolDef?.riskLevel === 'high';
        let snapshotBefore: string | null = null;
        if (highRisk) {
          if (tc.tool === 'manage_goal') {
            snapshotBefore = localStorage.getItem('jackyun_goal_data') || localStorage.getItem('gt_v6');
          } else if (tc.tool === 'manage_countdown') {
            snapshotBefore = localStorage.getItem('jackyun_igcountdown');
          }
        }

        // 执行工具
        const result = await executeToolCall(tc);
        totalToolCalls++;
        const sysMsg = `🔧 工具执行结果：${result}`;
        addSystemMessage(sysMsg, convId);
        apiMessages.push({ role: 'system', content: sysMsg });

        // 高风险工具执行后：保存 before/after 快照到 localStorage
        if (highRisk && snapshotBefore !== null) {
          const snapshotKey = `jackyun-savepoint-${convId}`;
          const existing = JSON.parse(localStorage.getItem(snapshotKey) || '{"records":[]}');
          const after = tc.tool === 'manage_goal'
            ? localStorage.getItem('jackyun_goal_data') || localStorage.getItem('gt_v6')
            : tc.tool === 'manage_countdown'
              ? localStorage.getItem('jackyun_igcountdown')
              : null;
          existing.records = existing.records || [];
          existing.records.push({
            tool: tc.tool,
            description: sysMsg.slice(0, 60),
            before: snapshotBefore,
            after,
            timestamp: new Date().toISOString(),
          });
          // 最多保留最近 20 条快照
          if (existing.records.length > 20) existing.records.splice(0, existing.records.length - 20);
          localStorage.setItem(snapshotKey, JSON.stringify(existing));
        }
      }

      // 如果本回合有工具调用，继续下一轮推理
      if (!loopHasToolCall) break;
    }

    // 到达上限但仍有后续 → 显示"继续执行"按钮
    if (loopCount >= effectiveMaxLoops) {
      localStorage.setItem(`jackyun-continue-${convId}`, JSON.stringify({ apiMessages }));
      addSystemMessage(`⚠️ 已完成 ${effectiveMaxLoops} 轮推理。`, convId);
    }

    // ── 追加任务统计 ──
    if (loopCount > 1 || totalToolCalls > 0) {
      const durationSec = ((Date.now() - loopStartTime) / 1000).toFixed(1);
      const cost = totalInputTokens > 0 || totalOutputTokens > 0
        ? `\n💴 估算费用：≈ ¥${estimateAiCost(totalInputTokens, totalOutputTokens).toFixed(4)}（DeepSeek V4 Flash）`
        : '';
      const endLabel = completedExplicitly ? '✅ 主动完成' : (loopCount >= effectiveMaxLoops ? '⏰ 达到轮数上限' : '');
      const header = endLabel ? `📊 任务统计（${endLabel}）` : '📊 任务统计';
      const statsMsg = [
        header,
        `⏱️ ${durationSec}秒 · 🧠 ${loopCount}轮 · 🔧 ${totalToolCalls}次`,
        `📥 输入 ${totalInputTokens.toLocaleString()} · 📤 输出 ${totalOutputTokens.toLocaleString()} tokens`,
        cost,
      ].filter(Boolean).join('\n');
      addSystemMessage(statsMsg, convId);
    }

    setStatusText('');
  }

  async function handleSend(retryMessage?: string, retryTargetIndex?: number) {
    const text = retryMessage || input.trim();
    if (!text || isBusyRef.current) return;

    // 如果正在输出，先中止当前流式请求
    if (loading) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }

    isBusyRef.current = true;
    const requestId = ++requestIdRef.current;

    let convId = activeConvIdRef.current || activeConvId;
    if (!convId) {
      const newConv = createNewConversation();
      convId = newConv.id;
    }
    activeConvIdRef.current = convId;

    // 立即将用户消息同步到 ref，避免 React state 异步更新导致的时序问题
    const userMsg: Message = { role: 'user', content: text };
    messagesRef.current = [...messagesRef.current.filter(m => m.role !== 'system'), userMsg];

    if (retryMessage) {
      // 重试：替换旧的 assistant 回复
      updateConversation(conv => {
        const updated = [...conv.messages];
        if (retryTargetIndex !== undefined && retryTargetIndex >= 0 && updated[retryTargetIndex]?.role === 'assistant') {
          updated[retryTargetIndex] = { role: 'assistant', content: '（重新生成中...）' };
        }
        return { ...conv, messages: updated, updatedAt: new Date().toISOString() };
      }, convId);
    } else {
      updateConversation(conv => ({
        ...conv,
        messages: [...conv.messages, userMsg],
        updatedAt: new Date().toISOString(),
      }), convId);
    }

    setInput('');
    setLoading(true);
    setError(null);
    setStatusText('AI 正在思考...');
    autoSpeakDoneRef.current = false;

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const latestMsgs = messagesRef.current;

      // 重试时：剔除被替换的 assistant 回复
      let filteredMsgs: Message[];
      if (retryMessage) {
        filteredMsgs = latestMsgs.filter((m, i) => {
          if (m.role === 'assistant' && retryTargetIndex !== undefined && i === retryTargetIndex) return false;
          return true;
        });
      } else {
        // 剔除最后一个 user 消息（因为 runAgentLoop 会重新构造）
        filteredMsgs = latestMsgs.filter(m => m.role !== 'user' || m.content !== text);
        // 加上当前 user 消息
        filteredMsgs = [...filteredMsgs, userMsg];
      }

      const apiMessages = [getSystemMessage(), ...filteredMsgs];

      // Agent 循环（重试时传入 replaceIndex 替换旧回复）
      await runAgentLoop(apiMessages, convId, retryTargetIndex);

      // 检查 TTS 自动朗读
      const latestConv = conversations.find(c => c.id === convId);
      if (latestConv && latestConv.messages.length > 0) {
        const lastMsg = latestConv.messages[latestConv.messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content && isAutoSpeakAiEnabled()) {
          const ttsText = extractTtsText(lastMsg.content);
          if (ttsText) {
            setSpeakingMsgIndex(latestConv.messages.length - 1);
            setSubtitleText(ttsText);
            setSubtitleVisible(true);
            speakWithConfig(ttsText, undefined, () => {
              setSpeakingMsgIndex(null);
              setSubtitleVisible(false);
              setSubtitleText('');
            });
          }
        }
      }

      setStatusText('');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接和 API 配置';
      setError(errMsg);
      setStatusText('');
    } finally {
      setLoading(false);
      if (requestIdRef.current === requestId) {
        isBusyRef.current = false;
      }
    }
  }

  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current === true && !loading && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content && isAutoSpeakAiEnabled() && !autoSpeakDoneRef.current) {
        autoSpeakDoneRef.current = true;
        const ttsText = extractTtsText(lastMsg.content);
        if (ttsText) {
          setSpeakingMsgIndex(messages.length - 1);
          setSubtitleText(ttsText);
          setSubtitleVisible(true);
          speakWithConfig(ttsText, undefined, () => {
            setSpeakingMsgIndex(null);
            setSubtitleVisible(false);
            setSubtitleText('');
          });
        }
      }
    }
    prevStreamingRef.current = loading;
  }, [loading, messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSpeak(content: string, index: number) {
    if (speakingMsgIndex === index) {
      stopSpeaking();
      setSpeakingMsgIndex(null);
      setSubtitleVisible(false);
      setSubtitleText('');
      return;
    }
    stopSpeaking();
    const ttsText = extractTtsText(content);
    if (ttsText) {
      setSpeakingMsgIndex(index);
      setSubtitleText(ttsText);
      setSubtitleVisible(true);
      speakWithConfig(ttsText, undefined, () => {
        setSpeakingMsgIndex(null);
        setSubtitleVisible(false);
        setSubtitleText('');
      });
    }
  }

  function handleSubtitleClick() {
    stopSpeaking();
    setSpeakingMsgIndex(null);
    setSubtitleVisible(false);
    setSubtitleText('');
  }

  async function handleCopy(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  /** 复制完整记录：原始 AI 回复 + reasoning + 关联工具执行结果 */
  async function handleCopyFull(msgIndex: number) {
    const msg = messages[msgIndex];
    if (!msg) return;

    const parts: string[] = [];

    // 查找这条 AI 消息之前的用户消息
    let userMsg = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsg = messages[i].content;
        break;
      }
    }
    if (userMsg) parts.push(`【用户输入】\n${userMsg}`);

    // 原始 AI 回复（含 tool_call）
    if (msg.role === 'assistant' && msg.content) {
      parts.push(`【AI 完整回复】\n${msg.content}`);
    }

    // reasoning 思考过程
    const reasoning = (msg as Message).reasoningContent;
    if (reasoning) {
      parts.push(`【AI 思考过程】\n${reasoning}`);
    }

    // 找到这条 AI 消息之后关联的系统消息（工具执行结果）
    const toolResults: string[] = [];
    for (let i = msgIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        toolResults.push(messages[i].content);
      } else {
        break; // 遇到下一条用户/AI 消息就停止
      }
    }
    if (toolResults.length > 0) {
      parts.push(`【工具执行记录】\n${toolResults.join('\n\n')}`);
    }

    const fullText = parts.join('\n\n────────────────\n\n');
    if (!fullText) return;

    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedIndex(msgIndex);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = fullText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedIndex(msgIndex);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  // 简化重试：直接复用 handleSend
  function handleRetry(targetIndex?: number) {
    if (loading || !activeConv || isBusyRef.current || consentDialog) return;
    // 找到要重试的 AI 消息及其对应的用户消息
    const assistantMsgs = activeConv.messages.filter(m => m.role === 'assistant');
    const targetAssistantIdx = targetIndex !== undefined
      ? activeConv.messages.findIndex((m, i) => i === targetIndex && m.role === 'assistant')
      : activeConv.messages.length - 1;

    const targetMsg = targetAssistantIdx >= 0 ? activeConv.messages[targetAssistantIdx] : null;

    // 检查重试次数限制（max 5）
    const currentRetryCount = targetMsg?.retryCount || 0;
    if (currentRetryCount >= 5) {
      setError('已达到最大重试次数（5 次），请开启新对话');
      return;
    }

    // 找到这条 AI 消息之前的最后一条用户消息
    let userMsgIdx = -1;
    for (let i = (targetAssistantIdx >= 0 ? targetAssistantIdx : activeConv.messages.length) - 1; i >= 0; i--) {
      if (activeConv.messages[i].role === 'user') {
        userMsgIdx = i;
        break;
      }
    }
    if (userMsgIdx < 0) return;
    const userMsg = activeConv.messages[userMsgIdx];

    // 更新重试计数
    updateConversation(conv => {
      const updated = [...conv.messages];
      const target = updated[targetAssistantIdx];
      if (target && target.role === 'assistant') {
        updated[targetAssistantIdx] = { ...target, retryCount: (target.retryCount || 0) + 1 };
      }
      return { ...conv, messages: updated };
    });

    // 调用 handleSend 并传入用户消息文本
    handleSend(userMsg.content, targetAssistantIdx);
  }

  // 过滤 AI 内部标签（tool_call / TTS_LANG / TITLE / TASK_COMPLETE）不显示给用户
  function stripTags(content: string): string {
    return content
      .replace(/```tool_call[\s\S]*?```/g, '')
      .replace(/\[TTS_LANG:[^\]]*\][\s\S]*?\[\/TTS_LANG\]/g, '')
      .replace(/\[TTS\][\s\S]*?\[\/TTS\]/g, '')
      .replace(/\[TITLE\][\s\S]*?\[\/TITLE\]/g, '')
      .replace(/\[TASK_COMPLETE\]/g, '')
      .trim();
  }

  // 从 AI 回复中提取 [TITLE] 标签（用于对话标题）
  function extractTitle(content: string): string | null {
    const match = content.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
    return match ? match[1].trim() : null;
  }

  // 流式响应完成后检查标题提取
  // ⚠️ 修复：Agent 循环结束后会追加「任务统计」系统消息，原逻辑只看 messages 最后一条
  // 导致永远匹配不到 assistant 消息，标题一直是「新对话」。现在改为查找最后一条 assistant 消息。
  // 同时增加 fallback：无 [TITLE] 标签时取第一条用户消息前 20 字作标题。
  useEffect(() => {
    if (loading || !activeConv || activeConv.title !== '新对话') return;
    const userMsgCount = activeConv.messages.filter(m => m.role === 'user').length;
    if (userMsgCount !== 1) return;

    let lastAssistantContent = '';
    for (let i = activeConv.messages.length - 1; i >= 0; i--) {
      if (activeConv.messages[i].role === 'assistant' && activeConv.messages[i].content) {
        lastAssistantContent = activeConv.messages[i].content;
        break;
      }
    }
    if (!lastAssistantContent) return;

    const firstUserMsg = activeConv.messages.find(m => m.role === 'user')?.content || '';
    const title =
      extractTitle(lastAssistantContent) ||
      (firstUserMsg ? firstUserMsg.slice(0, 20) : '') ||
      '新对话';
    if (!title || title === '新对话') return;

    const convId = activeConv.id;
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== convId) return c;
        return { ...c, title: title.slice(0, 30) };
      });
      saveConversations(updated);
      return updated;
    });
  }, [loading, activeConv]);

  const containerClass = embedded
    ? 'w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg flex flex-col overflow-hidden'
    : 'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-2 z-50 w-[calc(100vw-1rem)] sm:right-4 sm:w-[480px] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden';

  // ════════════════════════════════════════════════════════
  // iframe 页面感知 — 监听 Legacy 页面通过 postMessage 上报实际页面
  // 同时作为门户层消息桥：处理 iframe 导航请求 + Goal→TimetableHub 数据推送转发
  // ════════════════════════════════════════════════════════
  const iframePageRef = useRef<string | null>(null);

  useEffect(() => {
    function handleIframeMessage(e: MessageEvent) {
      try {
        const data = e.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'jackyun-page' && typeof data.page === 'string') {
          iframePageRef.current = data.page;
        }
        // 帮助中心「联系 AI 客服」按钮 → 打开全局 AI 对话
        if (data.type === 'jackyun-open-ai') {
          setOpen(true);
          setTimeout(() => textareaRef.current?.focus(), 100);
        }
        // ═══ 门户层路由桥：iframe 内请求跳转到门户页面（修复 Control → TimetableHub 套娃） ═══
        if (data.type === 'jackyun-navigate') {
          const href = typeof data.href === 'string' ? data.href : '/';
          // 顶层跳转（Next.js App Router 页面），避免 iframe 内嵌套加载
          if (window.location.pathname !== href) {
            window.location.href = href;
          }
        }
        // ═══ Goal → TimetableHub 数据推送转发：把 Goal 页面写入的方案数据广播给同域 iframe ═══
        // Goal 页面 pushTodayToTimetable() 后发送 goal-daily-plan-pushed，
        // 门户层收到后，如果 TimetableHub iframe 存在则转发 message 促使其重载，
        // 不存在则无需转发（TimetableHub 打开时会自动从 localStorage 读取最新数据）。
        if (data.type === 'goal-daily-plan-pushed') {
          try {
            const frames = document.querySelectorAll('iframe');
            frames.forEach((f) => {
              try {
                const src = (f.getAttribute('src') || f.title || '').toLowerCase();
                if (src.includes('timetablehub')) {
                  // 若 TimetableHub iframe 已挂载，转发同步消息让其 reload 最新方案
                  f.contentWindow?.postMessage({ type: 'timetablehub-sync', from: 'portal-bridge' }, '*');
                }
              } catch {}
            });
          } catch {}
        }
      } catch {}
    }
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []);

  // 获取实际来源：优先 iframe 上报的页面，其次 URL 路径
  const getEffectiveSource = useCallback((): ConversationSource => {
    const iframePage = iframePageRef.current;
    if (iframePage) {
      const mapped = getSourceFromIframePage(iframePage);
      if (mapped) return mapped;
    }
    return getSourceFromPath(currentPath);
  }, [currentPath]);

  return (
    <>
      {open && (
        <div className={containerClass} style={{ height: embedded ? '100%' : 'min(620px, calc(100dvh - 6rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                title="对话列表"
              >
                <span className="material-icons-round text-base">menu</span>
              </button>
              <span className="material-icons-round text-[#4285F4] text-lg flex-shrink-0">smart_toy</span>
              <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                {activeConv?.title || embeddedTitle}
              </span>
              {activeConv && (
                <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--background)] rounded px-1.5 py-0.5 flex-shrink-0">
                  {getSourceLabel(activeConv.source)}
                </span>
              )}
              {statusText && (
                <span className="text-xs text-[var(--muted-foreground)] animate-pulse truncate">{statusText}</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* 设置按钮 */}
              <button
                onClick={() => setSettingsOpen(true)}
                title="AI 设置"
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">settings</span>
              </button>
              <button
                onClick={createNewConversation}
                title="新建对话"
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">add</span>
              </button>
              {!embedded && (
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Conversation list sidebar */}
          {sidebarOpen && (
            <div className="border-b border-[var(--card-border)] max-h-48 overflow-y-auto bg-[var(--background)]">
              {conversations.length === 0 ? (
                <p className="text-center text-xs text-[var(--muted-foreground)] py-4">暂无对话记录</p>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => switchConversation(conv.id)}
                    className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors ${
                      conv.id === activeConvId
                        ? 'bg-[#4285F4]/10 text-[#4285F4]'
                        : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                    }`}
                  >
                    <span className="material-icons-round text-sm flex-shrink-0">chat</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs">{conv.title}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)]">
                        {getSourceLabel(conv.source)} · {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="p-1 rounded hover:bg-[#EA4335]/10 text-[var(--muted-foreground)] hover:text-[#EA4335] transition-colors flex-shrink-0"
                      title="删除"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-[var(--muted-foreground)] mt-8">
                👋 有什么可以帮助你的？<br />
                <span className="text-xs opacity-70">Enter 发送，Shift+Enter 换行</span>
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                      msg.role === 'user'
                        ? 'bg-[#4285F4] text-white rounded-br-sm'
                        : msg.role === 'system'
                        ? 'bg-[#FFF8E1] text-[#795548] border border-[#FFE082] rounded text-xs w-full'
                        : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <>
                        {/* AI 思考过程 — 折叠显示，不用于 TTS */}
                        {thinkingLevel !== 'low' && (msg as Message).reasoningContent && (
                          <div
                            className="mb-1.5 cursor-pointer select-none rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 py-1"
                            onClick={() => {
                              updateConversation(conv => {
                                const updated = [...conv.messages];
                                updated[i] = { ...updated[i], collapsed: !updated[i].collapsed };
                                return { ...conv, messages: updated };
                              });
                            }}
                          >
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                              <span className="material-icons-round text-xs">psychology_alt</span>
                              <span className="flex-1 truncate">
                                {msg.collapsed === false ? 'AI 思考过程' : summarizeReasoning((msg as Message).reasoningContent || '')}
                              </span>
                              <span>{msg.collapsed === false ? '▲' : '▶'}</span>
                            </div>
                            {msg.collapsed === false && (
                              <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-normal text-[var(--muted-foreground)]">
                                {(msg as Message).reasoningContent}
                              </div>
                            )}
                          </div>
                        )}
                        {msg.content ? (
                          <MarkdownRenderer content={stripTags(msg.content)} />
                        ) : loading && i === messages.length - 1 ? (
                          <span className="flex items-center gap-2">
                            <span className="inline-flex gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </span>
                        ) : null}
                      </>
                    ) : msg.role === 'system' ? (
                      // 系统消息
                      msg.content.startsWith('📊 任务统计') ? (
                        // 任务统计卡片：始终展开，高亮样式
                        <div className="rounded-lg border border-[#34A853]/30 bg-[#E8F5E9]/50 dark:bg-[#1B3A1B]/30 px-3 py-2">
                          <span className="whitespace-pre-wrap text-xs block text-[var(--foreground)]">
                            {msg.content}
                          </span>
                        </div>
                      ) : (
                        // 工具结果 → 折叠显示，点击展开
                        <div
                          className="cursor-pointer select-none"
                          onClick={() => {
                            updateConversation(conv => {
                              const updated = [...conv.messages];
                              updated[i] = { ...updated[i], collapsed: !updated[i].collapsed };
                              return { ...conv, messages: updated };
                            });
                          }}
                        >
                          <span className="whitespace-pre-wrap text-xs block">
                            {msg.collapsed === false ? msg.content : summarizeSystemMessage(msg.content)}
                          </span>
                          <span className="text-[10px] text-[#A1887F] mt-0.5 block">
                            {msg.collapsed === false ? '▲ 点击折叠' : '▼ 点击查看详情'}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>

                {msg.role === 'assistant' && msg.content && !loading && (
                  <div className="flex items-center gap-1 mt-1 ml-1">
                    {(msg as Message).tokenUsage && (
                      <span className="text-[10px] text-[var(--muted-foreground)] mr-1">
                        📊 {((msg as Message).tokenUsage!.input || 0) + ((msg as Message).tokenUsage!.output || 0)} tokens · ≈¥{((((msg as Message).tokenUsage!.input || 0) + ((msg as Message).tokenUsage!.output || 0)) / 1000000 * tokenPrice).toFixed(4)}
                      </span>
                    )}
                    <button
                      onClick={() => handleSpeak(msg.content, i)}
                      title={speakingMsgIndex === i ? '停止朗读' : '朗读'}
                      className={`p-1 rounded-full transition-colors ${
                        speakingMsgIndex === i
                          ? 'text-[#4285F4] bg-[#4285F4]/10 animate-pulse'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">volume_up</span>
                    </button>
                    <button
                      onClick={() => handleCopy(msg.content, i)}
                      title="复制"
                      className={`p-1 rounded-full transition-colors ${
                        copiedIndex === i
                          ? 'text-green-500'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">
                        {copiedIndex === i ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleCopyFull(i)}
                      title="复制完整记录（含思考过程、工具调用和结果）"
                      className={`p-1 rounded-full transition-colors ${
                        copiedIndex === i
                          ? 'text-green-500'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">
                        {copiedIndex === i ? 'check' : 'assignment'}
                      </span>
                    </button>
                    {i === messages.length - 1 && messages.filter(m => m.role === 'user').length > 0 && (
                      <button
                        onClick={() => handleRetry(i)}
                        title={`重新生成${msg.retryCount ? ` (${msg.retryCount}/5)` : ''}`}
                        disabled={loading}
                        className="p-1 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons-round text-sm">replay</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-2xl rounded-bl-sm px-4 py-2">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Token 累计汇总 */}
            {messages.some(m => m.role === 'assistant' && (m as Message).tokenUsage) && (
              <div className="flex items-center justify-between pt-1 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--muted-foreground)]">📊 本轮对话累计</span>
                  {(() => {
                    const allUsage = messages
                      .filter(m => m.role === 'assistant' && (m as Message).tokenUsage)
                      .map(m => (m as Message).tokenUsage!);
                    const totalInput = allUsage.reduce((s, u) => s + (u.input || 0), 0);
                    const totalOutput = allUsage.reduce((s, u) => s + (u.output || 0), 0);
                    const totalTokens = totalInput + totalOutput;
                    return (
                      <span className="text-[10px] font-semibold text-[var(--foreground)]">
                        {totalTokens.toLocaleString()} tokens（输入 {totalInput.toLocaleString()} + 输出 {totalOutput.toLocaleString()}）≈ ¥{(totalTokens / 1000000 * tokenPrice).toFixed(4)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Page Quick Actions */}
          {!loading && (() => {
            const currentSource = getEffectiveSource();
            const actions = PAGE_QUICK_ACTIONS[currentSource] || [];
            if (actions.length === 0) return null;
            return (
              <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-[var(--card-border)]">
                {actions.map(action => (
                  <button
                    key={action.label}
                    onClick={() => {
                      createNewConversation();
                      setTimeout(() => {
                        setInput(action.prompt);
                      }, 50);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[#4285F4] hover:border-[#4285F4]/40 hover:bg-[#4285F4]/5 transition-colors whitespace-nowrap"
                    title={action.prompt}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Input */}
          <div className="flex items-end gap-2 p-3 border-t border-[var(--card-border)]">
            {loading && (
              <button
                onClick={() => {
                  abortControllerRef.current?.abort();
                  abortControllerRef.current = null;
                  setLoading(false);
                  setStatusText('');
                }}
                title="停止输出"
                className="p-2 rounded-xl bg-[#EA4335] text-white hover:bg-[#c5221f] transition-colors flex-shrink-0"
              >
                <span className="material-icons-round text-base">stop</span>
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter 发送，Shift+Enter 换行"
              disabled={loading}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] disabled:opacity-60 transition-colors"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-[#4285F4] text-white hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <span className="material-icons-round text-base">send</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      {!embedded && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 w-12 h-12 rounded-full bg-[#4285F4] text-white shadow-lg hover:bg-[#3367d6] hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
          title="AI 助手"
        >
          <span className="material-icons-round text-xl">
            {open ? 'close' : 'smart_toy'}
          </span>
        </button>
      )}

      {/* 全局 TTS 字幕 — 使用 Portal 渲染到屏幕中下方，显示 TTS 实际朗读文本 */}
      <TtsSubtitle
        text={subtitleText}
        visible={subtitleVisible}
        onClose={handleSubtitleClick}
      />

      {/* AI 设置弹窗 */}
      {settingsOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            padding: '16px',
          }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--card)',
              borderRadius: '16px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
              border: '1px solid var(--card-border)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--card-border)' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>⚙️ AI 设置</span>
              <button onClick={() => setSettingsOpen(false)} style={{ padding: '4px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 思考深度 */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>🧠 思考深度</div>
                <select
                  value={thinkingLevel}
                  onChange={(e) => {
                    const level = e.target.value as ThinkingLevel;
                    setThinkingLevel(level);
                    saveThinkingLevel(level);
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none' }}
                >
                  <option value="low">低 · 快速（4轮推理，隐藏思考过程）</option>
                  <option value="medium">中 · 平衡（10轮推理，折叠思考）</option>
                  <option value="high">高 · 深度（15轮推理，完整思考）</option>
                </select>
              </div>

              {/* 操作模式 */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>🛡️ 操作模式</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setSafetyMode('safe'); saveSafetyMode('safe'); }}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      border: safetyMode === 'safe' ? '2px solid #4285F4' : '1px solid var(--card-border)',
                      background: safetyMode === 'safe' ? '#4285F4/10' : 'var(--background)', color: 'var(--foreground)',
                    }}
                  >
                    安全模式
                    <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '4px', color: 'var(--muted-foreground)' }}>低风险自动通过，高风险确认</div>
                  </button>
                  <button
                    onClick={() => { setSafetyMode('yolo'); saveSafetyMode('yolo'); }}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      border: safetyMode === 'yolo' ? '2px solid #EA4335' : '1px solid var(--card-border)',
                      background: safetyMode === 'yolo' ? '#EA4335/10' : 'var(--background)', color: 'var(--foreground)',
                    }}
                  >
                    YOLO 模式
                    <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '4px', color: 'var(--muted-foreground)' }}>全部工具直接执行，不询问</div>
                  </button>
                </div>
              </div>

              {/* Token 价格 */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>💰 模型价格（元 / 100 万 tokens）</div>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={tokenPrice}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTokenPrice(val > 0 ? val : 0.1);
                  }}
                  onBlur={() => saveTokenPrice(tokenPrice)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none' }}
                />
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  用于估算每次对话的 token 费用（如 DeepSeek 约 ¥2/百万 tokens）
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 自定义操作确认弹窗 */}
      {consentDialog && (
        <ConsentDialog
          state={consentDialog}
          onApprove={() => {
            consentResolverRef.current?.(true);
            // 继续 Agent 循环
          }}
          onReject={() => consentResolverRef.current?.(false)}
          onClose={() => {
            // 关闭弹窗视为拒绝
            consentResolverRef.current?.(false);
          }}
          onAskSubmit={handleAskSubmit}
          onReview={handleReview}
        />
      )}
    </>
  );
}
