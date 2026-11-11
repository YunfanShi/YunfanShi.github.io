import { cueExamLabels, cueSourceLabel, type CueSourceFields } from '@/lib/learning/cue-source';

export default function CueSource({ cue }: { cue: CueSourceFields }) {
  const label = cueSourceLabel(cue);
  const url = typeof cue.sourceUrl === 'string' && /^https?:\/\//i.test(cue.sourceUrl) ? cue.sourceUrl : undefined;
  const exam = cue.examStatus && cueExamLabels[cue.examStatus];
  if (!label && !url && !exam && !cue.examHistory) return null;
  return <p data-cue-source className="break-words text-xs leading-5 text-[var(--muted-foreground)]">{(label || url) && <>来源：{label}{url && <> · <a href={url} target="_blank" rel="noopener noreferrer" className="underline">打开原始来源</a></>}</>}{(exam || cue.examHistory) && <span className="block">真题考查：{exam ?? '未标注'}{cue.examHistory ? ` · ${cue.examHistory}` : ''}</span>}</p>;
}
