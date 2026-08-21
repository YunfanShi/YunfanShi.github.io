'use client';

import { useEffect, useState } from 'react';
import styles from './techempire.module.css';

export default function TechEmpireExperience() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>('[data-tech-page]');
    if (!page) return;
    let frame = 0;
    const updateScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        page.style.setProperty('--scroll-progress', String(Math.min(1, window.scrollY / max)));
        page.style.setProperty('--orb-shift', `${Math.min(90, window.scrollY * 0.08)}px`);
        setShowTop(window.scrollY > window.innerHeight * 0.8);
      });
    };
    const updatePointer = (event: PointerEvent) => {
      page.style.setProperty('--pointer-x', `${event.clientX}px`);
      page.style.setProperty('--pointer-y', `${event.clientY}px`);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.setAttribute('data-entered', 'true');
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    page.querySelectorAll('[data-tech-section]').forEach((section) => observer.observe(section));
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    updateScroll();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', updatePointer);
    };
  }, []);

  return <>
    <div className={styles.scrollProgress} aria-hidden="true" />
    <button type="button" aria-label="返回页面顶部" className={`${styles.backToTop} ${showTop ? styles.backToTopVisible : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
  </>;
}
