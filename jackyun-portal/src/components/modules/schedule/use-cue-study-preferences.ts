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
