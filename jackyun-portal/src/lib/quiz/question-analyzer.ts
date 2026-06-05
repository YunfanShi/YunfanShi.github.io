'use client';

import { AnalyzedQuestion, QuestionType } from '@/types/quiz';

/** Get LLM config from localStorage (shared with quiz.html) */
function getLLMConfig(): { baseUrl: string; apiKey: string; model: string } {
  if (typeof window === 'undefined') {
    return { baseUrl: '', apiKey: '', model: 'deepseek-v4-flash' };
  }
  const provider = localStorage.getItem('ai_provider') || 'deepseek';
  const PROVIDER_ENDPOINTS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
  };
  const baseUrl = localStorage.getItem('ai_custom_endpoint') || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.deepseek;
  const apiKey = localStorage.getItem('ds_key') || '';
  const model = localStorage.getItem('ai_model') || 'deepseek-v4-flash';
  return { baseUrl, apiKey, model };
}

const ANALYSIS_PROMPT = `You are an expert teacher analyzing exam questions. Given one or more questions, analyze each and return a JSON object with this exact structure:

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

const GRADING_PROMPT = `你是一位友善的学科老师。请判断学生的答案是否与正确答案意思一致，然后只返回以下JSON格式：

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

const FEEDBACK_PROMPT = `You are a helpful tutor explaining a concept to a student. The student asked for more explanation about a question they got wrong or don't understand.

Question: {{QUESTION}}
Correct Answer: {{CORRECT_ANSWER}}
User's Answer: {{USER_ANSWER}}

Provide a friendly, detailed explanation that:
1. Clearly explains why the correct answer is correct
2. Points out common misconceptions related to this topic
3. Gives a helpful tip or memory aid for similar questions in the future
4. If applicable, shows step-by-step reasoning

Keep it under 300 words. Use simple language.`;

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
 * Call LLM proxy with client config
 */
async function callLLM(messages: Array<{ role: string; content: string }>, options: {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
} = {}): Promise<string> {
  const cfg = getLLMConfig();

  const res = await fetch('/api/llm-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
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
    const prompt = ANALYSIS_PROMPT.replace('{{QUESTIONS}}', rawText);

    const content = await callLLM([
      { role: 'system', content: 'You are a precise question analyzer. Always return valid JSON only, no markdown.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, max_tokens: 4000 });

    // Try to extract JSON from the response
    let jsonStr = content.trim();
    // Remove markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr) as { questions?: AnalyzedQuestion[] };

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
    const prompt = GRADING_PROMPT
      .replace('{{QUESTION}}', question.questionText)
      .replace('{{CORRECT_ANSWER}}', question.correctAnswer)
      .replace('{{USER_ANSWER}}', userAnswer);

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
    const prompt = FEEDBACK_PROMPT
      .replace('{{QUESTION}}', question.questionText)
      .replace('{{CORRECT_ANSWER}}', question.correctAnswer)
      .replace('{{USER_ANSWER}}', userAnswer);

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