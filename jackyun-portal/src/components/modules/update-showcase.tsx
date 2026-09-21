'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  UPDATE_CATEGORIES,
  UPDATE_HISTORY,
  type UpdateCategory,
  type UpdateEntry,
} from '@/lib/update-history';

type CategoryFilter = '全部' | UpdateCategory;

const accentStyles: Record<UpdateEntry['accent'], { glow: string; badge: string; dot: string }> = {
  blue: {
    glow: 'from-[#397dff]/24 via-[#397dff]/6 to-transparent',
    badge: 'border-[#639cff]/30 bg-[#397dff]/12 text-[#a9c9ff]',
    dot: 'bg-[#6da4ff] shadow-[0_0_24px_rgba(85,145,255,.72)]',
  },
  violet: {
    glow: 'from-[#8b5cf6]/22 via-[#8b5cf6]/5 to-transparent',
    badge: 'border-[#a985ff]/30 bg-[#8b5cf6]/12 text-[#cbb8ff]',
    dot: 'bg-[#a985ff] shadow-[0_0_24px_rgba(169,133,255,.65)]',
  },
  amber: {
    glow: 'from-[#e6a64c]/20 via-[#e6a64c]/5 to-transparent',
    badge: 'border-[#e6a64c]/30 bg-[#e6a64c]/10 text-[#f1c47f]',
    dot: 'bg-[#e8ac57] shadow-[0_0_24px_rgba(232,172,87,.58)]',
  },
  mint: {
    glow: 'from-[#48cba4]/20 via-[#48cba4]/5 to-transparent',
    badge: 'border-[#65d8b5]/30 bg-[#48cba4]/10 text-[#8ce7cb]',
    dot: 'bg-[#69d9b7] shadow-[0_0_24px_rgba(105,217,183,.56)]',
  },
};

