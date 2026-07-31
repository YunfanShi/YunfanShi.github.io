/**
 * 统一 TTS 配置管理 —— 纯本地存储
 *
 * 存储位置：localStorage key "jackyun-tts-config"
 * 存储格式：{ engine: string; voiceURI: string; rate: number; pitch: number; autoSpeakAi: boolean; ttsLanguage: string }
 */

export interface TtsConfig {
  engine: 'edge' | 'chrome' | 'system';
  voiceURI: string;
  rate: number;
  pitch: number;
  /** AI 回复自动朗读开关 */
  autoSpeakAi: boolean;
  /** TTS 朗读语言 */
  ttsLanguage: 'zh-CN' | 'en-US';
}

const STORAGE_KEY = 'jackyun-tts-config';

const DEFAULT_CONFIG: TtsConfig = {
  engine: 'system',
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0,
  autoSpeakAi: false,
  ttsLanguage: 'zh-CN',
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
      ttsLanguage: (parsed.ttsLanguage === 'en-US' ? 'en-US' : 'zh-CN') as TtsConfig['ttsLanguage'],
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
 * 获取可用的语音列表，按引擎分组（带二次重试确保 voices 加载完成）
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
  return categorizeVoices(voices);
}

function categorizeVoices(voices: SpeechSynthesisVoice[]) {
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

/** 等待 voices 加载完成（最多等待 2 秒） */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const onChanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = onChanged;
    // Timeout after 2s
    setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    }, 2000);
  });
}

/**
 * 清理 Markdown 语法，提取纯文本
 */
function stripMarkdown(text: string): string {
  return text
    // 去掉 tool_call 代码块
    .replace(/```tool_call[\s\S]*?```/g, '')
    // 去掉代码块
    .replace(/```[\s\S]*?```/g, '')
    // 去掉 [TTS_LANG] 标签本身（防止被读出来）
    .replace(/\[TTS_LANG:[^\]]*\][\s\S]*?\[\/TTS_LANG\]/g, '')
    .replace(/\[TTS\][\s\S]*?\[\/TTS\]/g, '')
    // 去掉 Markdown 链接 [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 去掉加粗/斜体
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // 去掉行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 去掉标题标记
    .replace(/^#+\s*/gm, '')
    // 去掉列表标记
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // 去掉引用
    .replace(/^>\s*/gm, '')
    // 去掉分割线
    .replace(/^---+/gm, '')
    // 去掉表格行
    .replace(/^[\s]*\|.*\|[\s]*$/gm, '')
    // 去掉 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 压缩多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 从 AI 回复中提取适合 TTS 朗读的文本（纯文本，无 Markdown）
 *
 * 规则：
 * 1. 优先提取匹配当前 TTS 语言 [TTS_LANG:语言代码]...[/TTS_LANG] 标记内的文本
 * 2. 然后尝试提取任何 [TTS_LANG:语言代码] 标签内文本（无论语言，AI 通常输出与 TTS 语言一致的标签）
 * 3. 再尝试提取 [TTS]...[/TTS] 通用标记
 * 4. 最后智能判断：只有当纯文本的语言与 TTS 语言匹配时才返回，否则返回空（避免用英文语音念中文）
 */
export function extractTtsText(content: string): string {
  if (!content) return '';

  const config = getTtsConfig();
  const lang = config.ttsLanguage || 'zh-CN';

  // 1. 尝试提取匹配当前 TTS 语言的 [TTS_LANG] 标签
  const langMatch = content.match(new RegExp(`\\[TTS_LANG:${lang}\\]([\\s\\S]*?)\\[\\/TTS_LANG\\]`));
  if (langMatch) {
    return stripMarkdown(langMatch[1]).trim();
  }

  // 2. 尝试提取任何语言的 [TTS_LANG] 标签内文本
  //    如果 AI 只输出了一种语言版本的标签，我们也朗读它
  const anyLangMatch = content.match(/\[TTS_LANG:[^\]]+\]([\s\S]*?)\[\/TTS_LANG\]/);
  if (anyLangMatch) {
    return stripMarkdown(anyLangMatch[1]).trim();
  }

  // 3. 尝试提取通用的 [TTS] 标签
  const ttsMatch = content.match(/\[TTS\]([\s\S]*?)\[\/TTS\]/);
  if (ttsMatch) {
    return stripMarkdown(ttsMatch[1]).trim();
  }

  // 4. 退回到全部内容去除 Markdown，但需要智能判断语言是否匹配
  const plainText = stripMarkdown(content).trim();
  if (!plainText) return '';

  // 如果 TTS 语言是英文，但文本主要是中文（非 ASCII 字符占多数），不朗读
  // 避免用英文语音读中文导致的乱码
  if (lang === 'en-US') {
    const asciiChars = (plainText.match(/[\x00-\x7F]/g) || []).length;
    const totalChars = plainText.replace(/\s/g, '').length;
    if (totalChars > 0 && asciiChars / totalChars < 0.6) {
      return ''; // 大部分是非 ASCII 字符（中文），不朗读
    }
  }

  // 如果是中文 TTS，只要有中文标签内的内容就朗读
  return plainText;
}

