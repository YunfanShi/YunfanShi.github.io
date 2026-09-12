export type ReadingLevel = 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
import { parseAiJson } from './ai-json.ts';
export type ReadingStyle = 'cinematic' | 'literary' | 'mystery' | 'adventure' | 'science-fiction' | 'fantasy' | 'slice-of-life' | 'historical' | 'academic' | 'journalistic';
export type ReadingSourceMode = 'creative' | 'news';

export interface ReadingNewsSource {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
}

export interface ReadingSettings {
  level: ReadingLevel;
  wordCount: number;
  vocabularyDensity: number;
  sentenceComplexity: number;
  style: ReadingStyle;
  tone: string;
  perspective: string;
  pacing: number;
  dialogueRatio: number;
  ending: string;
  learningFocus: string;
  premise: string;
  characters: string;
  setting: string;
  mustInclude: string;
  avoid: string;
  sourceMode?: ReadingSourceMode;
  newsQuery?: string;
}

export interface WordNote {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  definition: string;
  example: string;
}

export interface ReadingQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface ReadingQuiz {
  questions: ReadingQuestion[];
}

export interface ReadingArticle {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  summary: string;
  level: ReadingLevel;
  style: string;
  createdAt: string;
  wordCount: number;
  estimatedMinutes: number;
  totalSeconds: number;
  completedCount: number;
  lastReadAt: string | null;
  quiz: ReadingQuiz | null;
  quizAttempts: number;
  quizCorrect: number;
  quizAnswered: number;
  vocabulary: Record<string, WordNote>;
  sourceMode?: ReadingSourceMode;
  sources?: ReadingNewsSource[];
  progressRatio?: number;
  progressScrollY?: number;
  progressUpdatedAt?: string | null;
}

export interface ReadingStats {
  articles: number;
  completed: number;
  totalSeconds: number;
  wordsRead: number;
  quizAttempts: number;
  quizAccuracy: number | null;
  vocabularySaved: number;
}

function extractJson(raw: string): unknown {
  return parseAiJson(raw);
}

export function countReadingWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function calculateReadingProgress(scrollY: number, scrollHeight: number, viewportHeight: number): number {
  const maximum = Math.max(0, scrollHeight - viewportHeight);
  if (!maximum) return 0;
  return Math.min(1, Math.max(0, scrollY / maximum));
}

export function restoreReadingScroll(progressRatio: number, scrollHeight: number, viewportHeight: number): number {
  const safeProgress = Number.isFinite(progressRatio) ? Math.min(1, Math.max(0, progressRatio)) : 0;
  return safeProgress * Math.max(0, scrollHeight - viewportHeight);
}

export function buildReadingPrompt(settings: ReadingSettings, newsSources: ReadingNewsSource[] = []): string {
  const isNews = settings.sourceMode === 'news';
  const sourceMaterial = newsSources.map((item, index) => `${index + 1}. ${item.title}\nPublisher: ${item.source || 'Unknown'}\nPublished: ${item.publishedAt || 'Unknown'}\nSummary: ${item.snippet || 'No summary available'}\nURL: ${item.url}`).join('\n\n');
  return `You are an English reading-material author. Create one original, engaging text for a language learner.

Reader level: CEFR ${settings.level}
Target length: about ${settings.wordCount} English words (within 10%)
Vocabulary challenge: ${settings.vocabularyDensity}/5
Sentence complexity: ${settings.sentenceComplexity}/5
Style/genre: ${settings.style}
Tone: ${settings.tone}
Point of view: ${settings.perspective}
Pacing: ${settings.pacing}/5
Dialogue proportion: ${settings.dialogueRatio}%
Ending: ${settings.ending}
Learning focus: ${settings.learningFocus || 'balanced reading fluency'}
Premise or desired content: ${settings.premise || 'Invent an appealing original premise.'}
Characters: ${settings.characters || 'Invent suitable characters.'}
Setting/world: ${settings.setting || 'Choose a suitable setting.'}
Must include: ${settings.mustInclude || 'none'}
Avoid: ${settings.avoid || 'none'}
Content mode: ${isNews ? 'current-news explainer grounded in supplied sources' : 'original creative or educational reading'}
${isNews ? `News topic: ${settings.newsQuery || 'today\'s important news'}\n\nSOURCE MATERIAL:\n${sourceMaterial || 'No source material was supplied. Do not claim that the article is current.'}` : ''}

Requirements:
- Write the article/story in English. Respect the requested CEFR level while keeping it natural, not childish.
- Prefer clear, concrete nouns and strong verbs. Use adjectives and adverbs only when they add necessary information.
- Avoid purple prose, adjective stacking, ornate metaphors, repetitive atmosphere, inflated introductions, and strings of decorative modifiers.
- Vary sentence length naturally, but make every sentence advance the event, explanation, evidence, or idea.
- If the premise refers to an existing fictional universe, write a new, non-canonical fan story; do not reproduce source text.
- Use paragraphs and a satisfying narrative or expository structure.
- ${isNews ? 'Treat SOURCE MATERIAL as the only factual basis. Synthesize it into a neutral news explainer; preserve dates and named entities, distinguish reported facts from uncertainty, do not invent quotes or details, and do not mention facts absent from the sources.' : 'Do not present invented events as real news.'}
- Do not include comprehension questions yet.
- Return valid JSON only with this exact shape:
{"title":"English title","subtitle":"one short English hook","content":"full English text with \\n\\n between paragraphs","summary":"one concise Chinese summary"}`;
}

