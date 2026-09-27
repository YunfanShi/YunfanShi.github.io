/** Coalesce manual retries during a running sync without overlapping network work. */
export function createSyncRunGate() {
  let running = false;
  const waiters: (() => void)[] = [];
  let manualQueued = false;
  return {
    async waitForIdle() {
      while (running) await new Promise<void>((resolve) => waiters.push(resolve));
    },
    begin(manual: boolean): boolean {
      if (running) {
        manualQueued ||= manual;
        return false;
      }
      running = true;
      return true;
    },
    finish(): boolean {
      running = false;
      waiters.splice(0).forEach((resolve) => resolve());
      const queued = manualQueued;
      manualQueued = false;
      return queued;
    },
  };
}
