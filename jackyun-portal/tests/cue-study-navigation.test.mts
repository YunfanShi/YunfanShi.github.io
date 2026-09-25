import assert from 'node:assert/strict';
import test from 'node:test';
import { cueRatingDestination } from '../src/lib/schedule/cue-study-navigation.ts';

test('first rating stays for review; repeating the same rating advances', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(cueRatingDestination(ids, 0, {}, 'unclear'), null);
  assert.equal(cueRatingDestination(ids, 0, { a: 'unclear' }, 'unclear'), 1);
  assert.equal(cueRatingDestination(ids, 0, { a: 'unclear' }, 'partial'), null);
  assert.equal(cueRatingDestination(ids, 2, { a: 'unclear', c: 'stable' }, 'stable'), 1);
  assert.equal(cueRatingDestination(ids, 2, { a: 'unclear', b: 'partial', c: 'stable' }, 'stable'), 0);
  assert.equal(cueRatingDestination(['a'], 0, { a: 'stable' }, 'stable'), null);
});
