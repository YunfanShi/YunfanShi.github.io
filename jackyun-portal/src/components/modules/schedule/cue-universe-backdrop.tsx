'use client';

import { useEffect, useRef } from 'react';
import { cueGalaxyPoint, CUE_STAR_COLORS, type CueStar, type CueAnimationSituation } from '@/lib/learning/cue-game';
import styles from './cue-game-panel.module.css';

// Small cached light sprites keep thousands of distant particles inexpensive to draw.
function lightSprite(color: string) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const context = sprite.getContext('2d');
  if (context) {
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, '#ffffff'); glow.addColorStop(.06, color); glow.addColorStop(.2, `${color}88`); glow.addColorStop(.5, `${color}18`); glow.addColorStop(1, `${color}00`);
    context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  }
  return sprite;
}

export default function CueUniverseBackdrop({ stars, animations, highlight, celebration }: { stars: CueStar[]; animations: boolean; highlight?: string; celebration?: { situation: CueAnimationSituation; variant: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(-.55);
  const previousPaint = useRef<number | null>(null);
  const arrivals = useRef(new Map<string, number>());
  const knownStars = useRef<Set<string> | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;
    const born = performance.now();
    const points = stars.map((star) => {
      if (knownStars.current !== null && !knownStars.current.has(star.id)) arrivals.current.set(star.id, born);
      return { ...cueGalaxyPoint(star.id), star, arrivedAt: arrivals.current.get(star.id) };
    });
    knownStars.current = new Set(stars.map((star) => star.id));
    const dust = Array.from({ length: 3600 }, (_, i) => cueGalaxyPoint(`ambient-${i}`));
    const sprites = { stable: lightSprite(CUE_STAR_COLORS.stable), partial: lightSprite(CUE_STAR_COLORS.partial), unclear: lightSprite(CUE_STAR_COLORS.unclear), dust: lightSprite('#a9bddb') };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = 0, lastFrame = 0;
    const moving = () => animations && !reduced.matches && document.documentElement.dataset.reducedMotion !== 'true';
    const project = (point: ReturnType<typeof cueGalaxyPoint>, phase: number) => {
      const angle = point.angle + phase;
      const x = Math.cos(angle) * point.radius;
      const y = Math.sin(angle) * point.radius;
      const depth = 1 / (1.6 + y * .3 + point.z * .15);
      const scale = Math.max(width * .65, height * .92);
      return { x: width * .57 + (x * .93 - y * .24) * scale * depth, y: height * .54 + (y * .54 + point.z) * scale * depth, depth };
    };
    const paint = (now: number) => {
      context.fillStyle = '#040810'; context.fillRect(0, 0, width, height);
      const haze = context.createRadialGradient(width * .57, height * .54, 0, width * .57, height * .54, Math.max(width, height) * .6);
      haze.addColorStop(0, '#1b294249'); haze.addColorStop(.35, '#111d3038'); haze.addColorStop(1, '#04081000');
      context.fillStyle = haze; context.fillRect(0, 0, width, height);
      const core = context.createRadialGradient(width * .57, height * .54, 0, width * .57, height * .54, height * .2);
      core.addColorStop(0, '#b5c8ef24'); core.addColorStop(.2, '#5c77aa16'); core.addColorStop(1, '#04081000');
      context.fillStyle = core; context.fillRect(0, 0, width, height);
      const elapsed = Math.min(100, now - (previousPaint.current ?? now));
      previousPaint.current = now;
      if (moving() && !document.hidden) phaseRef.current += elapsed * .000008;
      const phase = phaseRef.current;
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = '#afc7ed';
      context.globalAlpha = .3;
      context.beginPath();
      for (const point of dust) { const p = project(point, phase); context.moveTo(p.x + point.size, p.y); context.arc(p.x, p.y, point.size * p.depth, 0, Math.PI * 2); }
      context.fill();
      for (let i = 0; i < dust.length; i += 19) {
        const p = project(dust[i], phase); const size = 9 + dust[i].size * 5;
        context.globalAlpha = .35; context.drawImage(sprites.dust, p.x - size / 2, p.y - size / 2, size, size);
      }
      for (const point of points) {
        const p = project(point, phase);
        const age = moving() && point.arrivedAt !== undefined ? Math.min(1, (now - point.arrivedAt) / 1200) : 1;
        const arrival = Math.sin(age * Math.PI) * (point.arrivedAt !== undefined ? 12 : 0);
        const size = (22 + point.size * 6 + arrival) * p.depth;
        context.globalAlpha = .35 + age * .6;
        context.drawImage(sprites[point.star.status], p.x - size / 2, p.y - size / 2, size, size);
        context.fillStyle = CUE_STAR_COLORS[point.star.status];
        context.beginPath(); context.arc(p.x, p.y, (1.1 + point.size * .35) * p.depth, 0, Math.PI * 2); context.fill();
        if (highlight === point.star.cueId && age < 1 && moving()) {
          context.globalAlpha = (1 - age) * .5; context.strokeStyle = CUE_STAR_COLORS[point.star.status]; context.lineWidth = .7;
          context.beginPath(); context.arc(p.x, p.y, 4 + age * 20, 0, Math.PI * 2); context.stroke();
        }
      }
      if (celebration && ['constellation', 'level'].includes(celebration.situation) && moving()) {
        const age = Math.min(1, (now - born) / 1600);
        context.globalAlpha = Math.sin(age * Math.PI) * .24;
        context.strokeStyle = celebration.situation === 'level' ? '#fcd34d' : '#aec6ed';
        context.lineWidth = .6;
        context.beginPath();
        const radius = (35 + age * 110) * (1 + celebration.variant * .2);
        context.ellipse(width * .57, height * .54, radius * 2, radius * .8, -.25 + celebration.variant * .3, 0, Math.PI * 2); context.stroke();
      }
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    };
    const tick = (now: number) => {
      if (document.hidden || !moving()) { frame = 0; return; }
      if (now - lastFrame >= 1000 / 30) { paint(now); lastFrame = now; }
      frame = requestAnimationFrame(tick);
    };
    const refresh = () => { cancelAnimationFrame(frame); frame = 0; paint(performance.now()); if (!document.hidden && moving()) frame = requestAnimationFrame(tick); };
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0); refresh();
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', refresh); reduced.addEventListener('change', refresh);
    resize();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', refresh); reduced.removeEventListener('change', refresh); };
  }, [stars, animations, highlight, celebration]);
  return <div className={styles.backdrop} data-cue-universe-background data-motion={animations} data-stars={stars.length} role="img" aria-label={`已点亮 ${stars.length} 颗星的学习星空`}><canvas ref={canvasRef} aria-hidden="true" /><div className={styles.vignette} /></div>;
}
