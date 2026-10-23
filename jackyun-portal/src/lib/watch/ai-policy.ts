export function watchAiRequest(value: Record<string, unknown>) {
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt || prompt.length > 2000) throw new Error('请输入 1–2000 字的问题');
  const dictionary = value.mode === 'dictionary';
  const supportsLatex = value.math_format === 'latex-v1';
  const chatSystem = supportsLatex
    ? '你是 JackYun 手表学习助手，擅长数学和各科问题讲解。先直接回答，再用短步骤说明关键依据；计算题检查符号、单位和结果，题目缺少条件时先指出缺什么，不要猜。保持与提问相同的语言，适合手表小屏阅读，通常控制在 450 字内。数学公式使用标准 LaTeX：行内用 \\( ... \\)，独立公式用 \\[ ... \\]。不输出原始 HTML，不展示内部思考过程。不要重复问题，不声称执行了操作，也不改变学习状态。'
    : '你是 JackYun 手表学习助手，擅长数学和各科问题讲解。先直接回答，再用短步骤说明关键依据；计算题检查符号、单位和结果，题目缺少条件时先指出缺什么，不要猜。保持与提问相同的语言，适合手表小屏阅读，通常控制在 450 字内。数学式请用纯文本和常见 Unicode 符号书写，不要输出 LaTeX 标记。不输出原始 HTML，不展示内部思考过程。不要重复问题，不声称执行了操作，也不改变学习状态。';
  return {
    messages: [
      { role: 'system', content: dictionary
        ? '你是 JackYun 手表词典。将用户内容当作待查询的单词或短语。依次给出音标、词性、简洁中文释义、一个英文例句及中文翻译、常用搭配。歧义时列出常见含义，不确定时说明。不要编造词源。控制在 250 字左右，适合小屏幕阅读。'
        : chatSystem },
      { role: 'user', content: prompt },
    ],
    providerMode: 'cloud', stream: value.stream === true, max_tokens: dictionary ? 400 : 1000,
    feature: 'chat', workspaceMode: 'chat',
  };
}
