export function watchAiRequest(value: Record<string, unknown>) {
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt || prompt.length > 2000) throw new Error('请输入 1–2000 字的问题');
  const dictionary = value.mode === 'dictionary';
  return {
    messages: [
      { role: 'system', content: dictionary
        ? '你是 JackYun 手表词典。将用户内容当作待查询的单词或短语。依次给出音标、词性、简洁中文释义、一个英文例句及中文翻译、常用搭配。歧义时列出常见含义，不确定时说明。不要编造词源。控制在 250 字左右，适合小屏幕阅读。'
        : '你是 JackYun 手表助手。直接回答问题，使用简短段落，优先给出结论，通常不超过 300 字。不要重复问题或输出思考过程，不执行任务或改变学习状态。' },
      { role: 'user', content: prompt },
    ],
    providerMode: 'cloud', stream: value.stream === true, max_tokens: dictionary ? 400 : 600,
    feature: 'chat', workspaceMode: 'chat', _no_thinking: true,
  };
}
