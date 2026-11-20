import { cueReviewLevel, type StudyCue } from '@/lib/learning/schedule-control';

export default function CueReviewSchedule({ cue }: { cue: StudyCue }) {
  const level = cueReviewLevel(cue);
  return <span data-cue-review-level={level} aria-live="polite" className="inline-flex flex-wrap items-baseline gap-x-2 rounded-lg bg-black/5 px-2.5 py-1 text-xs dark:bg-white/10">
    <strong className="font-semibold">{level}</strong>
    {cue.nextReviewDate && level !== '待重新确认' && <span className="text-[var(--muted-foreground)]">下次 <time dateTime={cue.nextReviewDate}>{cue.nextReviewDate.slice(5)}</time></span>}
  </span>;
}
