import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceReviewSnapshot, reviewCompletion } from '../src/lib/learning/review-queue.ts';
import { fetchReviewSnapshot } from '../src/lib/review-snapshot-server.ts';
import { evidenceInRange, type StudyEvidence } from '../src/lib/learning/study-insights.ts';
import type { ReviewItem, ReviewSnapshot } from '../src/types/review.ts';

const at = new Date('2026-10-12T04:00:00Z');
const item = (id: string): ReviewItem => ({ id, user_id: 'owner', quiz_question_id: null, subject: '数学', question_text: id, question_type: 'essay', options: null, correct_answer: '答案', last_user_answer: null, explanation: null, knowledge_point: null, error_type: 'unknown', status: 'active', next_review_at: at.toISOString(), interval_days: 1, ease_factor: 2.5, streak: 0, created_at: at.toISOString(), updated_at: at.toISOString() });
function mockDatabase(rows: ReviewItem[], failed = false) {
  const calls: Array<{ user?: string; cutoff?: string; head?: boolean; orders: string[] }> = [];
  return { calls, client: { from: () => {
    const call = { orders: [] as string[] } as typeof calls[number]; calls.push(call); let status = 'active'; let limit = rows.length;
    const q = { select: (_: string, options?: { head?: boolean }) => { call.head = options?.head; return q; },
      eq: (key: string, value: string) => { if (key === 'user_id') call.user = value; if (key === 'status') status = value; return q; },
      lte: (_: string, value: string) => { call.cutoff = value; return q; }, order: (key: string) => { call.orders.push(key); return q; }, limit: (n: number) => { limit = n; return q; },
      then: (resolve: (value: unknown) => void) => { const filtered = rows.filter(row => row.user_id === call.user && row.status === status && (!call.cutoff || row.next_review_at <= call.cutoff)); resolve({ error: failed ? { message: 'network' } : null, data: call.head ? null : filtered.slice(0, limit), count: filtered.length }); },
    }; return q;
  } } as unknown as Parameters<typeof fetchReviewSnapshot>[0] };
}
for (const size of [0, 50, 51, 120]) test(`review total ${size} stays distinct from 50-item batches and completes only after a fresh read`, async () => {
  const rows = Array.from({ length: size }, (_, i) => item(String(i)));
  rows.push({ ...item('other-user'), user_id: 'stranger' });
  const db = mockDatabase(rows);
  let snapshot = await fetchReviewSnapshot(db.client, 'owner', at.toISOString());
  assert.equal(snapshot.dueCount, size); assert.equal(snapshot.dueItems.length, Math.min(50, size));
  let batches = 0;
  while (snapshot.dueItems.length) {
    for (const row of [...snapshot.dueItems]) { snapshot = advanceReviewSnapshot(snapshot, row, null, false, at); rows.find(x => x.id === row.id)!.status = 'archived'; }
    assert.notEqual(reviewCompletion(snapshot, at), 'complete'); batches++;
    snapshot = await fetchReviewSnapshot(db.client, 'owner', at.toISOString());
  }
  assert.equal(reviewCompletion(snapshot, at), 'complete'); assert.equal(batches, Math.ceil(size / 50));
  assert.ok(db.calls.every(call => call.user === 'owner'));
  assert.ok(db.calls.filter(call => !call.head).every(call => call.orders.join() === 'next_review_at,id'));
});
test('offline batches and incomplete legacy snapshots never claim cloud completion', () => {
  const row = item('one'); const initial: ReviewSnapshot = { dueItems: [row], dueCount: 1, activeCount: 1, masteredCount: 0, verifiedAt: at.toISOString() };
  const pending = advanceReviewSnapshot(initial, row, null, true, at);
  assert.equal(pending.activeCount, 0); assert.equal(pending.pendingLocal, true); assert.equal(reviewCompletion(pending, at), 'verify');
  assert.equal(reviewCompletion({ ...pending, pendingLocal: false, dueCount: null }, at), 'verify');
});
test('review fetch failures reject and mastery adjusts both counts immediately', async () => {
  await assert.rejects(() => fetchReviewSnapshot(mockDatabase([], true).client, 'owner', at.toISOString()));
  const row = { ...item('one'), streak: 4, interval_days: 30 };
  const next = advanceReviewSnapshot({ dueItems: [row], dueCount: 1, activeCount: 1, masteredCount: 0 }, row, 5, false, at);
  assert.equal(next.masteredCount, 1); assert.equal(next.activeCount, 0);
});
test('7 and 30 day evidence boundaries use local dates and exclude future or invalid timestamps', () => {
  const evidence = ['2026-10-05T15:59:59Z', '2026-10-05T16:00:00Z', '2026-09-12T16:00:00Z', '2026-09-11T16:00:00Z', '2026-10-12T16:00:00Z', 'bad'].map(at => ({ at, subjectId: 'math', subject: '数学', unit: '函数', status: 'stable' as const })) as StudyEvidence[];
  assert.equal(evidenceInRange(evidence, '7', at).length, 1);
  assert.equal(evidenceInRange(evidence, '30', at).length, 3);
  assert.equal(evidenceInRange(evidence, 'all', at).length, 4);
});

test('yesterday completion must be verified again after the local date changes', () => { assert.equal(reviewCompletion({ dueItems: [], dueCount: 0, activeCount: 0, masteredCount: 0, verifiedAt: '2026-10-11T04:00:00Z' }, at), 'verify'); });
