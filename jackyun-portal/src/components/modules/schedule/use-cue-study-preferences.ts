'use client';

import { useSyncExternalStore } from 'react';
import { cueStudyPreferences } from '@/lib/learning/cue-game';

export const CUE_PREFERENCES_KEY = 'jackyun_settings_learning_preferences';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('jackyun-learning-preferences', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('jackyun-learning-preferences', callback);
  };
}
function snapshot() {
  try { return localStorage.getItem(CUE_PREFERENCES_KEY); } catch { return null; }
}
export function useCueStudyPreferences() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  try { return cueStudyPreferences(raw ? JSON.parse(raw) : null); }
  catch { return cueStudyPreferences(null); }
}

function motionSnapshot() {
  return document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function motionSubscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
  media.addEventListener('change', callback);
  return () => { observer.disconnect(); media.removeEventListener('change', callback); };
}
export function useCueReducedMotion() {
  return useSyncExternalStore(motionSubscribe, motionSnapshot, () => false);
}

function desktopSnapshot() { return window.matchMedia('(min-width: 1024px)').matches; }
function desktopSubscribe(callback: () => void) {
  const media = window.matchMedia('(min-width: 1024px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function useCueUniverseEnabled() {
  const { cueGameEnabled } = useCueStudyPreferences();
  const desktop = useSyncExternalStore(desktopSubscribe, desktopSnapshot, () => false);
  return cueGameEnabled && desktop;
}
