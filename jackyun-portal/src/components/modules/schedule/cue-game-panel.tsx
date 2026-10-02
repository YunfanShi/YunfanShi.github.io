'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cueGameProgress, CUE_GAME_UNLOCKS, CUE_GAME_XP, CUE_LEVEL_XP, CUE_ENEMY_HITS } from '@/lib/learning/cue-game';
import type { CueReview } from '@/lib/learning/schedule-control';
import styles from './cue-game-panel.module.css';

type Reward = { id: number; xp: number; levelUp: boolean; defeated: boolean };
const enemies = ['陨晶守卫', '虚空猎手', '星环巨兽'];

export default function CueGamePanel({ reviews, animations = true }: { reviews: CueReview[]; animations?: boolean }) {
  const progress = useMemo(() => cueGameProgress(reviews), [reviews]);
  const { xp, level, defeats } = progress;
  const previous = useRef({ xp, level, defeats });
  const [reward, setReward] = useState<Reward | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = { xp, level, defeats };
    if (xp <= before.xp) return;
    // Restoring a session never replays its rewards. Only new reviews animate.
    const next = { id: xp, xp: xp - before.xp, levelUp: level > before.level, defeated: defeats > before.defeats };
    let active = true;
    queueMicrotask(() => { if (active) setReward(next); });
    const timer = window.setTimeout(() => setReward(null), next.levelUp ? 1800 : 1000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [xp, level, defeats]);
  const enemy = enemies[progress.defeats % enemies.length];
  const remaining = CUE_ENEMY_HITS - progress.enemyHits;
  return <section className={styles.panel} data-cue-game data-motion={animations} style={{ '--ship-color': progress.ship.color } as CSSProperties} aria-label="CUE 宇宙冒险">
    <div className={styles.top}>
      <div className={styles.identity}><span className={styles.level}>Lv.<strong>{progress.level}</strong></span><div><span className={styles.eyebrow}>STAR VOYAGER</span><h2>{progress.ship.name}</h2></div></div>
      <button type="button" className={styles.collectionButton} onClick={() => setCollectionOpen((open) => !open)} aria-expanded={collectionOpen}>舰队 {progress.unlocked.length} / {CUE_GAME_UNLOCKS.length}<span aria-hidden="true"> ↗</span></button>
    </div>
    <div className={styles.xpRow}><span>等级经验</span><strong>{progress.levelXp} <span>/ {CUE_LEVEL_XP} XP</span></strong></div>
    <div className={styles.xpTrack} role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={CUE_LEVEL_XP} aria-valuenow={progress.levelXp}><div style={{ width: `${progress.levelXp}%` }} /></div>
    <div className={styles.arena} data-hit={reward ? 'true' : 'false'}>
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.ship} aria-hidden="true"><svg viewBox="0 0 140 100"><defs><linearGradient id="cue-ship-hull" x2="1" y2="1"><stop stopColor="#f8fafc" /><stop offset="1" stopColor="#64748b" /></linearGradient></defs><path className={styles.exhaust} d="M24 40 L0 50 L24 60Z" fill="var(--ship-color)" /><path d="M20 34 L78 13 L119 50 L78 87 L20 66 L42 50Z" fill="url(#cue-ship-hull)" stroke="#e2e8f0" strokeWidth="1.5" /><path d="M45 37 L80 25 L106 50 L80 75 L45 63 L66 50Z" fill="#111b35" /><path d="M74 37 L94 50 L74 63 L64 50Z" fill="var(--ship-color)" /><path d="M26 34 L58 7 L71 20 M26 66 L58 93 L71 80" fill="none" stroke="var(--ship-color)" strokeWidth={progress.level >= 3 ? 6 : 3} />{progress.level >= 5 && <path d="M40 27 L28 10 L76 15 M40 73 L28 90 L76 85" fill="none" stroke="var(--ship-color)" strokeWidth="3" />}</svg></div>
      {reward && <div key={reward.id} className={styles.attack} aria-hidden="true"><span className={styles.beam} /><span className={styles.impact} /><span className={styles.damage}>−{reward.xp}</span><span className={styles.xpGain}>+{reward.xp} XP</span></div>}
      <div className={styles.enemy} key={progress.defeats} aria-hidden="true"><svg viewBox="0 0 120 120"><path d="M60 4 L85 20 L110 40 L102 78 L83 108 L47 114 L16 89 L6 55 L28 21Z" fill="#30264c" stroke="#b9a2e4" strokeWidth="2" /><path d="M60 4 L69 45 L110 40 M69 45 L102 78 M69 45 L47 114 M69 45 L28 21 M47 114 L39 61 L6 55" fill="none" stroke="#6d588c" strokeWidth="2" /><path d="M31 50 L49 56 L43 65 L27 60 M89 50 L71 56 L77 65 L93 60" fill="#fb7185" /><path d="M44 83 L60 74 L76 83" fill="none" stroke="#fb7185" strokeWidth="3" /></svg><span className={styles.enemyHalo} /></div>
      <div className={styles.enemyInfo}><span>{enemy} · 第 {progress.defeats + 1} 战</span><div role="progressbar" aria-label="敌人生命" aria-valuemin={0} aria-valuemax={CUE_ENEMY_HITS} aria-valuenow={remaining}><div style={{ width: `${remaining / CUE_ENEMY_HITS * 100}%` }} /></div><small>再完成 {remaining} 条即可击败</small></div>
      {reward?.defeated && !reward.levelUp && <div key={`defeat-${reward.id}`} className={styles.victory} aria-hidden="true">✦ 敌人已击败 · 下一战</div>}
      {reward?.levelUp && <div key={`level-${reward.id}`} className={styles.levelUp} aria-hidden="true"><span>LEVEL UP</span><strong>Lv. {progress.level}</strong><small>{progress.ship.name}</small></div>}
    </div>
    <div className={styles.bottom}><span>今日 <strong>{progress.todayCount}</strong> 条 · 击败 <strong>{progress.defeats}</strong> 只</span><span>{progress.nextUnlock ? `Lv.${progress.nextUnlock.level} 解锁 ${progress.nextUnlock.name}` : '全部舰船已解锁'}</span></div>
    <p className={styles.rule}>每条每日首次复习 +{CUE_GAME_XP} XP · √ / △ / ○ 奖励相同</p>
    <span className={styles.srOnly} role="status" aria-live="polite">{reward ? `获得 ${reward.xp} 经验${reward.defeated ? '，敌人已击败' : ''}${reward.levelUp ? `，升级到 ${progress.level} 级` : ''}` : ''}</span>
    {collectionOpen && <div className={styles.collection}>{CUE_GAME_UNLOCKS.map((ship) => <div key={ship.level} data-unlocked={ship.level <= progress.level}><span aria-hidden="true" style={{ color: ship.color }}>✦</span><strong>{ship.name}</strong><small>{ship.level <= progress.level ? '已解锁' : `Lv.${ship.level} 解锁`}</small></div>)}<p>等级代表复习投入；已有复习记录也计入经验。关闭冒险后，复习记录仍保留。</p></div>}
  </section>;
}
