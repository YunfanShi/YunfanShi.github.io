/** Coalesce manual retries during a running sync without overlapping network work. */
export function createSyncRunGate() {
  let running = false;
  let manualQueued = false;
  return {
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
      const queued = manualQueued;
      manualQueued = false;
      return queued;
    },
  };
}
