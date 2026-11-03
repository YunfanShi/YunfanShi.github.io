const DB_NAME = 'jackyun-page-tab-locks-v1';
const LOCK_STORE = 'locks';
const LEASE_MS = 45_000;
const HEARTBEAT_MS = 15_000;

export type PageTabLockResult = { acquired: true; release: () => void } | { acquired: false };
type LockRow = { page: string; owner: string; expiresAt: number };

function openLockDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LOCK_STORE, { keyPath: 'page' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机页面占用状态无法读取。'));
    request.onblocked = () => reject(new Error('本机页面占用状态正在升级，请刷新后重试。'));
  });
}

function claimLease(page: string, owner: string): Promise<boolean> {
  return openLockDatabase().then((db) => new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(LOCK_STORE, 'readwrite');
    const store = tx.objectStore(LOCK_STORE);
    let claimed = false;
    const request = store.get(page);
    request.onsuccess = () => {
      const row = request.result as LockRow | undefined;
      if (!row || row.owner === owner || row.expiresAt <= Date.now()) {
        store.put({ page, owner, expiresAt: Date.now() + LEASE_MS } satisfies LockRow);
        claimed = true;
      }
    };
    tx.oncomplete = () => { db.close(); resolve(claimed); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('本机页面占用状态写入失败。')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('本机页面占用状态写入失败。')); };
  }));
}

function releaseLease(page: string, owner: string): void {
  void openLockDatabase().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCK_STORE, 'readwrite');
    const store = tx.objectStore(LOCK_STORE);
    const request = store.get(page);
    request.onsuccess = () => { if ((request.result as LockRow | undefined)?.owner === owner) store.delete(page); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  })).catch(() => {});
}

async function acquireLease(page: string, onLost?: () => void): Promise<PageTabLockResult> {
  const owner = crypto.randomUUID();
  if (!await claimLease(page, owner)) return { acquired: false };
  let released = false;
  let lost = false;
  const heartbeat = window.setInterval(() => {
    if (released || lost) return;
    void claimLease(page, owner).then((claimed) => {
      if (claimed || released || lost) return;
      lost = true;
      window.clearInterval(heartbeat);
      onLost?.();
    }).catch(() => {
      if (released || lost) return;
      lost = true;
      window.clearInterval(heartbeat);
      onLost?.();
    });
  }, HEARTBEAT_MS);
  return { acquired: true, release: () => {
    if (released) return;
    released = true;
    window.clearInterval(heartbeat);
    releaseLease(page, owner);
  } };
}

/** Browser locks provide crash-safe exclusivity; IndexedDB leases cover engines without Web Locks. */
export async function acquirePageTabLock(page: string, onLost?: () => void): Promise<PageTabLockResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    let settled = false;
    let releaseLock: (() => void) | undefined;
    const outcome = new Promise<PageTabLockResult>((resolve) => {
      try {
        void locks.request(`jackyun:page:${page}`, { mode: 'exclusive', ifAvailable: true }, (lock) => {
          if (!lock) {
            settled = true;
            resolve({ acquired: false });
            return;
          }
          let finish!: () => void;
          const held = new Promise<void>((done) => { finish = done; });
          releaseLock = finish;
          settled = true;
          resolve({ acquired: true, release: () => releaseLock?.() });
          return held;
        }).catch(() => {
          if (settled) onLost?.();
          else resolve({ acquired: false });
        });
      } catch {
        resolve({ acquired: false });
      }
    });
    const result = await outcome;
    // A lock request error can occur in a browser with a partial Web Locks implementation.
    if (result.acquired || (settled && !releaseLock)) return result;
  }
  return acquireLease(page, onLost);
}

let heldPage: { page: string; release: () => void } | undefined;
let transitions: Promise<boolean> = Promise.resolve(true);

/** Acquire the next route before releasing the current one; a denied route keeps the old page protected. */
export function switchPageTabLock(page: string, onLost?: () => void): Promise<boolean> {
  const transition = transitions.catch(() => false).then(async () => {
    if (heldPage?.page === page) return true;
    const next = await acquirePageTabLock(page, () => {
      if (heldPage?.page === page) heldPage = undefined;
      onLost?.();
    });
    if (!next.acquired) return false;
    const previous = heldPage;
    heldPage = { page, release: next.release };
    previous?.release();
    return true;
  });
  transitions = transition;
  return transition;
}

export function releasePageTabLock(): void {
  const previous = heldPage;
  heldPage = undefined;
  previous?.release();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', (event) => { if (!(event as PageTransitionEvent).persisted) releasePageTabLock(); });
}
