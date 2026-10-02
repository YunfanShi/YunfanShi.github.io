'use client';

import { useEffect, useRef } from 'react';
import { CUE_STAR_COLORS } from '@/lib/learning/cue-game';
import type { LearningStatus } from '@/lib/learning/schedule-control';
import styles from './cue-game-panel.module.css';

export const CUE_PARTICLE_DURATION = 3600;
const names = ['星核诞生', '星环共鸣', '极光绽放'];

/** Inspired by the sync answer sheet: gather → tighten → release, without blocking input. */
export default function CuePracticeBurst({ variant, status, count }: { variant: number; status: LearningStatus; count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') return;
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = width * ratio; canvas.height = height * ratio; ctx.scale(ratio, ratio);
    const cx = width / 2, cy = height * .48;
    const radius = Math.min(width * .38, height * .52);
    const color = CUE_STAR_COLORS[status];
    // Pre-render glows: no per-particle shadow blur or gradient allocation in the frame loop.
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const light = sprite.getContext('2d');
    if (light) {
      const glow = light.createRadialGradient(32,32,0,32,32,32);
      glow.addColorStop(0,'#ffffff'); glow.addColorStop(.08,'#fff4db'); glow.addColorStop(.22,color); glow.addColorStop(1,`${color}00`);
      light.fillStyle=glow; light.fillRect(0,0,64,64);
    }
    let seed = count * 7919 + variant, frame = 0;
    const random = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed / 4294967296; };
    const points=Array.from({length:520},(_,i)=>({angle:random()*Math.PI*2, distance:.3+random()*.7, size:2+random()*6, lane:i%6, phase:random()*Math.PI*2}));
    const path = (p: typeof points[number], t: number) => {
      const gather=Math.min(1,t/1.9), release=Math.max(0,Math.min(1,(t-1.9)/1.1));
      const compression=1-Math.pow(gather,2.2);
      const r=radius*p.distance*(compression + .045 + (1-Math.pow(1-release,3))*1.4);
      const angle=p.angle+gather*2.8+(variant===1?p.lane*.15:variant===2?Math.sin(p.angle*3)*gather*.5:0);
      if(variant===2) return {x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r*.55+Math.sin(angle*3+t)*r*.2};
      return {x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r*(variant===1?.36:.72)};
    };
    const start=performance.now();
    const draw=(now:number)=>{
      if(document.hidden || document.documentElement.dataset.reducedMotion==='true') return;
      const t=(now-start)/1000;
      const fade=Math.min(1,t/.35)*Math.min(1,Math.max(0,(3.6-t)/.65));
      ctx.clearRect(0,0,width,height);
      // A soft local focus veil keeps the outer controls readable throughout the show.
      const veil=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*1.65);
      veil.addColorStop(0,`rgba(3,7,20,${fade*.66})`); veil.addColorStop(.65,`rgba(3,7,20,${fade*.38})`); veil.addColorStop(1,'rgba(3,7,20,0)');
      ctx.fillStyle=veil; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='lighter';
      // Six flowing ribbons, made of many closely spaced curved trails.
      for(const p of points){
        const pos=path(p,t);
        ctx.globalAlpha=fade*(.25+.65*p.distance)*(t>2.8?Math.max(0,3.6-t):1);
        ctx.strokeStyle=color; ctx.lineWidth=p.size*.16;
        ctx.beginPath();
        for(let k=0;k<7;k++){
          const tail=path(p,Math.max(0,t-k*.018));
          if(k===0) ctx.moveTo(tail.x,tail.y); else ctx.lineTo(tail.x,tail.y);
        }
        ctx.stroke();
        const size=p.size*(2.2+Math.sin(p.phase+t*2)*.4);
        ctx.drawImage(sprite,pos.x-size/2,pos.y-size/2,size,size);
      }
      // Smooth, tilted interference rings distinguish the three compositions.
      ctx.lineWidth=.8;
      for(let ring=0;ring<9;ring++){
        const spread=t<1.9?1-Math.pow(t/1.9,2):.06+(1-Math.exp(-(t-1.9)*3))*1.4;
        const r=Math.max(1,radius*(.65+ring*.035)*spread);
        ctx.globalAlpha=fade*.16;
        ctx.strokeStyle=ring%3===0?'#e9f5ff':color;
        ctx.beginPath();ctx.ellipse(cx,cy,r,r*(variant===1?.33:.65),variant===2?-.25:Math.sin(t*.3)*.12,0,Math.PI*2);ctx.stroke();
      }
      const pulse=Math.exp(-Math.pow((t-1.95)/.24,2));
      const bloom=ctx.createRadialGradient(cx,cy,0,cx,cy,160+pulse*180);
      bloom.addColorStop(0,`rgba(255,255,255,${.16+pulse*.65})`); bloom.addColorStop(.08,`${color}99`);bloom.addColorStop(1,`${color}00`);
      ctx.globalAlpha=fade;ctx.fillStyle=bloom;ctx.fillRect(cx-340,cy-340,680,680);
      // Fine diffraction rays at release, rather than a full-screen white flash.
      if(pulse>.01){ctx.globalAlpha=pulse*.6;ctx.strokeStyle='#f5faff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-radius,cy);ctx.lineTo(cx+radius,cy);ctx.moveTo(cx,cy-55);ctx.lineTo(cx,cy+55);ctx.stroke();}
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      if(t<3.6) frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(frame);
  },[variant,status,count]);
  return <div className={styles.practiceBurst} data-cue-practice-burst data-variant={variant} aria-hidden="true"><canvas ref={ref}/><span><small>{names[variant % 3]}</small><strong>{count}</strong><small>次认真检索 · 每次努力都留下星光</small></span></div>;
}
