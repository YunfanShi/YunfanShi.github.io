'use client';

import { AnalyzedQuestion, QuestionType } from '@/types/quiz';

/**
 * Attempt to repair broken JSON from AI responses.
 * Handles: unterminated strings, trailing commas, missing closing brackets.
 */
function repairJSON(raw: string): string {
  let text = raw.trim();

  // Remove markdown code fences
  if (text.startsWith('```')) {
    text = text.replace(/```(?:json)?\n?/g, '').trim();
  }

  // Try to find the outermost { ... }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  // Repair: unclosed strings (AI got truncated mid-string)
  // Count quotes - if odd number, we have an unterminated string
  let inString = false;
  let escaped = false;
  let fixed = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      fixed += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      fixed += ch;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        inString = true;
      } else {
        // Check if next non-whitespace is a structural character
        const remaining = text.slice(i + 1).trimStart();
        if (remaining.length === 0 || /^[,:}\]\s]/.test(remaining)) {
          inString = false;
        }
        // If remaining starts with a new key or value start, close the string
        else if (remaining.startsWith('"') || remaining.startsWith('{') || remaining.startsWith('[') || /^\d/.test(remaining) || remaining.startsWith('true') || remaining.startsWith('false') || remaining.startsWith('null')) {
          // Unterminated string - close it
          fixed += '"';
          inString = false;
          // Add comma if needed
          fixed += ',';
          // Skip ahead to the next quote
          continue;
        }
        // If we hit end of text with an open string, close it
        else if (i === text.length - 1 || text.slice(i + 1).trim().length === 0) {
          fixed += '"';
          inString = false;
        }
      }
    }
    fixed += ch;
  }

  // If still in string at end, close it
  if (inString) {
    fixed += '"';
  }

  // Repair: trailing commas before ] or }
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Repair: missing closing brackets
  let openBraces = 0, closeBraces = 0;
  let openBrackets = 0, closeBrackets = 0;
  for (const ch of fixed) {
    if (ch === '{') openBraces++;
    if (ch === '}') closeBraces++;
    if (ch === '[') openBrackets++;
    if (ch === ']') closeBrackets++;
  }
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';

  return fixed;
}

function getLangPreference(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('quizwise_answer_lang') || 'zh_kw_en';
  }
  return 'zh_kw_en';
}

function getFeedbackLevel(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('quizwise_feedback_level') || 'normal';
  }
  return 'normal';
}

const ANALYSIS_PROMPT_ZH = `你是一位专业的学科老师，负责分析考试题目。给定一道或多道题目，分析每道题并返回以下JSON格式（仅返回JSON，不要markdown）：

{
  "questions": [
    {
      "type": "multiple_choice | fill_blank | essay | true_false",
      "questionText": "题目内容",
      "options": [{"label": "A", "text": "..."}, ...] 或 null,
      "correctAnswer": "正确答案",
      "explanation": "中文解释"
    }
  ]
}

规则：
- 选择题(选择题)：提取所有选项(A/B/C/D)，correctAnswer填写正确选项的字母+内容
- 填空题(填空题)：correctAnswer为缺失的词/短语
- 简答题(简答题)：correctAnswer为答案要点概述
- 判断题(判断题)：options应为[{"label":"正确","text":"正确"},{"label":"错误","text":"错误"}]
- 只返回JSON，不要添加任何额外文字

待分析题目：
{{QUESTIONS}}`;

const ANALYSIS_PROMPT_EN = `You are an expert teacher analyzing exam questions. Given one or more questions, analyze each and return a JSON object with this exact structure:

{
  "questions": [
    {
      "type": "multiple_choice | fill_blank | essay | true_false",
      "questionText": "The question text",
      "options": [{"label": "A", "text": "..."}, ...] or null,
      "correctAnswer": "The correct answer text",
      "explanation": "Explanation of the answer"
    }
  ]
}

Rules:
- For multiple_choice: extract all options (A/B/C/D), set correctAnswer to the correct choice letter+text
- For fill_blank: correctAnswer is the missing word/phrase
- For essay: correctAnswer is the expected answer outline
- For true_false: options should be [{"label":"True","text":"True"},{"label":"False","text":"False"}]
- If the question contains images/figures reference in text, note them
- Return ONLY valid JSON, no markdown, no extra text

Questions to analyze:
{{QUESTIONS}}`;

function getAnalysisPrompt(rawText: string): string {
  const lang = getLangPreference();
  const template = lang.startsWith('en') ? ANALYSIS_PROMPT_EN : ANALYSIS_PROMPT_ZH;
  return template.replace('{{QUESTIONS}}', rawText);
}

const GRADING_PROMPT_ZH = `你是一位友善的学科老师。请判断学生的答案是否与正确答案意思一致，然后只返回以下JSON格式：

{
  "isCorrect": true或false,
  "score": 0到100的整数,
  "feedback": "2-3句中文反馈，指出对在哪里或需要改进的地方",
  "correctAnswer": "正确答案的中文说明",
  "explanation": "中文解释为什么这个答案对或错"
}

评分规则（请宽容判分）：
- 选择题：如果学生选了正确选项，isCorrect=true，score=100
- 填空题：接受同义词、近义词、不同句式但意思相同，判正确
- 大题/简答题：判断核心意思是否与标准答案一致，不要逐字匹配
  - 如果学生回答的意思与标准答案相同（即使措辞不同），应判正确
  - 如果学生只答对了部分要点，给予部分分数（60-80分）
  - 只在与标准答案明显矛盾时才判错误（0-40分）
- 拼写小错误不应扣分

题目：{{QUESTION}}
标准答案：{{CORRECT_ANSWER}}
学生答案：{{USER_ANSWER}}`;

const GRADING_PROMPT_EN = `You are a friendly subject teacher. Judge whether the student's answer matches the correct answer in meaning, and return ONLY the following JSON format:

{
  "isCorrect": true or false,
  "score": integer 0-100,
  "feedback": "2-3 sentences of feedback in English",
  "correctAnswer": "The correct answer explained",
  "explanation": "English explanation of why the answer is right or wrong"
}

Grading rules (be lenient):
- Multiple choice: if student picked the correct option, isCorrect=true, score=100
- Fill in blank: accept synonyms, similar phrasing with same meaning as correct
- Essay/short answer: check if core meaning matches, don't do word-by-word matching
  - If student's answer matches the core meaning (even with different wording), mark correct
  - If student only got some key points, give partial credit (60-80)
  - Only mark wrong if clearly contradicts the correct answer (0-40)
- Minor spelling errors should not reduce score

Question: {{QUESTION}}
Correct Answer: {{CORRECT_ANSWER}}
Student Answer: {{USER_ANSWER}}`;

function getGradingPrompt(question: { questionText: string; correctAnswer: string; type: string }, userAnswer: string): string {
  const lang = getLangPreference();
  const template = lang.startsWith('en') ? GRADING_PROMPT_EN : GRADING_PROMPT_ZH;
  return template
    .replace('{{QUESTION}}', question.questionText)
    .replace('{{CORRECT_ANSWER}}', question.correctAnswer)
    .replace('{{USER_ANSWER}}', userAnswer);
}

const FEEDBACK_PROMPT_ZH = `你是一位善于讲解的辅导老师。学生做错或不理解这道题，需要更详细的解释。

题目：{{QUESTION}}
正确答案：{{CORRECT_ANSWER}}
学生答案：{{USER_ANSWER}}

请提供友好详细的讲解，包括：
1. 清楚解释为什么正确答案是对的
2. 指出与本知识点相关的常见误区
3. 给一个有用的记忆技巧或解题提示
4. 如有必要，展示逐步推理过程
{{FEEDBACK_LEVEL}}

请用中文回答，关键词可保留英文。`;

const FEEDBACK_PROMPT_EN = `You are a helpful tutor explaining a concept to a student. The student asked for more explanation about a question they got wrong or don't understand.

Question: {{QUESTION}}
Correct Answer: {{CORRECT_ANSWER}}
User's Answer: {{USER_ANSWER}}

Provide a friendly, detailed explanation that:
1. Clearly explains why the correct answer is correct
2. Points out common misconceptions related to this topic
3. Gives a helpful tip or memory aid for similar questions in the future
4. If applicable, shows step-by-step reasoning
{{FEEDBACK_LEVEL}}

Keep it under 300 words. Use simple language.`;

function getFeedbackPrompt(question: { questionText: string; correctAnswer: string }, userAnswer: string): string {
  const lang = getLangPreference();
  const level = getFeedbackLevel();
  let levelHint = '';
  if (level === 'brief') levelHint = '\nKeep the explanation very brief - under 100 words, just key points.';
  else if (level === 'detailed') levelHint = '\nProvide a thorough explanation with step-by-step reasoning, examples, and background context - up to 500 words.';
  
  const template = lang.startsWith('en') ? FEEDBACK_PROMPT_EN : FEEDBACK_PROMPT_ZH;
  return template
    .replace('{{QUESTION}}', question.questionText)
    .replace('{{CORRECT_ANSWER}}', question.correctAnswer)
    .replace('{{USER_ANSWER}}', userAnswer)
    .replace('{{FEEDBACK_LEVEL}}', levelHint);
}

export interface AnalysisResult {
  questions: AnalyzedQuestion[];
  error?: string;
}

export interface GradeResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  correctAnswer: string;
  explanation: string;
}

export interface FeedbackResult {
  data: string | null;
  error: string | null;
}

/**
 * Call LLM proxy - proxy reads AI config from Supabase user_settings
 */
async function callLLM(messages: Array<{ role: string; content: string }>, options: {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
} = {}): Promise<string> {
  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 2000,
      stream: options.stream ?? false,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Analyze questions by sending them to the LLM proxy
 */
export async function analyzeQuestions(
  rawText: string,
): Promise<AnalysisResult> {
  try {
    const prompt = getAnalysisPrompt(rawText);

    const content = await callLLM([
      { role: 'system', content: 'You are a precise question analyzer. Always return valid JSON only, no markdown. Ensure all special characters in question text are properly escaped for JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, max_tokens: 10000 });

    // Try to extract and repair JSON from the response
    const jsonStr = repairJSON(content);
    let parsed: { questions?: AnalyzedQuestion[] };
    try {
      parsed = JSON.parse(jsonStr) as { questions?: AnalyzedQuestion[] };
    } catch (parseErr) {
      // Retry with simple regex extraction
      const match = jsonStr.match(/"questions"\s*:\s*(\[[\s\S]*\])/);
      if (match) {
        try {
          parsed = JSON.parse(`{ "questions": ${match[1]} }`) as { questions?: AnalyzedQuestion[] };
        } catch {
          throw parseErr;
        }
      } else {
        throw parseErr;
      }
    }

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid response format from AI');
    }

    return { questions: parsed.questions };
  } catch (err) {
    return {
      questions: [],
      error: err instanceof Error ? err.message : 'Failed to analyze questions',
    };
  }
}

/**
 * Grade a user's answer using AI
 */
export async function gradeAnswer(
  question: { questionText: string; correctAnswer: string; type: QuestionType },
  userAnswer: string,
): Promise<GradeResult | { error: string }> {
  try {
    const prompt = getGradingPrompt(question, userAnswer);

    const content = await callLLM([
      { role: 'system', content: 'You are a precise grading assistant. Always return valid JSON only.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, max_tokens: 1000 });

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();

    return JSON.parse(jsonStr) as GradeResult;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Grading failed' };
  }
}

/**
 * Get detailed AI feedback/explanation for a question
 * Returns structured object instead of plain string
 */
export async function getAIFeedback(
  question: { questionText: string; correctAnswer: string },
  userAnswer: string,
): Promise<FeedbackResult> {
  try {
    const prompt = getFeedbackPrompt(question, userAnswer);

    const content = await callLLM([
      { role: 'system', content: 'You are a helpful, encouraging tutor.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.7, max_tokens: 1500 });

    return { data: content, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'AI feedback request failed',
    };
  }
}

/**
 * Quick local check for multiple choice questions (no AI needed)
 */
export function checkMultipleChoice(
  userAnswer: string,
  correctAnswer: string,
): boolean {
  const normalize = (s: string) => s.trim().toLowerCase();
  const ua = normalize(userAnswer);
  const ca = normalize(correctAnswer);

  // Check if the letter matches (e.g., user picks "A", correct is "A" or "A)")
  const letterMatch = ua.match(/^([a-d])[).]?\s*/);
  const correctLetter = ca.match(/^([a-d])[).]?\s*/);

  if (letterMatch && correctLetter && letterMatch[1] === correctLetter[1]) {
    return true;
  }

  // Full text match
  return ua === ca;
}