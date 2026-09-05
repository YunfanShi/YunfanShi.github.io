import assert from 'node:assert/strict';
import test from 'node:test';
import { LEARNING_RESOURCES, RESOURCE_CATEGORIES } from '../src/lib/learning-resources.ts';

test('A Level uses one filter and shared exam sites appear in both course groups', () => {
  const categoryIds = RESOURCE_CATEGORIES.map(({ id }) => id);
  assert.equal(categoryIds.includes('alevel'), true);
  assert.equal(categoryIds.some((id) => id.startsWith('alevel-')), false);

  for (const name of ['ZNotes', 'Save My Exams', 'Physics & Maths Tutor', 'PapaCambridge', 'Dynamic Papers', 'exam-mate']) {
    const resource = LEARNING_RESOURCES.find((item) => item.name === name);
    assert.ok(resource, `${name} should be listed`);
    assert.deepEqual(resource.categories, ['igcse', 'alevel']);
  }
});

test('every learning resource belongs to at least one valid category and has a unique URL', () => {
  const validCategories = new Set(RESOURCE_CATEGORIES.map(({ id }) => id).filter((id) => id !== 'all'));
  const urls = new Set<string>();

  for (const resource of LEARNING_RESOURCES) {
    assert.ok(resource.categories.length > 0, `${resource.name} needs a category`);
    assert.equal(resource.categories.every((category) => validCategories.has(category)), true, `${resource.name} has an unknown category`);
    assert.equal(urls.has(resource.url), false, `${resource.name} duplicates ${resource.url}`);
    urls.add(resource.url);
  }
});
