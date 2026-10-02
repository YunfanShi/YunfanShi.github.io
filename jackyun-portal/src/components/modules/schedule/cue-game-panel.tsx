'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cueAnimationPlan, cueGameProgress, cueStarAlbum, cueStarPosition, cueStarWeek, cueConstellations, CUE_STAR_COLORS, CUE_LEVEL_XP, type CueStar, type CueStarFeedback, type CueAnimationSituation } from '@/lib/learning/cue-game';
import { dateKey, type CueReview, type StudyCue, type LearningRecord } from '@/lib/learning/schedule-control';
import styles from './cue-game-panel.module.css';

export function CueStarSky({ stars, highlight }: { stars: CueStar[]; highlight?: string }) {
  return <svg className={styles.sky} viewBox="0 0 200 150" role="img" aria-label={`已点亮 ${stars.length} 颗星的学习星空`}>
    <defs><radialGradient id="cue-star-nebula"><stop stopColor="#6877ab" stopOpacity=".25" /><stop offset="1" stopColor="#101727" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="104" cy="78" rx="92" ry="60" fill="url(#cue-star-nebula)" />
    {cueConstellations(stars).map((group) => <polyline key={group[0].id} points={group.map((star) => { const point = cueStarPosition(star.id); return `${point.x},${point.y}`; }).join(' ')} fill="none" stroke="#95b5e2" strokeOpacity=".45" strokeWidth=".6" />)}
    {stars.map((star) => { const point = cueStarPosition(star.id); return <g key={star.id} className={highlight === star.cueId ? styles.newStar : undefined} style={{ '--star-color': CUE_STAR_COLORS[star.status] } as CSSProperties}><circle cx={point.x} cy={point.y} r="4" fill={CUE_STAR_COLORS[star.status]} opacity=".12" /><circle cx={point.x} cy={point.y} r="1.7" fill={CUE_STAR_COLORS[star.status]} /><title>{star.subjectName} · {star.day} · {star.status === 'stable' ? '√' : star.status === 'partial' ? '△' : '○'}</title></g>; })}
    {!stars.length && <text x="100" y="78" textAnchor="middle" fill="#91a2bb" fontSize="9">今天的第一颗星，等你点亮</text>}
  </svg>;
}

