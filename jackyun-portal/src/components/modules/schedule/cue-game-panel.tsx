'use client';

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cueGameProgress, cueStarAlbum, cueStarPosition, cueStarWeek, cueConstellations, CUE_STAR_COLORS, CUE_LEVEL_XP, type CueStar, type CueStarFeedback } from '@/lib/learning/cue-game';
import { dateKey, type CueReview, type StudyCue, type LearningRecord } from '@/lib/learning/schedule-control';
import CueStarShop from './cue-star-shop';
import CueSkyViewer from './cue-sky-viewer';
import { reconcileCueGameAccount, cueShopBalance, cueEquippedValue, cueEquippedItems, cueEffectVariant, type CueGameAccount, type CueShopAction } from '@/lib/learning/cue-shop';
import CueUniverseBackdrop from './cue-universe-backdrop';
import { useCueReducedMotion, useCueStudyPreferences } from './use-cue-study-preferences';
import styles from './cue-game-panel.module.css';
import studyLayout from './cue-study-layout.module.css';
import { workspaceStorage } from '@/lib/sync/repository';
import { useWorkspaceLayout } from '@/hooks/use-workspace-layout';

export function CueStarSky({ stars, highlight }: { stars: CueStar[]; highlight?: string }) {
  const nebulaId = useId();
  return <svg className={styles.sky} viewBox="0 0 200 150" role="img" aria-label={`已点亮 ${stars.length} 颗星的学习星空`}>
    <defs><radialGradient id={nebulaId}><stop stopColor="#6877ab" stopOpacity=".25" /><stop offset="1" stopColor="#101727" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="104" cy="78" rx="92" ry="60" fill={`url(#${nebulaId})`} />
    {cueConstellations(stars).map((group) => <polyline key={group[0].id} points={group.map((star) => { const point = cueStarPosition(star.id); return `${point.x},${point.y}`; }).join(' ')} fill="none" stroke="#95b5e2" strokeOpacity=".18" strokeWidth=".6" />)}
    {stars.map((star) => { const point = cueStarPosition(star.id); return <g key={star.id} className={highlight === star.cueId ? styles.newStar : undefined} style={{ '--star-color': CUE_STAR_COLORS[star.status] } as CSSProperties}><circle cx={point.x} cy={point.y} r="6" fill={CUE_STAR_COLORS[star.status]} opacity=".08" /><circle cx={point.x} cy={point.y} r="1.2" fill={CUE_STAR_COLORS[star.status]} /><title>{star.subjectName} · {star.day} · {star.status === 'stable' ? '√' : star.status === 'partial' ? '△' : '○'}</title></g>; })}
    {!stars.length && <text x="100" y="78" textAnchor="middle" fill="#91a2bb" fontSize="9">今天的第一颗星，等你点亮</text>}
  </svg>;
}