export default function UpdateShowcase() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('全部');
  const current = UPDATE_HISTORY[0];
  const visibleEntries = activeCategory === '全部'
    ? UPDATE_HISTORY
    : UPDATE_HISTORY.filter((entry) => entry.categories.includes(activeCategory));

  return (
    <div className="relative -m-3 min-h-full overflow-hidden bg-[#050506] text-[#f5f5f7] sm:-m-6 lg:-m-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[18%] -top-32 h-[34rem] w-[34rem] rounded-full bg-[#225fff]/15 blur-[120px]" />
        <div className="absolute -left-[14%] top-[38rem] h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.65)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#070708]/75 px-5 py-3 backdrop-blur-2xl sm:px-9">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-[-0.02em]">
            <Image src="/jackyun-logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[10px]" />
            <span className="truncate">JackYun Updates</span>
          </Link>
          <div className="ml-auto hidden items-center gap-6 text-xs font-medium text-[#8f9099] sm:flex">
            <a href="#latest" className="transition-colors hover:text-white">最新版本</a>
            <a href="#history" className="transition-colors hover:text-white">更新记录</a>
          </div>
          <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-xs font-semibold transition hover:bg-white/[0.11]">
            Products <span className="material-icons-round text-sm">arrow_outward</span>
          </Link>
        </div>
      </nav>

      <main className="relative z-10">
        <section id="latest" className="mx-auto flex min-h-[min(780px,86vh)] max-w-6xl flex-col justify-center px-5 py-20 sm:px-9 sm:py-28">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e9099]">
            <span className="h-px w-8 bg-[#8e9099]" />
            Release notes
            <span className="rounded-full border border-[#6da4ff]/25 bg-[#397dff]/10 px-2.5 py-1 tracking-[0.08em] text-[#9fc2ff]">Latest · v{current.version}</span>
          </div>
          <h1 className="mt-8 max-w-5xl text-[clamp(3.4rem,8.4vw,7.8rem)] font-[750] leading-[0.9] tracking-[-0.075em]">
            每一次更新，<br />都更接近<span className="bg-gradient-to-r from-white via-[#aac7f7] to-[#817ef7] bg-clip-text text-transparent">理想的学习空间。</span>
          </h1>
          <p className="mt-8 max-w-2xl text-base leading-7 text-[#a0a1aa] sm:text-xl sm:leading-8">
            不只是新功能列表。这里记录 JackYun 如何把学习、阅读和专注打磨成更完整、更自然的日常体验。
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a href="#release-story" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#f5f5f7] px-5 text-sm font-bold text-[#111114] transition hover:-translate-y-0.5 hover:bg-white">
              查看本次更新 <span className="material-icons-round text-lg">south</span>
            </a>
            <span className="px-2 text-xs text-[#72747d]">{current.dateLabel} 发布</span>
          </div>
        </section>

        <section id="release-story" className="mx-auto max-w-6xl px-5 pb-28 sm:px-9 sm:pb-36">
          <article className="relative overflow-hidden rounded-[2rem] border border-white/[0.11] bg-[#0c0c0f] shadow-[0_50px_130px_rgba(0,0,0,.45)] sm:rounded-[2.6rem]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(58,113,255,.2),transparent_38%)]" />
            <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:p-16">
              <div>
                <p className="font-mono text-[11px] tracking-[0.18em] text-[#686a73]">CURRENT RELEASE / {current.version}</p>
                <h2 className="mt-7 text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">{current.title}</h2>
                <p className="mt-6 text-base leading-7 text-[#9698a1]">{current.summary}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {current.categories.map((category) => <span key={category} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs text-[#bbbcc4]">{category}</span>)}
                </div>
              </div>
              <div className="grid content-center gap-3">
                {current.highlights.map((highlight, index) => (
                  <div key={highlight} className="group flex gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-white/[0.15] hover:bg-white/[0.06] sm:p-5">
                    <span className="font-mono text-xs text-[#668ee8]">0{index + 1}</span>
                    <p className="text-sm leading-6 text-[#d5d6dc] sm:text-[15px]">{highlight}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section id="history" className="border-t border-white/[0.08] bg-[#080809]/88 px-5 py-24 sm:px-9 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <header className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#78a8ff]">Changelog archive</p>
              <h2 className="mt-4 text-5xl font-semibold tracking-[-0.06em] sm:text-7xl">一路走来的改变。</h2>
              <p className="mt-5 text-base leading-7 text-[#92949d] sm:text-lg">按主题筛选，查看每个版本真正改变了什么。</p>
            </header>

            <div className="mt-10 flex flex-wrap gap-2" aria-label="筛选更新记录">
              {(['全部', ...UPDATE_CATEGORIES] as CategoryFilter[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={activeCategory === category}
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${activeCategory === category ? 'border-white bg-white text-[#111114]' : 'border-white/[0.11] bg-white/[0.035] text-[#a7a9b1] hover:border-white/25 hover:text-white'}`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="relative mt-14">
              <div className="absolute bottom-0 left-[5px] top-0 w-px bg-gradient-to-b from-white/25 via-white/10 to-transparent sm:left-[11.55rem]" aria-hidden="true" />
              <div className="space-y-5">
                {visibleEntries.map((entry) => {
                  const accent = accentStyles[entry.accent];
                  return (
                    <article key={entry.version} className="relative grid pl-8 sm:grid-cols-[11rem_1fr] sm:pl-0">
                      <div className="hidden pr-8 pt-6 text-right sm:block">
                        <time dateTime={entry.date} className="text-xs text-[#777982]">{entry.dateLabel}</time>
                      </div>
                      <span className={`absolute left-0 top-7 h-[11px] w-[11px] rounded-full border-2 border-[#080809] sm:left-[11.25rem] ${accent.dot}`} aria-hidden="true" />
                      <div className="group relative overflow-hidden rounded-3xl border border-white/[0.09] bg-[#101012] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-white/[0.16] sm:p-7">
                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.glow} opacity-55 transition group-hover:opacity-90`} />
                        <div className="relative">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${accent.badge}`}>v{entry.version}</span>
                            {entry.featured && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">Latest</span>}
                            <time dateTime={entry.date} className="text-[11px] text-[#73757e] sm:hidden">{entry.dateLabel}</time>
                          </div>
                          <h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{entry.title}</h3>
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#94969f] sm:text-[15px]">{entry.summary}</p>
                          <ul className="mt-6 grid gap-3 border-t border-white/[0.08] pt-5 md:grid-cols-2">
                            {entry.highlights.map((highlight) => (
                              <li key={highlight} className="flex gap-2.5 text-sm leading-6 text-[#c2c3ca]">
                                <span className="material-icons-round mt-1 text-[14px] text-[#747780]">arrow_forward</span>
                                <span>{highlight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.08] bg-[#080809] px-5 py-8 text-xs text-[#6f717a] sm:px-9">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>JackYun Portal · Built to keep getting better.</span>
          <div className="flex gap-5"><Link href="/dashboard" className="hover:text-white">返回主页</Link><Link href="/settings" className="hover:text-white">设置</Link></div>
        </div>
      </footer>
    </div>
  );
}