/**
 * 双语字幕文本提取：返回两个语言版本的文本
 * 如果 AI 回复中有 [TTS_LANG:zh-CN] 和 [TTS_LANG:en-US] 标签，则提取双语
 * 否则返回相同文本或仅当前语言文本
 */
export function extractDualLangText(content: string): {
  zhText: string;
  enText: string;
} {
  if (!content) return { zhText: '', enText: '' };

  const zhMatch = content.match(/\[TTS_LANG:zh-CN\]([\s\S]*?)\[\/TTS_LANG\]/);
  const enMatch = content.match(/\[TTS_LANG:en-US\]([\s\S]*?)\[\/TTS_LANG\]/);

  const zhText = zhMatch ? stripMarkdown(zhMatch[1]).trim() : '';
  const enText = enMatch ? stripMarkdown(enMatch[1]).trim() : '';

  // 如果没有双语标签，尝试 [TTS] 标签
  if (!zhText && !enText) {
    const ttsMatch = content.match(/\[TTS\]([\s\S]*?)\[\/TTS\]/);
    const fullText = ttsMatch ? stripMarkdown(ttsMatch[1]).trim() : stripMarkdown(content).trim();
    return { zhText: fullText, enText: fullText };
  }

  // 如果只有一种语言，另一种也用纯文本
  if (!zhText) {
    const plain = stripMarkdown(content).trim();
    return { zhText: plain, enText: enText || plain };
  }
  if (!enText) {
    const plain = stripMarkdown(content).trim();
    return { zhText: zhText || plain, enText: plain };
  }

  return { zhText, enText };
}

/**
 * 查找匹配配置的最佳语音（带重试机制）
 */
function findBestVoice(config: TtsConfig, voices?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const list = voices || window.speechSynthesis.getVoices();
  if (list.length === 0) return null;

  // 如果有 voiceURI 精确匹配
  if (config.voiceURI) {
    const exact = list.find((v) => v.voiceURI === config.voiceURI);
    if (exact) return exact;
  }

  // 按引擎 + 语言匹配
  const enginePrefix = config.engine === 'edge' ? 'Microsoft' :
                       config.engine === 'chrome' ? 'Google' : '';
  const targetLang = config.ttsLanguage || 'zh-CN';

  if (enginePrefix) {
    // 精确匹配引擎 + 语言
    let matched = list.find(
      (v) => v.name.includes(enginePrefix) && v.lang.startsWith(targetLang)
    );
    if (matched) return matched;

    // 回退：匹配引擎 + 任意语言
    matched = list.find((v) => v.name.includes(enginePrefix));
    if (matched) return matched;
  }

  // 最后回退：匹配语言
  const anyLang = list.find((v) => v.lang.startsWith(targetLang));
  if (anyLang) return anyLang;

  return list[0] || null;
}

/**
 * 使用当前配置朗读文本
 * 自动重试确保 voices 加载完成
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

  // 设置语速和音调
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;

  // 设置语言（供没有 voice 匹配时回退）
  utterance.lang = config.ttsLanguage || 'zh-CN';

  // 立即尝试匹配语音
  const immediateVoice = findBestVoice(config);
  if (immediateVoice) {
    utterance.voice = immediateVoice;
    utterance.lang = immediateVoice.lang; // 跟随 voice 的语言
  }

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;

  // 错误处理：如果 voice 没加载到，朗读会失败，静默继续
  utterance.onerror = () => {
    // ignore
  };

  window.speechSynthesis.speak(utterance);

  // 如果 voices 还没加载完成（首次调用），异步重试
  if (!immediateVoice) {
    waitForVoices().then((voices) => {
      const retryVoice = findBestVoice(config, voices);
      if (retryVoice) {
        // 再次朗读
        window.speechSynthesis.cancel();
        const retryUtterance = new SpeechSynthesisUtterance(text);
        retryUtterance.voice = retryVoice;
        retryUtterance.lang = retryVoice.lang;
        retryUtterance.rate = config.rate;
        retryUtterance.pitch = config.pitch;
        if (onStart) retryUtterance.onstart = onStart;
        if (onEnd) retryUtterance.onend = onEnd;
        window.speechSynthesis.speak(retryUtterance);
      }
    });
  }
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

/** 获取当前 TTS 语言 */
export function getTtsLanguage(): string {
  return getTtsConfig().ttsLanguage || 'zh-CN';
}

/** 获取 TTS 语言的中文标签（用于 AI Prompt） */
export function getTtsLanguageLabel(): string {
  const lang = getTtsLanguage();
  return lang === 'en-US' ? '英文' : '中文';
}