const emptyCues: StudyCue[] = [];
const emptyRecords: LearningRecord[] = [];
function CueGamePanel({ reviews, cues = emptyCues, records = emptyRecords, animations: requestedAnimations = true, feedback, summary = false, initialAlbumOpen = false, onDismiss, account: savedAccount, onShopAction, sessionKey, sessionStartedAt, sessionCount, compact = false }: { account?: CueGameAccount; onShopAction?: (action: CueShopAction) => void; sessionKey?: string; sessionStartedAt?: string; sessionCount?: number; compact?: boolean; reviews: CueReview[]; cues?: StudyCue[]; records?: LearningRecord[]; animations?: boolean; feedback?: CueStarFeedback; summary?: boolean; initialAlbumOpen?: boolean; onDismiss?: () => void }) {
  const layout = useWorkspaceLayout();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { queueMicrotask(() => setCollapsed(workspaceStorage.getItem('jackyun_settings_cue_game_collapsed') === 'true')); }, []);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    workspaceStorage.setItem('jackyun_settings_cue_game_collapsed', String(next));
  };
  const reducedMotion = useCueReducedMotion();
  const { cueItemMotion, cueCelebrationMotion, cueAmbientMotion } = useCueStudyPreferences();
  const animations = requestedAnimations && !reducedMotion && cueItemMotion;
  const celebrationAnimations = animations && cueCelebrationMotion;
  const ambientAnimations = requestedAnimations && !reducedMotion && cueAmbientMotion;
  const account = useMemo(() => reconcileCueGameAccount(savedAccount, reviews), [savedAccount, reviews]);
  const balance = cueShopBalance(account);
  const [shopOpen,setShopOpen] = useState(false);
  const [skyDay,setSkyDay] = useState<string>();
  const closeSky=useCallback(()=>setSkyDay(undefined),[]);
  const [resultMessage, setResultMessage] = useState('');
  const [receipt,setReceipt]=useState<{stars:number;extra:number;xp:number}>();
  const credited=useRef(new Set(account.earnings.map(entry=>entry.id)));
  const sessionExtra=account.earnings.filter(entry=>entry.extra&&entry.sessionKey===sessionKey&&(!sessionStartedAt||entry.at>=sessionStartedAt)).reduce((sum,entry)=>sum+entry.stars,0);
  const theme=cueEquippedValue(account,'theme') as string | undefined;
  const titles = cueEquippedItems(account, 'title');
  const frames = cueEquippedItems(account, 'frame');
  const frameLayers = <span className={styles.frameLayers} aria-hidden="true">{frames.map((item, index) => <i key={item.id} data-cue-frame={item.value} style={{ '--frame-inset': `${3 + index * 4}px` } as CSSProperties} />)}</span>;
  useEffect(()=>{
    const added=account.earnings.filter(entry=>!credited.current.has(entry.id));
    credited.current=new Set(account.earnings.map(entry=>entry.id));
    if(!added.length||summary) return;
    const gain={stars:added.filter(entry=>!entry.extra).reduce((sum,entry)=>sum+entry.stars,0),extra:added.filter(entry=>entry.extra).reduce((sum,entry)=>sum+entry.stars,0),xp:added.reduce((sum,entry)=>sum+entry.xp,0)};
    if(gain.stars+gain.extra>0) queueMicrotask(()=>setReceipt(previous=>({stars:(previous?.stars??0)+gain.stars,extra:(previous?.extra??0)+gain.extra,xp:(previous?.xp??0)+gain.xp})));
  },[account,summary]);
  useEffect(()=>{
    if (!receipt) return;
    const timeout = setTimeout(() => setReceipt(undefined), 5000);
    return () => clearTimeout(timeout);
  },[receipt]);
  const progress = useMemo(() => cueGameProgress(reviews), [reviews]);
  const stars = useMemo(() => cueStarAlbum(reviews, cues, records), [reviews, cues, records]);
  const today = dateKey(new Date());
  const todayStars = useMemo(() => stars.filter((star) => star.day === today), [stars, today]);
  const previous = useRef({ level: balance.level, effort: progress.todayEffortCount });
  const handled = useRef(feedback?.id);
  const albumButton = useRef<HTMLButtonElement>(null);
  const closeAlbum = () => { setAlbumOpen(false); queueMicrotask(() => albumButton.current?.focus()); };
  const [accent, setAccent] = useState<{ id: number; variant?: number }>();
  const [albumOpen, setAlbumOpen] = useState(initialAlbumOpen);
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  useEffect(() => {
    const before = previous.current;
    previous.current = { level: balance.level, effort: progress.todayEffortCount };
    if (!feedback || handled.current === feedback.id) return;
    handled.current = feedback.id;
    const effort = progress.todayEffortCount;
    const milestone = Math.floor(effort / 4) > Math.floor(before.effort / 4);
    const variant = milestone ? cueEffectVariant(account, effort) : undefined;
    const message = balance.level > before.level ? `升级至 Lv.${balance.level}` : '已保存';
    queueMicrotask(() => {
      setResultMessage(message);
      setAccent({ id: feedback.id, variant });
    });
  }, [account, feedback, balance.level, progress.todayEffortCount]);
  const { groups, subjects, albumDays } = useMemo(() => {
    const groups = new Map<string, CueStar[]>();
    const subjects = new Map<string, string>();
    const days = new Set<string>();
    for (const star of stars) {
      subjects.set(star.subjectId, star.subjectName);
      days.add(star.day);
      if (!albumOpen || (subject && star.subjectId !== subject)) continue;
      const key = period === 'week' ? cueStarWeek(star.day) : star.day;
      const group = groups.get(key);
      if (group) group.push(star); else groups.set(key, [star]);
    }
    return { groups, subjects: [...subjects], albumDays: days.size };
  }, [stars, subject, period, albumOpen]);
  const starCount = sessionCount ?? progress.todayCount;
  const xp = balance.earnedXP % CUE_LEVEL_XP;

  useEffect(() => {
    if (!resultMessage || summary) return;
    const timeout = setTimeout(() => setResultMessage(''), 5000);
    return () => clearTimeout(timeout);
  }, [resultMessage, feedback?.id, summary]);
  const variant = celebrationAnimations ? accent?.variant : undefined;
  return <>
    {!summary && <CueUniverseBackdrop quiet theme={theme} stars={todayStars} animations={ambientAnimations} />}
    <aside data-feature="star-results" data-frame={cueEquippedValue(account, 'frame')} className={styles.dock} data-cue-game data-collapsed={!summary && collapsed} data-motion={animations} data-summary={summary} aria-label="CUE 星空侧栏">
    {variant !== undefined && resultMessage && <span key={accent?.id} className={styles.milestoneAccent} data-cue-practice-burst data-variant={variant} style={{ '--accent-hue': variant * 37 + 210 } as CSSProperties} aria-hidden="true" />}
    {!summary && collapsed && <div className={styles.actions}>
      <button type="button" className={styles.collapseButton} onClick={toggleCollapsed} aria-expanded={false} aria-label="展开游戏侧栏">✦ 星空</button>
      {onShopAction && <button type="button" className={styles.collapseButton} onClick={() => setShopOpen(true)}>商店与装配</button>}
    </div>}
    {!summary && collapsed && (titles.length > 0 || frames.length > 0) && <div className={styles.collapsedLoadout} data-cue-collapsed-loadout>{frameLayers}{titles.map(item => <span key={item.id} data-cue-title={item.id}>{item.name}</span>)}</div>}
    <details hidden={!summary && collapsed} data-cue-game-compact={compact} open={!compact || layout === 'desktop' ? true : undefined} className={studyLayout.game}>
      <summary><span>✦ {starCount} 颗星 · Lv.{balance.level}</span><span>星空详情</span></summary>
      <div className={styles.panel}>{frameLayers}
      <div className={styles.top}>
        <h2>{summary ? '今日星空' : sessionCount !== undefined ? '本次星空' : '今日星空'}</h2>
        {onDismiss ? <button type="button" onClick={onDismiss} aria-label="收起学习成果">×</button>
          : !summary && <button type="button" onClick={toggleCollapsed} aria-expanded={true} aria-label="隐藏游戏侧栏">−</button>}
      </div>
      <div className={styles.count}>
        <strong><span key={accent?.id} className={`${styles.starIcon} ${animations && resultMessage ? styles.starPulse : ''}`} aria-hidden="true">✦</span>{starCount} 颗星</strong>
        <span>Lv.{balance.level}</span>
      </div>
      {summary && <CueStarSky stars={todayStars} />}
      <div className={styles.actions}>
        <button type="button" ref={albumButton} className={styles.albumButton} onClick={() => setAlbumOpen(true)}>收藏</button>
        {onShopAction && <button type="button" className={styles.albumButton} onClick={() => setShopOpen(true)} aria-label="商店与装配">商店</button>}
      </div>
      <details className={styles.stats}>
        <summary>进度与积分</summary>
        <div className={styles.statLine}><span>等级经验</span><span>{xp} / {CUE_LEVEL_XP} XP</span></div>
        <progress aria-label="等级经验" value={xp} max={CUE_LEVEL_XP} />
        <div className={styles.statLine}><span>本轮星座</span><span>{Math.floor(starCount / 5)} 组 · {starCount % 5}/5</span></div>
        <div className={styles.statLine}><span>星空点</span><span>{balance.stars}{sessionExtra > 0 ? ` · 本轮额外 +${sessionExtra}` : ''}</span></div>
        <div className={styles.statLine}><span>星空收藏</span><span>{albumDays} 天</span></div>
        <div className={styles.ship}>{titles.length ? titles.map(item => <span key={item.id} data-cue-title={item.id}>{item.name}</span>) : progress.ship.name}</div>
      </details>
      <div className={styles.feedback} role="status">
        {(resultMessage || (summary && !initialAlbumOpen && starCount > 0)) && <span data-cue-result-feedback>{resultMessage || '成果已保存'}</span>}
        {receipt && <span data-cue-star-receipt className={styles.receipt}>✦ +{receipt.stars + receipt.extra} 星空点{receipt.extra > 0 ? ` · 额外 +${receipt.extra}` : ''}</span>}
      </div>
    </div></details>
    {albumOpen && typeof document !== 'undefined' && createPortal(<div className={styles.album} role="dialog" aria-modal="true" aria-label="星空收藏册" tabIndex={-1} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') closeAlbum();
      if (event.key === 'Tab') {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, select')];
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    }}>
      <div className={styles.albumHeader}><div><span className={styles.eyebrow}>YOUR CONSTELLATIONS</span><h2>星空收藏册</h2></div><button type="button" autoFocus onClick={closeAlbum}>关闭收藏</button></div>
      <div className={styles.filters}><label>时间视图<select value={period} onChange={(event) => setPeriod(event.target.value as 'day' | 'week')}><option value="day">每天</option><option value="week">每周</option></select></label><label>学科<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">全部学科</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
      <p className={styles.albumNote}>复习记录生成的真实成果 · √ / △ / ○ 同样计入 · 随学习记录同步</p>
      <div className={styles.pages}>{[...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, items]) => <article key={day}><div><strong>{period === 'week' ? `${day} 起的一周` : day}</strong><span>{items.length} 颗星</span></div><button type="button" className={styles.dayView} aria-label={`查看 ${day} 星空`} onClick={()=>setSkyDay(period==='day'?day:items[0].day)}><CueStarSky stars={items} /></button>{period==='week'&&<div>{[...new Set(items.map(star=>star.day))].sort().map(date=><button type="button" key={date} onClick={()=>setSkyDay(date)}>查看 {date}</button>)}</div>}<p>{[...new Set(items.map((star) => star.subjectName))].join(' · ')}</p></article>)}{!groups.size && <p>完成复习后，第一幅星空就会保存在这里。</p>}</div>
    </div>, document.body)}
  </aside>

  {shopOpen&&onShopAction&&<CueStarShop account={account} onAction={onShopAction} animations={animations} onClose={()=>setShopOpen(false)}/>}
  {skyDay&&<CueSkyViewer day={skyDay} stars={stars.filter(star=>star.day===skyDay)} animations={ambientAnimations} theme={theme} onClose={closeSky}/>}
  </>;
}

export default memo(CueGamePanel);
