'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTtsConfig, saveTtsConfig, getVoicesByEngine, speakWithConfig, stopSpeaking, isSpeaking, isAutoSpeakAiEnabled, getTtsLanguage, getTtsLanguageLabel, TtsConfig } from '@/lib/tts-config';

export default function TtsConfigPanel() {
  const [config, setConfig] = useState<TtsConfig>(() => getTtsConfig());
  const [voices, setVoices] = useState<{ edge: SpeechSynthesisVoice[]; chrome: SpeechSynthesisVoice[]; other: SpeechSynthesisVoice[] }>({ edge: [], chrome: [], other: [] });
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeakAi, setAutoSpeakAi] = useState(() => isAutoSpeakAiEnabled());
  const [ttsLanguage, setTtsLanguage] = useState<'zh-CN' | 'en-US'>(() => getTtsLanguage() as 'zh-CN' | 'en-US');
  const [testText, setTestText] = useState('你好，欢迎使用语音朗读功能。Hello, welcome to the text-to-speech feature.');
  const [previewText, setPreviewText] = useState('');

  const loadVoices = useCallback(() => {
    const v = getVoicesByEngine();
    setVoices(v);
  }, []);

  useEffect(() => {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [loadVoices]);

  function handleEngineChange(engine: TtsConfig['engine']) {
    const newConfig = { ...config, engine, voiceURI: '' };
    setConfig(newConfig);
    saveTtsConfig(newConfig);
  }

  function handleVoiceChange(voiceURI: string) {
    const newConfig = { ...config, voiceURI };
    setConfig(newConfig);
    saveTtsConfig(newConfig);
  }

  function handleRateChange(rate: number) {
    const newConfig = { ...config, rate };
    setConfig(newConfig);
    saveTtsConfig(newConfig);
  }

  function handlePitchChange(pitch: number) {
    const newConfig = { ...config, pitch };
    setConfig(newConfig);
    saveTtsConfig(newConfig);
  }

  function handleTest() {
    const text = previewText || testText;
    if (!text.trim()) return;
    setSpeaking(true);
    speakWithConfig(
      text,
      undefined,
      () => setSpeaking(false),
    );
  }

  function handleStop() {
    stopSpeaking();
    setSpeaking(false);
  }

  function handleAutoSpeakAiToggle() {
    const newValue = !autoSpeakAi;
    setAutoSpeakAi(newValue);
    const currentConfig = getTtsConfig();
    saveTtsConfig({ ...currentConfig, autoSpeakAi: newValue });
  }

  function handleTtsLanguageChange(lang: 'zh-CN' | 'en-US') {
    setTtsLanguage(lang);
    const currentConfig = getTtsConfig();
    saveTtsConfig({ ...currentConfig, ttsLanguage: lang });
    // 触发试听
    speakWithConfig(lang === 'zh-CN' ? '你好，这是中文语音测试' : 'Hello, this is an English voice test', undefined, undefined);
  }

  // 获取当前引擎的语音列表
  const currentVoices =
    config.engine === 'edge' ? voices.edge :
    config.engine === 'chrome' ? voices.chrome :
    [...voices.edge, ...voices.chrome, ...voices.other];

  const inputClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';
  const selectClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        配置语音朗读（TTS）引擎和音色，所有支持 TTS 的页面（如 Control 页面）将使用此设置。
      </p>

      {/* 自动朗读 AI 回复开关 */}
      <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-[var(--background)] border border-[var(--card-border)]">
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] cursor-pointer">
            🔊 自动朗读 AI 回复
          </label>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            开启后，AI 助手的回复将自动朗读
          </p>
        </div>
        <button
          onClick={handleAutoSpeakAiToggle}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            autoSpeakAi ? 'bg-[#4285F4]' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={autoSpeakAi}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              autoSpeakAi ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* TTS 语言选择 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          🌐 TTS 朗读语言
        </label>
        <p className="text-xs text-[var(--muted-foreground)] mb-2">
          选择朗读 AI 回复时使用的语言，AI 会在回复末尾自动附加对应语言的朗读文本
        </p>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'zh-CN' as const, label: '中文' },
            { value: 'en-US' as const, label: 'English' },
          ]).map((lang) => (
            <button
              key={lang.value}
              onClick={() => handleTtsLanguageChange(lang.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                ttsLanguage === lang.value
                  ? 'bg-[#4285F4] text-white'
                  : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] hover:border-[#4285F4]/50'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          选择后将试听对应语言的语音效果
        </p>
      </div>

      {/* 引擎选择 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          TTS 引擎
        </label>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'system' as const, label: '系统默认' },
            { value: 'edge' as const, label: 'Microsoft Edge' },
            { value: 'chrome' as const, label: 'Google Chrome' },
          ]).map((engine) => (
            <button
              key={engine.value}
              onClick={() => handleEngineChange(engine.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                config.engine === engine.value
                  ? 'bg-[#4285F4] text-white'
                  : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] hover:border-[#4285F4]/50'
              }`}
            >
              {engine.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Edge 提供 Microsoft 系列语音（如 Xiaoxiao、Yunxi），Chrome 提供 Google 系列语音
        </p>
      </div>

      {/* 音色选择 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          音色选择
        </label>
        {currentVoices.length > 0 ? (
          <select
            value={config.voiceURI || ''}
            onChange={(e) => handleVoiceChange(e.target.value)}
            className={selectClass}
          >
            <option value="">自动匹配（根据引擎自动选择）</option>
            {currentVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            暂无可用语音，请等待语音列表加载完成...
          </p>
        )}
        {currentVoices.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">
              共 {currentVoices.length} 个音色可用
            </span>
            <button
              onClick={() => {
                loadVoices();
                window.speechSynthesis.getVoices(); // 触发重新加载
              }}
              className="text-xs text-[#4285F4] hover:underline flex items-center gap-1"
            >
              <span className="material-icons-round text-xs">refresh</span>
              刷新
            </button>
          </div>
        )}
      </div>

      {/* 语速 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          语速: {config.rate.toFixed(1)}x
        </label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={config.rate}
          onChange={(e) => handleRateChange(parseFloat(e.target.value))}
          className="w-full accent-[#4285F4]"
        />
        <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
          <span>0.5x 慢</span>
          <span>1.0x 正常</span>
          <span>2.0x 快</span>
        </div>
      </div>

      {/* 音调 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          音调: {config.pitch.toFixed(1)}
        </label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={config.pitch}
          onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
          className="w-full accent-[#4285F4]"
        />
        <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
          <span>低沉</span>
          <span>正常</span>
          <span>尖细</span>
        </div>
      </div>

      {/* 测试区域 */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          试听文本
        </label>
        <textarea
          value={previewText || testText}
          onChange={(e) => setPreviewText(e.target.value)}
          rows={2}
          className={inputClass}
          placeholder="输入要试听的文本..."
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleTest}
            disabled={speaking}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-icons-round text-sm">play_arrow</span>
            {speaking ? '朗读中...' : '试听'}
          </button>
          {speaking && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#EA4335] text-sm font-medium text-white hover:bg-[#c5221f] transition-colors"
            >
              <span className="material-icons-round text-sm">stop</span>
              停止
            </button>
          )}
          <button
            onClick={() => {
              setPreviewText('');
              setTestText('');
            }}
            className="flex items-center gap-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
          >
            <span className="material-icons-round text-sm">delete</span>
            清除
          </button>
        </div>
      </div>

      {/* 状态提示 */}
      <p className="text-xs text-[var(--muted-foreground)]">
        💡 设置将自动保存到浏览器本地。Control 页面将使用此配置朗读提醒。
      </p>
    </div>
  );
}