type Celebration = { id: number; cueId: string; status: CueStarFeedback['status']; milestone: boolean; gained: number } & ReturnType<typeof cueAnimationPlan>;
const emptyCues: StudyCue[] = [];
const emptyRecords: LearningRecord[] = [];
export default function CueGamePanel({ reviews, cues = emptyCues, records = emptyRecords, animations = true, feedback, summary = false, initialAlbumOpen = false, onDismiss }: { reviews: CueReview[]; cues?: StudyCue[]; records?: LearningRecord[]; animations?: boolean; feedback?: CueStarFeedback; summary?: boolean; initialAlbumOpen?: boolean; onDismiss?: () => void }) {
  const progress = useMemo(() => cueGameProgress(reviews), [reviews]);
  const stars = useMemo(() => cueStarAlbum(reviews, cues, records), [reviews, cues, records]);
  const today = dateKey(new Date());
  const todayStars = stars.filter((star) => star.day === today);
  const previous = useRef({ xp: progress.xp, count: progress.todayCount, level: progress.level });
  const variants = useRef(new Map<CueAnimationSituation, number>());
  const handled = useRef<number | undefined>(feedback?.id);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const albumButton = useRef<HTMLButtonElement>(null);
  const closeAlbum = () => { setAlbumOpen(false); queueMicrotask(() => albumButton.current?.focus()); };
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [albumOpen, setAlbumOpen] = useState(initialAlbumOpen);
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  useEffect(() => {
    const before = previous.current;
    previous.current = { xp: progress.xp, count: progress.todayCount, level: progress.level };
    if (!feedback || handled.current === feedback.id) return;
    handled.current = feedback.id;
    const gained = Math.max(0, progress.xp - before.xp);
    const milestone = Math.floor(progress.todayCount / 5) > Math.floor(before.count / 5);
    const situation = progress.level > before.level ? 'level' : milestone ? 'constellation' : !gained ? 'updated' : feedback.status;
    const occurrence = variants.current.get(situation) ?? 0;
    variants.current.set(situation, occurrence + 1);
    const next = { ...feedback, gained, milestone, ...cueAnimationPlan(situation, occurrence) };
    if (timer.current) clearTimeout(timer.current);
    queueMicrotask(() => setCelebration(next));
    timer.current = setTimeout(() => setCelebration(null), next.duration);
  }, [feedback, progress.xp, progress.todayCount, progress.level]);
  useEffect(() => {
    if (!summary || initialAlbumOpen || !progress.todayCount) return;
    const next: Celebration = { id: -1, cueId: '', status: 'stable', gained: 0, milestone: true, ...cueAnimationPlan('finish', progress.todayCount) };
    queueMicrotask(() => setCelebration(next));
    timer.current = setTimeout(() => setCelebration(null), next.duration);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [summary, initialAlbumOpen, progress.todayCount]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const scopedStars = subject ? stars.filter((star) => star.subjectId === subject) : stars;
  const groups = new Map<string, CueStar[]>();
  for (const star of scopedStars) {
    const key = period === 'week' ? cueStarWeek(star.day) : star.day;
    groups.set(key, [...(groups.get(key) ?? []), star]);
  }
  const subjects = [...new Map(stars.map((star) => [star.subjectId, star.subjectName])).entries()];
  return <aside className={styles.dock} data-cue-game data-motion={animations} data-summary={summary} data-situation={celebration?.situation} data-variant={celebration?.variant} aria-label="CUE 星空侧栏" style={{ '--star-color': celebration ? CUE_STAR_COLORS[celebration.status] : '#a5b4fc' } as CSSProperties}>
    <div className={styles.panel} data-milestone={celebration?.milestone || undefined}>
      <div className={styles.top}><span className={styles.eyebrow}>STAR JOURNAL</span>{onDismiss && <button type="button" onClick={onDismiss} aria-label="收起学习成果">×</button>}</div>
      <h2>{summary ? `今天完成 ${progress.todayCount} 条` : '今日星空'}</h2>
      <div className={styles.count} key={`count-${progress.todayCount}`}><strong>{progress.todayCount}</strong><span>颗星已点亮</span></div>
      <div className={styles.skyFrame} key={`sky-${celebration?.id ?? 'rest'}`}><CueStarSky stars={todayStars} highlight={celebration?.cueId} />
        {celebration?.milestone && <svg className={styles.burst} viewBox="0 0 200 150" aria-hidden="true"><circle className={styles.halo} cx="100" cy="75" r="42" /><ellipse className={styles.orbit} cx="100" cy="75" rx="72" ry="30" /><path className={styles.crown} d="M100 28 L110 62 L145 75 L110 86 L100 122 L90 86 L55 75 L90 62 Z" />{Array.from({length: 12}, (_, i) => { const angle = i * Math.PI / 6; return <circle key={i} className={styles.spark} cx={100 + Math.cos(angle) * 60} cy={75 + Math.sin(angle) * 50} r={i % 3 === 0 ? 2 : 1} style={{ '--spark-delay': `${i * 25}ms` } as CSSProperties} />; })}</svg>}
      </div>
      <div className={styles.legend}><span style={{ color: CUE_STAR_COLORS.stable }}>√</span><span style={{ color: CUE_STAR_COLORS.partial }}>△</span><span style={{ color: CUE_STAR_COLORS.unclear }}>○</span><small>每种努力都留下一颗星</small></div>
      <div className={styles.xpRow}><span>Lv.{progress.level}</span><span>{progress.levelXp} / {CUE_LEVEL_XP} XP</span></div>
      <div className={styles.xpTrack} role="progressbar" aria-label="等级经验" aria-valuemin={0} aria-valuemax={CUE_LEVEL_XP} aria-valuenow={progress.levelXp}><div style={{ width: `${progress.levelXp}%` }} /></div>
      <p className={styles.ship}>{progress.ship.name}</p>
      <button type="button" ref={albumButton} className={styles.albumButton} onClick={() => setAlbumOpen(true)}>星空收藏 · {new Set(stars.map((star) => star.day)).size} 天</button>
      <p className={styles.rule}>每 5 条连接一组星座<br />记录保留，休息一天也不会消失</p>
      {celebration && <div key={`celebration-${celebration.id}`} className={styles.celebration} role="status"><span>{celebration.situation === 'finish' ? '✦ 今天的星光已珍藏' : celebration.situation === 'level' ? `✦ 升至 Lv.${progress.level}` : celebration.milestone ? '✦ 新星座已点亮' : celebration.gained ? `+${celebration.gained} XP · 星光已收下` : '评价已更新，星光保留'}</span><button type="button" onClick={() => setCelebration(null)}>跳过动画</button></div>}
    </div>
    {celebration && celebration.situation !== 'finish' && <div key={`flight-${celebration.id}`} className={`${styles.flight} ${styles[celebration.status]}`} aria-hidden="true"><span className={styles.cardGhost}>{celebration.status === 'stable' ? '√' : celebration.status === 'partial' ? '△' : '○'}</span><span className={styles.comet}>{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--dust-x': `${Math.cos(i * Math.PI / 3) * 18}px`, '--dust-y': `${Math.sin(i * Math.PI / 3) * 18}px`, '--spark-delay': `${i * 30}ms` } as CSSProperties} />)}</span></div>}
    {albumOpen && <div className={styles.album} role="dialog" aria-modal="true" aria-label="星空收藏册" tabIndex={-1} onKeyDown={(event) => {
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
      <div className={styles.pages}>{[...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, items]) => <article key={day}><div><strong>{period === 'week' ? `${day} 起的一周` : day}</strong><span>{items.length} 颗星</span></div><CueStarSky stars={items} /><p>{[...new Set(items.map((star) => star.subjectName))].join(' · ')}</p></article>)}{!groups.size && <p>完成复习后，第一幅星空就会保存在这里。</p>}</div>
    </div>}
  </aside>;
}
