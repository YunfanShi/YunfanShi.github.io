import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../companion-extension/safeguard-rules.js', import.meta.url), 'utf8');
const sandbox = { globalThis: {} };
vm.runInNewContext(source, sandbox, { filename: 'safeguard-rules.js' });
const rules = sandbox.globalThis.JackYunSafeGuardRules;

test('detects Chinese domains without treating subdomain lookalikes as matches', () => {
  assert.equal(rules.isLikelyChineseHost('news.baidu.com'), true);
  assert.equal(rules.isLikelyChineseHost('university.edu.cn'), true);
  assert.equal(rules.isLikelyChineseHost('baidu.com.example.org'), false);
  assert.equal(rules.isLikelyChineseHost('example.org'), false);
});

test('detects Chinese content and accepts an actually translated English presentation', () => {
  const chinese = rules.languageStats('这是一个用于学习英语的中文页面。'.repeat(20), 'zh-CN');
  const english = rules.languageStats('This is a translated English study page with useful lesson material. '.repeat(20), 'en');
  assert.equal(rules.isChineseContent(chinese), true);
  assert.equal(rules.isEnglishPresentation(chinese), false);
  assert.equal(rules.isEnglishPresentation(english), true);
});

test('accepts Immersive Translate-style bilingual content only when substantial English is visible', () => {
  const bilingual = rules.languageStats(`${'这是中文学习资料。'.repeat(30)} ${'This translated lesson explains the material in clear English sentences. '.repeat(35)}`, 'zh-CN');
  const tokenEnglish = rules.languageStats(`${'这是中文学习资料。'.repeat(30)} English`, 'zh-CN');
  assert.equal(rules.isEnglishPresentation(bilingual), true);
  assert.equal(rules.isEnglishPresentation(tokenEnglish), false);
});

test('requires visible Chinese subtitles to have substantial English translation', () => {
  const englishPage = 'This page is presented in English for focused browsing. '.repeat(30);
  const chineseOnly = rules.presentationAssessment({ pageText: englishPage, pageLang: 'en', subtitleText: '这是中文字幕。'.repeat(20) });
  const bilingual = rules.presentationAssessment({ pageText: englishPage, pageLang: 'en', subtitleText: `${'这是中文字幕。'.repeat(15)} ${'This is the translated English subtitle. '.repeat(25)}` });
  assert.equal(chineseOnly.accepted, false);
  assert.equal(bilingual.accepted, true);
});

test('does not misclassify Japanese text as a Chinese page solely because it contains kanji', () => {
  const japanese = rules.languageStats('日本語の学習ページです。ひらがなとカタカナを使います。'.repeat(20), 'ja');
  assert.equal(rules.isChineseContent(japanese), false);
});

test('Chinese video and gaming blacklist overrides educational-looking page text', () => {
  const result = rules.studyEligibility({ hostname: 'www.bilibili.com', title: '数学课程 教育 学习', path: '/video/1', text: '', config: {} });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /video or gaming/i);
});

test('allows known education sites and requires multiple signals for unknown sites', () => {
  assert.equal(rules.studyEligibility({ hostname: 'www.icourse163.org', config: {} }).allowed, true);
  assert.equal(rules.studyEligibility({ hostname: 'notes.example.cn', title: '数学课程', text: '考试题库', config: {} }).allowed, true);
  assert.equal(rules.studyEligibility({ hostname: 'shop.example.cn', title: '学习文具', text: '', config: {} }).allowed, false);
});

test('category blocks cannot be defeated by subdomains or disabled-category defaults', () => {
  assert.equal(rules.categoryReason('m.pornhub.com', {}), 'Pornography');
  assert.equal(rules.categoryReason('www.youtube.com', {}), null);
  assert.equal(rules.categoryReason('www.youtube.com', { activeCategories: { Videos: true } }), 'Videos');
  assert.equal(rules.categoryReason('news.example.com', { activeCategories: { Social: true }, customSites: [{ d: 'example.com', c: 'Social' }] }), 'Social');
});

test('custom entertainment rules override custom education rules', () => {
  const config = { customEducationHosts: ['lessons.example.cn'], customEntertainmentHosts: ['example.cn'] };
  assert.equal(rules.studyEligibility({ hostname: 'lessons.example.cn', config }).allowed, false);
});

test('education exclusion is enabled by default and can be disabled explicitly', () => {
  assert.equal(rules.normalizeConfig({}).excludeEducation, true);
  assert.equal(rules.normalizeConfig({ excludeEducation: false }).excludeEducation, false);
});

test('Companion manifest loads SafeGuard globally and contains no TR3000 module', () => {
  const manifest = JSON.parse(readFileSync(new URL('../companion-extension/manifest.json', import.meta.url), 'utf8'));
  const serialized = JSON.stringify(manifest).toLowerCase();
  const safeguard = manifest.content_scripts.find((entry) => entry.js?.includes('safeguard.js'));
  assert.deepEqual(safeguard.matches, ['<all_urls>']);
  assert.deepEqual(safeguard.js, ['safeguard-rules.js', 'safeguard.js']);
  assert.equal(serialized.includes('tr3000'), false);
  assert.equal(serialized.includes('192.168.10.1'), false);
});
