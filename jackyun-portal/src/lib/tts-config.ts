/**
 * 统一 TTS 配置管理 —— 纯本地存储
 *
 * 存储位置：localStorage key "jackyun-tts-config"
 * 存储格式：{ engine: string; voiceURI: string; rate: number; pitch: number; autoSpeakAi: boolean }
 */

export interface TtsConfig {
  engine: 'edge' | 'chrome' | 'system';
  voiceURI: string;
  rate: number;
  pitch: number;
  /** AI 回复自动朗读开关 */
  autoSpeakAi: boolean;
}

const STORAGE_KEY = 'jackyun-tts-config';

const DEFAULT_CONFIG: TtsConfig = {
  engine: 'system',
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0,
  autoSpeakAi: false,
};

/** 从 localStorage 读取 TTS 配置 */
export function getTtsConfig(): TtsConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<TtsConfig>;
    return {
      engine: (parsed.engine as TtsConfig['engine']) ?? DEFAULT_CONFIG.engine,
      voiceURI: parsed.voiceURI ?? DEFAULT_CONFIG.voiceURI,
      rate: parsed.rate ?? DEFAULT_CONFIG.rate,
      pitch: parsed.pitch ?? DEFAULT_CONFIG.pitch,
      autoSpeakAi: parsed.autoSpeakAi ?? DEFAULT_CONFIG.autoSpeakAi,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 保存 TTS 配置到 localStorage */
export function saveTtsConfig(config: TtsConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** 删除 TTS 配置 */
export function clearTtsConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 获取可用的语音列表，按引擎分组
 */
export function getVoicesByEngine(): {
  edge: SpeechSynthesisVoice[];
  chrome: SpeechSynthesisVoice[];
  other: SpeechSynthesisVoice[];
} {
  if (typeof window === 'undefined') {
    return { edge: [], chrome: [], other: [] };
  }
  const voices = window.speechSynthesis.getVoices();
  const edge: SpeechSynthesisVoice[] = [];
  const chrome: SpeechSynthesisVoice[] = [];
  const other: SpeechSynthesisVoice[] = [];

  for (const v of voices) {
    if (v.name.includes('Microsoft')) {
      edge.push(v);
    } else if (v.name.includes('Google')) {
      chrome.push(v);
    } else {
      other.push(v);
    }
  }

  return { edge, chrome, other };
}

/**
 * 从 AI 回复中提取适合 TTS 朗读的文本
 *
 * 规则：
 * 1. 优先提取 [TTS]...[/TTS] 标记内的文本
 * 2. 如果没有 [TTS] 标记，去除所有代码块（```...```）和表格（以 | 开头的行）
 * 3. 返回纯文本
 */
export function extractTtsText(content: string): string {
  if (!content) return '';

  // 1. 尝试提取 [TTS] 标记内的内容
  const ttsMatch = content.match(/\[TTS\]([\s\S]*?)\[\/TTS\]/);
  if (ttsMatch) {
    return ttsMatch[1].trim();
  }

  // 2. 去除代码块
  let text = content.replace(/```[\s\S]*?```/g, '');

  // 3. 去除表格行（以 | 开头或包含 |---| 的行）
  text = text.split('\n').filter(line => {
    const trimmed = line.trim();
    // 跳过纯表格行
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) return false;
    // 跳过分隔线
    if (/^[\s\|:-]+$/.test(trimmed)) return false;
    return true;
  }).join('\n');

  // 4. 压缩多余空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text || content;
}

/**
 * 使用当前配置朗读文本
 */
export function speakWithConfig(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): void {
  if (typeof window === 'undefined') return;

  // 取消当前朗读
  window.speechSynthesis.cancel();

  const config = getTtsConfig();
  const utterance = new SpeechSynthesisUtterance(text);

  // 设置语言（智能检测）
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  utterance.lang = hasChinese ? 'zh-CN' : 'en-US';

  // 设置语速和音调
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;

  // 按引擎筛选语音
  if (config.voiceURI) {
    utterance.voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.voiceURI === config.voiceURI) ?? null;
  } else {
    const voices = window.speechSynthesis.getVoices();
    const enginePrefix = config.engine === 'edge' ? 'Microsoft' : config.engine === 'chrome' ? 'Google' : '';
    if (enginePrefix) {
      const matched = voices.find(
        (v) =>
          v.name.includes(enginePrefix) &&
          (hasChinese ? v.lang.includes('zh') : v.lang.includes('en')),
      );
      if (matched) utterance.voice = matched;
    }
  }

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;

  window.speechSynthesis.speak(utterance);
}

/**
 * 停止朗读
 */
export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  window.speechSynthesis.cancel();
}

/**
 * 检查语音是否正在朗读
 */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false;
  return window.speechSynthesis.speaking;
}

/** 检查 AI 自动朗读是否开启 */
export function isAutoSpeakAiEnabled(): boolean {
  return getTtsConfig().autoSpeakAi;
}