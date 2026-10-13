import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCues, cueHighlightParts } from '../src/lib/learning/cue-search.ts';
import type { StudyCue } from '../src/lib/learning/schedule-control.ts';
const cue = (id: string, values: Partial<StudyCue> = {}) => ({ id, subjectName: 'Physics', unit: 'Kinematics', subsection: '', prompt: 'Unknown', markingPoints: [], ...values } as StudyCue);
test('title subtitle answer and MS have priority regardless of original subject grouping', () => {
  const cues = [cue('ms', {markingPoints: ['change in velocity']}), cue('answer', {answer: 'velocity is a vector'}), cue('subtitle', {subtitle: 'recall velocity'}), cue('title', {prompt: 'Velocity'})];
  assert.deepEqual(searchCues(cues, 'velocity').hits.map(hit=>hit.cue.id), ['title', 'subtitle', 'answer', 'ms']);
});
test('whole Latin words and all query terms prevent unrelated keyword floods', () => {
  const cues = [cue('biomass', {prompt: 'Biomass production'}), cue('mass', {prompt: 'Mass'}), cue('mass-energy', {prompt: 'Mass energy'}), cue('energy', {answer: 'energy transfer'})];
  assert.deepEqual(searchCues(cues, 'mass').hits.map(hit=>hit.cue.id), ['mass', 'mass-energy']);
  assert.deepEqual(searchCues(cues, 'mass energy').hits.map(hit=>hit.cue.id), ['mass-energy']);
  assert.equal(searchCues(cues, 'mass velocity').hits.length, 0);
});
test('only empty direct results expand to locations, cross-field words and one-edit spelling', () => {
  const cues = [cue('direct', {prompt: 'Velocity'}), cue('place', {unit: 'Velocity'}), cue('typo', {prompt: 'Velocitty'})];
  assert.deepEqual(searchCues(cues, 'velocity').hits.map(hit=>hit.cue.id), ['direct']);
  const fallback = searchCues(cues.slice(1), 'velocity'); assert.equal(fallback.expanded, true); assert.deepEqual(fallback.hits.map(hit=>hit.cue.id), ['place', 'typo']);
  assert.equal(searchCues([cue('x', {prompt:'velocity',answer:'time'})], 'velocity time').hits.length, 1);
  assert.equal(searchCues(cues, 'zzzzzz').hits.length, 0);
});
test('Chinese punctuation and empty queries are supported; highlighting is literal safe text', () => {
  const cues = [cue('x', {prompt: '匀加速运动', markingPoints:['速度变化量／时间']})];
  assert.equal(searchCues(cues, '加速').hits.length, 1); assert.equal(searchCues(cues, '速度 时间').hits[0].field, 'ms');
  assert.equal(searchCues(cues, '  ').hits.length, 1);
  const parts=cueHighlightParts('Velocity <script>alert(1)</script>', ['velocity', '<script>']);
  assert.equal(parts.map(p=>p.text).join(''), 'Velocity <script>alert(1)</script>'); assert.equal(parts[0].hit, true);
});
test('expanded cross-field matches also retain title through MS priority', () => {
  const cues = [cue('ms', {markingPoints:['velocity'],unit:'time'}),cue('title',{prompt:'velocity',answer:'time'})];
  const result=searchCues(cues,'velocity time');assert.equal(result.expanded,true);assert.deepEqual(result.hits.map(hit=>hit.cue.id),['title','ms']);
});