export function parseReadingArticle(raw: string, settings: ReadingSettings, id: string, now: string, sources: ReadingNewsSource[] = []): ReadingArticle {
  const value = extractJson(raw) as Record<string, unknown>;
  if (typeof value.title !== 'string' || typeof value.content !== 'string' || value.content.trim().length < 200) {
    throw new Error('AI 返回的文章格式不完整，请重试。');
  }
  const wordCount = countReadingWords(value.content);
  return {
    id,
    title: value.title.trim(),
    subtitle: typeof value.subtitle === 'string' ? value.subtitle.trim() : '',
    content: value.content.trim(),
    summary: typeof value.summary === 'string' ? value.summary.trim() : '',
    level: settings.level,
    style: settings.style,
    createdAt: now,
    wordCount,
    estimatedMinutes: Math.max(1, Math.ceil(wordCount / 180)),
    totalSeconds: 0,
    completedCount: 0,
    lastReadAt: null,
    quiz: null,
    quizAttempts: 0,
    quizCorrect: 0,
    quizAnswered: 0,
    vocabulary: {},
    sourceMode: settings.sourceMode ?? 'creative',
    sources: sources.slice(0, 8),
    progressRatio: 0,
    progressScrollY: 0,
    progressUpdatedAt: null,
  };
}

export function buildWordPrompt(word: string, sentence: string, level: ReadingLevel): string {
  return `Explain the English word "${word}" as used in this sentence: "${sentence}". The learner is CEFR ${level}. Return valid JSON only: {"word":"base form","phonetic":"IPA if known","partOfSpeech":"part of speech","translation":"concise Simplified Chinese meaning in context","definition":"simple English definition","example":"one new short English example"}.`;
}

export function parseWordNote(raw: string): WordNote {
  const value = extractJson(raw) as Record<string, unknown>;
  for (const key of ['word', 'translation', 'definition', 'example']) {
    if (typeof value[key] !== 'string') throw new Error('AI 返回的词义格式不完整。');
  }
  return {
    word: String(value.word),
    phonetic: typeof value.phonetic === 'string' ? value.phonetic : '',
    partOfSpeech: typeof value.partOfSpeech === 'string' ? value.partOfSpeech : '',
    translation: String(value.translation),
    definition: String(value.definition),
    example: String(value.example),
  };
}

export function buildReadingQuizPrompt(article: ReadingArticle, questionCount: number): string {
  return `Create ${questionCount} multiple-choice reading-comprehension questions for the article below. Test a balanced mix of main idea, detail, inference, vocabulary-in-context, tone, and author purpose. Keep question language near CEFR ${article.level}. Each question must have exactly four plausible options and one unambiguous answer. Return valid JSON only: {"questions":[{"id":"q1","question":"...","options":["A","B","C","D"],"answer":0,"explanation":"concise Simplified Chinese explanation"}]} where answer is a zero-based index.\n\nARTICLE:\n${article.content}`;
}

export function parseReadingQuiz(raw: string, maximum = 10): ReadingQuiz {
  const value = extractJson(raw) as { questions?: unknown };
  if (!Array.isArray(value.questions)) throw new Error('AI 返回的题目格式不完整。');
  const questions = value.questions.filter((item): item is ReadingQuestion => {
    if (!item || typeof item !== 'object') return false;
    const question = item as Partial<ReadingQuestion>;
    return typeof question.id === 'string' && typeof question.question === 'string' && Array.isArray(question.options) && question.options.length === 4 && question.options.every((option) => typeof option === 'string') && Number.isInteger(question.answer) && Number(question.answer) >= 0 && Number(question.answer) < 4 && typeof question.explanation === 'string';
  }).slice(0, maximum);
  if (!questions.length) throw new Error('AI 没有生成有效题目。');
  return { questions };
}

export function calculateReadingStats(articles: ReadingArticle[]): ReadingStats {
  const quizAttempts = articles.reduce((sum, article) => sum + article.quizAttempts, 0);
  const quizCorrect = articles.reduce((sum, article) => sum + article.quizCorrect, 0);
  const quizAnswered = articles.reduce((sum, article) => sum + article.quizAnswered, 0);
  return {
    articles: articles.length,
    completed: articles.reduce((sum, article) => sum + article.completedCount, 0),
    totalSeconds: articles.reduce((sum, article) => sum + article.totalSeconds, 0),
    wordsRead: articles.filter((article) => article.completedCount > 0).reduce((sum, article) => sum + article.wordCount * article.completedCount, 0),
    quizAttempts,
    quizAccuracy: quizAnswered ? Math.round((quizCorrect / quizAnswered) * 100) : null,
    vocabularySaved: articles.reduce((sum, article) => sum + Object.keys(article.vocabulary).length, 0),
  };
}
