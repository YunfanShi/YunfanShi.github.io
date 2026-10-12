import assert from 'node:assert/strict';
import test from 'node:test';
import { classCountdown, classTimeline, type TimelineSession } from '../src/lib/learning/class-timeline.ts';
const date = '2026-10-12';
const lesson = (start: string, end: string): TimelineSession => ({ day: 1, start, end, course: { id: start, name: '数学', color: '#4285f4', review: true, sessions: [] } });
const lessons = [lesson('09:00', '09:45'), lesson('10:00', '10:40')];
const at = (time: string) => new Date(`${date}T${time}`);
test('class boundaries, remaining seconds and progress reflect the actual clock', () => {
  const before = classTimeline(lessons, date, at('08:59:59')); assert.equal(before.status, 'before'); assert.equal(before.remaining, 1);
  const start = classTimeline(lessons, date, at('09:00:00')); assert.equal(start.status, 'class'); assert.equal(start.remaining, 2700);
  const middle = classTimeline(lessons, date, at('09:22:30')); assert.equal(middle.progress, 50); assert.equal(middle.elapsedMinutes, 22);
  const last = classTimeline(lessons, date, at('09:44:59')); assert.equal(last.remaining, 1);
  const end = classTimeline(lessons, date, at('09:45:00')); assert.equal(end.status, 'break'); assert.equal(end.active, undefined); assert.equal(end.remaining, 900);
  assert.equal(classTimeline(lessons, date, at('10:00:00')).active?.session.start, '10:00');
  assert.equal(classTimeline(lessons, date, at('10:40:00')).status, 'finished');
});
test('other dates, midnight, empty schedules and invalid periods do not create live lessons', () => {
  assert.equal(classTimeline(lessons, '2026-10-11', at('09:10:00')).status, 'date');
  assert.equal(classTimeline(lessons, date, new Date('2026-10-13T00:00:00')).status, 'date');
  assert.equal(classTimeline([], date, at('09:10:00')).status, 'empty');
  assert.equal(classTimeline([lesson('25:00', '26:00'), lesson('09:00', '08:00')], date, at('09:00:00')).lessons.length, 0);
  assert.equal(classTimeline([lessons[1], lessons[0]], date, at('09:10:00')).active?.session.start, '09:00');
});
test('long lessons, adjacent periods and return after a suspended timer use clock time', () => {
  const adjacent = [lesson('09:00', '09:45'), lesson('09:45', '11:00')];
  const timeline = classTimeline(adjacent, date, at('09:45:00')); assert.equal(timeline.active?.session.start, '09:45'); assert.equal(timeline.remaining, 4500);
  assert.equal(classTimeline(adjacent, date, at('11:30:00')).status, 'finished');
  assert.equal(classCountdown(4500), '1:15:00'); assert.equal(classCountdown(59), '00:59'); assert.equal(classCountdown(-2), '00:00');
});
