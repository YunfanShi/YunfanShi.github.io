'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type NoiseType = 'rain' | 'forest' | 'ocean' | 'cafe';

const NOISE_CONFIGS: Record<NoiseType, { label: string; icon: string; filterType: BiquadFilterType; frequency: number; gain: number }> = {
  rain:   { label: '雨声',  icon: 'water_drop',  filterType: 'bandpass', frequency: 400, gain: 0.8 },
  forest: { label: '森林',  icon: 'forest',       filterType: 'lowpass',  frequency: 800, gain: 0.7 },
  ocean:  { label: '海浪',  icon: 'waves',        filterType: 'lowpass',  frequency: 300, gain: 0.9 },
  cafe:   { label: '咖啡厅', icon: 'local_cafe',  filterType: 'highpass', frequency: 200, gain: 0.6 },
};

const ACCENT = '#4285F4';

export default function NoiseGenerator() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume]       = useState(0.5);
  const [noiseType, setNoiseType] = useState<NoiseType>('rain');

  const ctxRef    = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef   = useRef<GainNode | null>(null);

  const stopSource = useCallback(() => {
    try { sourceRef.current?.stop(); } catch (_) { /* already stopped */ }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
  }, []);

  const buildAndStart = useCallback((ctx: AudioContext, type: NoiseType, vol: number) => {
    stopSource();
    const config = NOISE_CONFIGS[type];
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = config.filterType;
    filter.frequency.value = config.frequency;

    const gain = ctx.createGain();
    gain.gain.value = vol * config.gain;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    sourceRef.current = source;
    gainRef.current   = gain;
  }, [stopSource]);

  const handlePlay = useCallback(async () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    buildAndStart(ctx, noiseType, volume);
    setIsPlaying(true);
  }, [noiseType, volume, buildAndStart]);

  const handleStop = useCallback(() => {
    stopSource();
    setIsPlaying(false);
  }, [stopSource]);

  const handleTypeChange = useCallback((type: NoiseType) => {
    setNoiseType(type);
    if (isPlaying && ctxRef.current) buildAndStart(ctxRef.current, type, volume);
  }, [isPlaying, volume, buildAndStart]);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    if (gainRef.current && isPlaying) gainRef.current.gain.value = v * NOISE_CONFIGS[noiseType].gain;
  }, [isPlaying, noiseType]);

  useEffect(() => {
    return () => {
      stopSource();
      ctxRef.current?.close();
    };
  }, [stopSource]);

  const config = NOISE_CONFIGS[noiseType];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(NOISE_CONFIGS) as NoiseType[]).map((type) => {
          const c = NOISE_CONFIGS[type];
          const active = noiseType === type;
          return (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className="flex flex-col items-center gap-1 rounded-[10px] border py-3 transition-all"
              style={{
                borderColor:     active ? ACCENT : 'var(--card-border)',
                backgroundColor: active ? `${ACCENT}18` : 'transparent',
                color:           active ? ACCENT : 'var(--muted-foreground)',
              }}
            >
              <span className="material-icons-round text-xl">{c.icon}</span>
              <span className="text-xs font-medium">{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 72, height: 72,
            backgroundColor: `${ACCENT}15`,
            border: `2px solid ${ACCENT}40`,
            animation: isPlaying ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
          }}
        >
          <span className="material-icons-round text-3xl" style={{ color: isPlaying ? ACCENT : 'var(--muted-foreground)' }}>
            {config.icon}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="material-icons-round text-base text-[var(--muted-foreground)]">volume_down</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          className="flex-1 accent-[#4285F4] h-1.5 rounded-full"
        />
        <span className="material-icons-round text-base text-[var(--muted-foreground)]">volume_up</span>
        <span className="text-xs text-[var(--muted-foreground)] w-8 text-right">{Math.round(volume * 100)}%</span>
      </div>

      <button
        onClick={isPlaying ? handleStop : handlePlay}
        className="flex items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
        style={{ backgroundColor: isPlaying ? '#EA4335' : ACCENT }}
      >
        <span className="material-icons-round text-base">{isPlaying ? 'stop' : 'play_arrow'}</span>
        {isPlaying ? '停止' : '播放'}
      </button>

      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}`}</style>
    </div>
  );
}
