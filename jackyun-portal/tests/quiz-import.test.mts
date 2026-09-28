import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuizQuestions } from '../src/lib/quiz/question-import.ts';
import { explainAiError } from '../src/lib/ai-error.ts';

const question = { type: 'multiple_choice', questionText: 'Which number is even?', options: [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }], correctAnswer: 'B) Two', explanation: 'Two is divisible by two.' };

test('QuizWise imports the same questions format requested from AI', () => {
  const imported = parseQuizQuestions(`\`\`\`json\n${JSON.stringify({ questions: [question] })}\n\`\`\``);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].correctAnswer, 'B) Two');
  assert.equal(imported[0].needsGrading, false);
});

test('QuizWise rejects incomplete or unusable JSON before entering the quiz', () => {
  assert.throws(() => parseQuizQuestions('{"questions":[]}'), /questions/);
  assert.throws(() => parseQuizQuestions(JSON.stringify({ questions: [{ ...question, correctAnswer: '' }] })), /correctAnswer/);
  assert.throws(() => parseQuizQuestions(JSON.stringify({ questions: [{ ...question, options: null }] })), /至少两个选项/);
});

test('provider balance errors identify whether the platform or personal key owns the upstream account', () => {
  const upstream = '{"error":{"code":"insufficient_balance","message":"insufficient balance"}}';
  assert.match(explainAiError(402, upstream, 'cloud').reason, /平台连接的模型供应商/);
  assert.match(explainAiError(402, upstream, 'user').reason, /个人 API Key/);
});
