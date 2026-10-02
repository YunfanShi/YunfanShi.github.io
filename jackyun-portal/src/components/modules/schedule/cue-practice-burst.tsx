'use client';

import { useEffect, useRef } from 'react';
import { CUE_STAR_COLORS } from '@/lib/learning/cue-game';
import type { LearningStatus } from '@/lib/learning/schedule-control';
import styles from './cue-game-panel.module.css';

/** A short, transparent answer-area particle show. It never receives pointer input. */
export default function CuePracticeBurst({ variant, status, count }: { variant: number; status: LearningStatus; count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d');
    if (!canvas || !context || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') return;
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = width * ratio; canvas.height = height * ratio; context.scale(ratio, ratio);
    const bounds = document.querySelector('[data-cue-study-stage]')?.getBoundingClientRect();
    const cx = bounds ? bounds.left + bounds.width / 2 : width / 2;
    const cy = bounds ? bounds.top + bounds.height * .4 : height * .48;
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 40;
    const light = sprite.getContext('2d');
    if (light) {
      const glow = light.createRadialGradient(20, 20, 0, 20, 20, 20);
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(.15, CUE_STAR_COLORS[status]); glow.addColorStop(1, `${CUE_STAR_COLORS[status]}00`);
      light.fillStyle = glow; light.fillRect(0, 0, 40, 40);
    }
    let seed = count * 7919 + variant, frame = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const particles = Array.from({ length: 360 }, () => ({ angle: random() * Math.PI * 2, radius: 70 + random() * Math.min(width * .46, 560), offset: random(), size: 5 + random() * 12 }));
    const start = performance.now();
    const draw = (now: number) => {
      if (document.hidden || document.documentElement.dataset.reducedMotion === 'true') return;
      const t = Math.min(1, (now - start) / 1450);
      context.clearRect(0, 0, width, height); context.globalCompositeOperation = 'lighter';
      const fade = Math.sin(t * Math.PI) * .85;
      for (const point of particles) {
        let x: number, y: number;
        if (variant === 0) { // converge, then release as a luminous spiral
          const radius = point.radius * (t < .45 ? 1 - t * 1.8 : .19 + (t - .45) * 1.9);
          x = cx + Math.cos(point.angle + t * 2.2) * radius; y = cy + Math.sin(point.angle + t * 2.2) * radius * .6;
        } else if (variant === 1) { // meteor curtain across the answer region
          x = cx - width * .38 + point.offset * width * .76 + t * 160; y = cy - height * .35 + ((point.angle / (Math.PI * 2) + t * .8) % 1) * height * .7;
        } else { // expanding petals of light
          const radius = point.radius * (.3 + t);
          const angle = point.angle + Math.sin(point.angle * 5) * t * .35;
          x = cx + Math.cos(angle) * radius; y = cy + Math.sin(angle) * radius * .65;
        }
        context.globalAlpha = fade * (.35 + point.offset * .6);
        context.drawImage(sprite, x - point.size / 2, y - point.size / 2, point.size, point.size);
        if (variant === 1) { context.strokeStyle = CUE_STAR_COLORS[status]; context.lineWidth = .7; context.beginPath(); context.moveTo(x, y); context.lineTo(x - 10, y - 22); context.stroke(); }
      }
      context.globalAlpha = fade * .38;
      context.strokeStyle = CUE_STAR_COLORS[status]; context.lineWidth = 1.5;
      for (let ring = 0; ring < 3; ring++) {
        const radius = 60 + t * 360 + ring * 40;
        context.beginPath(); context.ellipse(cx, cy, radius, radius * .55, variant * .4, 0, Math.PI * 2); context.stroke();
      }
      const bloom = context.createRadialGradient(cx, cy, 0, cx, cy, 220);
      bloom.addColorStop(0, `${CUE_STAR_COLORS[status]}55`); bloom.addColorStop(1, `${CUE_STAR_COLORS[status]}00`);
      context.globalAlpha = fade * .3; context.fillStyle = bloom; context.fillRect(cx - 220, cy - 220, 440, 440);
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [variant, status, count]);
  return <div className={styles.practiceBurst} data-cue-practice-burst data-variant={variant} aria-hidden="true"><canvas ref={ref} /><span>✦ 已完成 {count} 次认真检索</span></div>;
}
