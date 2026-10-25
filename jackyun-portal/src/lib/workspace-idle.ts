import { workspaceStorage } from './sync/repository.ts';
export const IDLE_MINUTES_KEY = 'jackyun_workspace_idle_minutes';
export const IDLE_SETTINGS_EVENT = 'jackyun-workspace-idle-settings';
export const BEFORE_SLEEP_EVENT = 'jackyun-workspace-before-sleep';
export const LOCAL_SLEEP_SAVE_EVENT = 'jackyun-workspace-sleep-local-save';
export const WAKE_EVENT = 'jackyun-workspace-wake';
export type SleepRequest = { waitUntil: (job: Promise<unknown>) => void };
let sleeping = false;
export function isWorkspaceSleeping() { return sleeping; }
export function setWorkspaceSleeping(value: boolean) { sleeping = value; }
export function readIdleMinutes() {
  const value = workspaceStorage.getItem(IDLE_MINUTES_KEY);
  const minutes = value === null ? 30 : Number(value);
  return [0, 5, 15, 30, 60].includes(minutes) ? minutes : 30;
}

/** Activity during saving cancels sleep; failed local persistence never enters sleep. */
export function createIdleController(now: () => number, save: () => Promise<void>, onSleep: () => void, onWake: () => void) {
  let lastActivity = now();
  let saving = false;
  let asleep = false;
  let generation = 0;
  return {
    activity() {
      lastActivity = now();
      generation += 1;
      if (asleep) { asleep = false; onWake(); }
    },
    async check(minutes: number) {
      if (saving || asleep || minutes <= 0 || now() - lastActivity < minutes * 60_000) return;
      saving = true;
      const started = generation;
      try {
        await save();
        if (generation === started) { asleep = true; onSleep(); }
      } catch (error) {
        lastActivity = now();
        throw error;
      } finally { saving = false; }
    },
  };
}
