'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAVIGATION_ITEMS, navigationIdFromPath } from '@/lib/navigation';
import { switchPageTabLock } from '@/lib/page-tab-lock';
import { getLocalMigrationProgress, initializeRepository, LOCAL_MIGRATION_PROGRESS_EVENT, type LocalMigrationProgress } from '@/lib/sync/repository';

type GuardState = { page: string; status: 'checking' | 'ready' | 'blocked' | 'error' };
type RepositoryState = { owner: string | null; status: 'checking' | 'ready' | 'error'; message?: string };

const PAGE_LABELS: Record<string, string> = {
  schedule: 'Schedule', 'study-plan': '学习计划', 'study-guide': 'StudyGuide',
  dashboard: '首页', settings: '设置', memory: '记忆', vocab: '词汇',
  quizwise: 'Quiz', 'answer-sheet': '答题卡', 'answer-sheet-sync': '答题卡同步',
};

function pageIdentity(pathname: string): string {
  return navigationIdFromPath(pathname) ?? `route:${pathname.replace(/\/+$/, '') || '/'}`;
}

export default function PageTabLockGuard({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const page = pageIdentity(pathname);
  const [retry, setRetry] = useState(0);
  const [guard, setGuard] = useState<GuardState>({ page: '', status: 'checking' });
  const [repository, setRepository] = useState<RepositoryState>({ owner: null, status: 'checking' });
  const [migrationProgress,setMigrationProgress]=useState<LocalMigrationProgress>(()=>getLocalMigrationProgress());

  useEffect(() => {
    let active = true;
    const onProgress=(event:Event)=>{if(active)setMigrationProgress((event as CustomEvent<LocalMigrationProgress>).detail);};
    window.addEventListener(LOCAL_MIGRATION_PROGRESS_EVENT,onProgress);
    const initialization=initializeRepository(userId);
    void initialization.then(() => {
      if (active) setRepository({ owner: userId, status: 'ready' });
    }).catch((error: unknown) => {
      if (active) setRepository({ owner: userId, status: 'error', message: error instanceof Error ? error.message : '本机旧数据迁移没有完成。' });
    });
    return () => { active = false;window.removeEventListener(LOCAL_MIGRATION_PROGRESS_EVENT,onProgress); };
  }, [userId, retry]);

  useEffect(() => {
    let active = true;
    void switchPageTabLock(page, () => {
      if (active) setGuard({ page, status: 'blocked' });
    }).then((acquired) => {
      if (active) setGuard({ page, status: acquired ? 'ready' : 'blocked' });
    }).catch(() => {
      if (active) setGuard({ page, status: 'error' });
    });
    return () => { active = false; };
  }, [page, retry]);

  const retryLock = useCallback(() => setRetry((value) => value + 1), []);
  const repositoryReady = repository.owner === userId && repository.status === 'ready';
  const repositoryError = repository.owner === userId && repository.status === 'error';
  if (repositoryReady && guard.page === page && guard.status === 'ready') return <>{children}</>;

  const title = PAGE_LABELS[page] ?? NAVIGATION_ITEMS.find((item) => item.id === page)?.labelKey ?? page;
  const unavailable = repositoryError || guard.page === page && guard.status === 'error';
  const pageBlocked = repositoryReady && guard.page === page && guard.status === 'blocked';
  const progressMaximum=Math.max(1,migrationProgress.total);
  const progressValue=Math.min(migrationProgress.completed,progressMaximum);
  const progressPercent=migrationProgress.phase==='complete'?100:Math.round(progressValue/progressMaximum*100);
  return <section role={unavailable ? 'alert' : 'status'} aria-live="polite" className="mx-auto flex min-h-[min(60vh,34rem)] w-full max-w-2xl items-center justify-center p-5">
    <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`material-icons-round mt-0.5 text-2xl ${unavailable ? 'text-red-600' : 'text-amber-600'}`}>{unavailable ? 'error_outline' : guard.status === 'checking' || guard.page !== page ? 'hourglass_top' : 'tab'}</span>
        <div>
          <h1 className="text-lg font-semibold">{repositoryError ? '旧数据迁移或本机存储初始化失败' : !repositoryReady ? '正在迁移并核验此设备的旧数据' : unavailable ? '无法确认页面占用状态' : guard.status === 'checking' || guard.page !== page ? '正在确认页面是否已打开' : '这个页面已在其他标签中打开'}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            {repositoryError
              ? `${repository.message ?? '本机旧数据迁移没有完成。'} 原有副本会保留；为防止覆盖，当前页面编辑器暂不加载。请修复存储问题后重试。`
              : !repositoryReady
                ? migrationProgress.phase==='error'
                  ? migrationProgress.message??'旧数据迁移失败，原有副本会保留。'
                  : `正在自动扫描旧存储并将偏好、草稿、配置和页面数据写入 IndexedDB：${migrationProgress.completed}/${migrationProgress.total} 项已核验。此期间可以等待迁移完成，页面编辑器会在验证后开放。`
                : unavailable
              ? '本机页面锁存储暂不可用。为避免两个页面同时修改同一份数据，当前页面内容已暂停加载，请稍后重试。'
              : guard.status === 'checking' || guard.page !== page
                ? '确认完成前，本页编辑器不会加载。'
                : `此设备的「${title}」页面已经在另一个标签中打开。请从左侧菜单进入其他页面；关闭另一个标签后，可以重试打开此页。`}
          </p>
          {!repositoryReady&&!repositoryError&&<div className="mt-4 space-y-1.5" aria-label="本机数据迁移进度">
            <div role="progressbar" aria-label="旧数据迁移进度" aria-valuemin={0} aria-valuemax={progressMaximum} aria-valuenow={progressValue} className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-200" style={{width:`${progressPercent}%`}} />
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">{migrationProgress.total?`${migrationProgress.completed} / ${migrationProgress.total} 项核验完成`:'正在检查旧数据'}</p>
          </div>}
        </div>
      </div>
      {(repositoryError || repositoryReady && guard.page === page && guard.status !== 'checking') && <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={retryLock} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">重试打开此页</button>
        {pageBlocked && <button type="button" onClick={() => router.push('/dashboard')} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold">打开首页</button>}
      </div>}
    </div>
  </section>;
}
