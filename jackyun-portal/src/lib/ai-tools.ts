/**
 * AI 助手工具注册表 —— 定义每个 AI 助手可用的工具
 *
 * 不同 scope 的 AI 助手拥有不同的工具权限：
 * - global (主页)：全部工具
 * - quiz (QuizWise)：仅题目分析、批改、反馈
 * - plan (Studyplan)：仅学习计划相关
 * - control (Control)：仅控制和查询
 */

export type ToolScope = 'global' | 'quiz' | 'plan' | 'control' | 'study_guide';

export interface AiTool {
  /** 工具唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述（用于注入 system prompt） */
  description: string;
  /** 工具所属 scope */
  scope: ToolScope[];
  /** 处理函数：解析参数并执行 */
  handler: (params: Record<string, string>) => string | Promise<string>;
}

/**
 * 工具注册表
 */
export const AI_TOOLS: AiTool[] = [
  // ====== 导航类工具 ======
  {
    id: 'navigate',
    name: '跳转到页面',
    description: '跳转到一个功能页面。参数：page (dashboard|control|quiz|study|vocab|music|poem|settings|goal|relax|study-guide|mock-portal|tools|countdown|bilibili-sync|igcountdown|timetable-hub|update-hub|md2word|answer-sheet)，可选 section (页面内的区域名称，如 timer/schedule)',
    scope: ['global'],
    handler: async (params) => {
      const pageMap: Record<string, string> = {
        dashboard: '/dashboard',
        control: '/control',
        quiz: '/quiz',
        study: '/study',
        studyplan: '/study',
        plan: '/study',
        vocab: '/vocab',
        music: '/music',
        poem: '/poem',
        settings: '/settings',
        goal: '/goal',
        relax: '/relax',
        'study-guide': '/study-guide',
        'mock-portal': '/mock-portal',
        tools: '/tools',
        countdown: '/countdown',
        'bilibili-sync': '/bilibili-sync',
        igcountdown: '/igcountdown',
        'timetable-hub': '/timetable-hub',
        'update-hub': '/update-hub',
        md2word: '/md2word',
        'answer-sheet': '/answer-sheet',
      };
      const page = params.page?.toLowerCase() || '';
      const section = params.section || '';
      const url = pageMap[page];
      if (url) {
        const target = section ? `${url}#${section}` : url;
        window.location.href = target;
        return `正在跳转到 ${page} 页面${section ? `的 ${section} 区域` : ''}...`;
      }
      return `未知页面: ${page}`;
    },
  },
  {
    id: 'open_link',
    name: '打开外部链接',
    description: '打开一个外部链接或资源。参数：url (完整链接地址)',
    scope: ['global'],
    handler: async (params) => {
      const url = params.url || '';
      if (url) {
        window.open(url, '_blank');
        return `已打开链接: ${url}`;
      }
      return '请提供要打开的链接';
    },
  },
  {
    id: 'go_back',
    name: '返回上一页',
    description: '返回上一页',
    scope: ['global'],
    handler: async () => {
      window.history.back();
      return '正在返回...';
    },
  },

  // ====== 播放/控制类工具（弹窗模式，不跳转页面） ======
  {
    id: 'play_music',
    name: '播放音乐',
    description: '播放网易云歌单或音乐。参数：playlist_id (歌单ID，默认17652191106)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const playlistId = params.playlist_id || '17652191106';
      // 通过 localStorage 事件通知 MiniPlayer 或音乐页面
      localStorage.setItem(
        'jackyun_ai_music_command',
        JSON.stringify({
          action: 'play',
          playlistId,
          timestamp: Date.now(),
        })
      );
      // 同时触发自定义事件供同页面组件监听
      window.dispatchEvent(new CustomEvent('jackyun-ai-music', {
        detail: { action: 'play', playlistId },
      }));
      return `🎵 正在播放歌单，如果未看到播放器请先打开音乐页面`;
    },
  },
  {
    id: 'stop_music',
    name: '停止播放',
    description: '停止当前音乐播放',
    scope: ['global', 'control'],
    handler: async () => {
      localStorage.setItem(
        'jackyun_ai_music_command',
        JSON.stringify({ action: 'stop', timestamp: Date.now() })
      );
      window.dispatchEvent(new CustomEvent('jackyun-ai-music', {
        detail: { action: 'stop' },
      }));
      return '已停止音乐播放';
    },
  },
  {
    id: 'start_timer',
    name: '开始计时',
    description: '开始专注计时。参数：duration (分钟数，默认30)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const duration = parseInt(params.duration || '30');
      localStorage.setItem(
        'warden_ai_command',
        JSON.stringify({ action: 'start_timer', duration })
      );
      // 也触发自定义事件
      window.dispatchEvent(new CustomEvent('jackyun-ai-command', {
        detail: { action: 'start_timer', duration },
      }));
      return `⏱ 已设置 ${duration} 分钟计时器（请打开日程中心页面查看）`;
    },
  },
  {
    id: 'stop_timer',
    name: '停止计时',
    description: '停止当前计时器',
    scope: ['global', 'control'],
    handler: async () => {
      localStorage.setItem(
        'warden_ai_command',
        JSON.stringify({ action: 'stop_timer' })
      );
      return '已发送停止计时指令';
    },
  },

  // ====== 日程管理工具（Control 日程中心） ======
  {
    id: 'get_schedule',
    name: '查看当天日程',
    description: '查看今天的完整时间表和任务安排。参数：无（自动读取当天数据）',
    scope: ['global', 'control'],
    handler: async () => {
      try {
        const scheduleData = localStorage.getItem('w3_schedule');
        if (scheduleData) {
          const tasks = JSON.parse(scheduleData);
          if (tasks.length > 0) {
            const taskList = tasks
              .map((t: any, i: number) =>
                `  ${i + 1}. ${t.start}-${t.end} | ${t.cat} | ${t.detail}${t.done ? ' ✅' : t.skipped ? ' ⏭️' : ''}`
              )
              .join('\n');
            const doneCount = tasks.filter((t: any) => t.done).length;
            return `📋 今日日程（完成 ${doneCount}/${tasks.length}）：\n${taskList}`;
          }
          return '今天还没有安排任务。';
        }
        return '无法获取日程数据，请先确认是否在日程中心初始化了系统。';
      } catch {
        return '无法获取日程信息';
      }
    },
  },
  {
    id: 'get_current_task',
    name: '查看当前任务',
    description: '查看现在正在进行的任务',
    scope: ['global', 'control'],
    handler: async () => {
      try {
        const scheduleData = localStorage.getItem('w3_schedule');
        if (!scheduleData) return '无法获取日程数据';
        const tasks = JSON.parse(scheduleData);
        const now = new Date();
        const curM = now.getHours() * 60 + now.getMinutes();
        const currentTask = tasks.find(
          (t: any) =>
            curM >= timeToMin(t.start) && curM < timeToMin(t.end)
        );
        if (currentTask) {
          const status = currentTask.done
            ? '✅ 已完成'
            : currentTask.skipped
            ? '⏭️ 已跳过'
            : '⏳ 进行中';
          return `当前任务（${status}）：${currentTask.cat} - ${currentTask.detail}（${currentTask.start}-${currentTask.end}）`;
        }
        return '当前没有进行中的任务。';
      } catch {
        return '无法获取当前任务信息';
      }
    },
  },
  {
    id: 'toggle_task_done',
    name: '标记任务完成/取消',
    description: '标记某个任务为已完成，或取消完成状态。参数：task_index (任务序号，从1开始)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const idx = parseInt(params.task_index || '0') - 1;
      try {
        const scheduleData = localStorage.getItem('w3_schedule');
        if (!scheduleData) return '无法获取日程数据';
        const tasks = JSON.parse(scheduleData);
        if (idx < 0 || idx >= tasks.length) return `无效的任务序号，共有 ${tasks.length} 个任务`;
        tasks[idx].done = !tasks[idx].done;
        localStorage.setItem('w3_schedule', JSON.stringify(tasks));
        return `已${tasks[idx].done ? '标记为完成 ✅' : '取消完成 🔄'}：${tasks[idx].detail}`;
      } catch {
        return '操作失败';
      }
    },
  },
  {
    id: 'skip_task',
    name: '跳过任务',
    description: '跳过当前任务。参数：无',
    scope: ['global', 'control'],
    handler: async () => {
      try {
        const scheduleData = localStorage.getItem('w3_schedule');
        if (!scheduleData) return '无法获取日程数据';
        const tasks = JSON.parse(scheduleData);
        const now = new Date();
        const curM = now.getHours() * 60 + now.getMinutes();
        const idx = tasks.findIndex(
          (t: any) =>
            curM >= timeToMin(t.start) && curM < timeToMin(t.end)
        );
        if (idx === -1) return '当前没有进行中的任务可以跳过';
        tasks[idx].skipped = true;
        localStorage.setItem('w3_schedule', JSON.stringify(tasks));
        return `已跳过任务：${tasks[idx].detail}`;
      } catch {
        return '跳过任务失败';
      }
    },
  },
  {
    id: 'finish_task_early',
    name: '提前完成任务',
    description: '提前结束当前正在进行的任务。参数：无',
    scope: ['global', 'control'],
    handler: async () => {
      localStorage.setItem(
        'warden_ai_command',
        JSON.stringify({ action: 'finish_early' })
      );
      return '已发送提前完成指令';
    },
  },
  {
    id: 'switch_day',
    name: '切换到某天日程',
    description: '查看某一天的日程安排。参数：day_offset (偏移量，0=今天，-1=昨天，1=明天)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const offset = parseInt(params.day_offset || '0');
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + offset);
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const dayStr = dayNames[targetDate.getDay()];
      return `切换到了${offset === 0 ? '今天' : dayStr}的日程。\n提示：请在日程中心页面使用日期切换按钮查看。`;
    },
  },

  // ====== 查询类工具 ======
  {
    id: 'get_today_schedule',
    name: '查看今日学习计划',
    description: '查看今天的学习计划安排（Studyplan 数据）。参数：无',
    scope: ['global', 'plan'],
    handler: async () => {
      try {
        const studyplanData = localStorage.getItem('caie_schedule_current');
        if (studyplanData) {
          const tasks = JSON.parse(studyplanData);
          if (tasks.length > 0) {
            const taskList = tasks
              .map((t: any) => `  - ${t.time}：${t.task}${t.done ? ' ✅' : ''}`)
              .join('\n');
            return `今天的计划任务：\n${taskList}`;
          }
        }
        return '今天还没有安排任务，可以在 Studyplan 页面生成计划。';
      } catch {
        return '无法获取日程信息';
      }
    },
  },
  {
    id: 'get_progress',
    name: '查看学科进度',
    description: '查看指定学科的学习进度。参数：subject (学科名称，如 Mathematics)',
    scope: ['global', 'plan'],
    handler: async (params) => {
      const subject = params.subject || '';
      try {
        const progress = JSON.parse(localStorage.getItem('caie_progress_v2_1') || '{}');
        const syllabus = JSON.parse(localStorage.getItem('caie_syllabus_v3') || '{}');
        const subjectData = syllabus[subject];
        if (!subjectData) return `未找到学科 "${subject}" 的进度数据`;
        const totalUnits = subjectData.units.length;
        const doneUnits = subjectData.units.filter((u: string) =>
          progress[`${subject}|${u}|FINAL|unit_done`]
        ).length;
        return `${subject} 进度：已完成 ${doneUnits}/${totalUnits} 个单元 (${Math.round((doneUnits / totalUnits) * 100)}%)`;
      } catch {
        return '无法获取进度信息';
      }
    },
  },
  {
    id: 'get_countdown',
    name: '查看倒计时',
    description: '查看考试或开学倒计时。参数：type (exam|school)',
    scope: ['global', 'plan'],
    handler: async (params) => {
      try {
        const settings = JSON.parse(localStorage.getItem('caie_settings_v2_1') || '{}');
        const type = params.type || 'exam';
        if (type === 'exam' && settings.exam) {
          const days = Math.ceil((new Date(settings.exam).getTime() - Date.now()) / 86400000);
          return days > 0 ? `距离 IGCSE 考试还有 ${days} 天` : '考试日期已到';
        }
        if (type === 'school' && settings.school) {
          const days = Math.ceil((new Date(settings.school).getTime() - Date.now()) / 86400000);
          return days > 0 ? `距离开学还有 ${days} 天` : '已开学';
        }
        return '请在 Studyplan 设置页面配置日期';
      } catch {
        return '无法获取倒计时信息';
      }
    },
  },

  // ====== Quiz 独有的工具 ======
  {
    id: 'analyze_question',
    name: '分析题目',
    description: '分析一道考试题目，识别类型、提取答案和解析。参数：question_text (题目文本)',
    scope: ['global', 'quiz'],
    handler: async (params) => {
      const questionText = params.question_text || '';
      localStorage.setItem('quizwise_ai_command', JSON.stringify({ action: 'analyze', text: questionText }));
      return '已将题目发送到 QuizWise 进行分析，请打开 QuizWise 页面查看结果';
    },
  },

  // ====== 实用小工具 ======
  {
    id: 'search_web',
    name: '搜索网页',
    description: '在浏览器新标签页中打开 Google 搜索。参数：query (搜索关键词)',
    scope: ['global'],
    handler: async (params) => {
      const query = encodeURIComponent(params.query || '');
      if (query) {
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
        return `🔍 已打开 Google 搜索：${params.query}`;
      }
      return '请提供搜索关键词';
    },
  },
  {
    id: 'calculate',
    name: '计算器',
    description: '执行数学计算并返回结果。参数：expression (数学表达式，如 25*4+10)',
    scope: ['global', 'quiz', 'plan', 'control', 'study_guide'],
    handler: async (params) => {
      const expr = (params.expression || '').trim();
      if (!expr) return '请提供要计算的表达式';
      try {
        // 安全评估：只允许数字和基本运算符
        const sanitized = expr.replace(/[^0-9+\-*/.() ]/g, '');
        if (!sanitized) return '表达式包含不支持的字符';
        const result = Function(`"use strict"; return (${sanitized})`)();
        if (typeof result !== 'number' || !isFinite(result)) {
          return '计算结果无效';
        }
        return `🧮 ${expr} = ${result}`;
      } catch {
        return '无法计算该表达式，请检查格式';
      }
    },
  },
  {
    id: 'set_reminder',
    name: '设置提醒',
    description: '设置一个浏览器提醒通知。参数：title (提醒标题)，delay (延迟秒数，默认60秒)',
    scope: ['global'],
    handler: async (params) => {
      const title = params.title || '提醒';
      const delay = parseInt(params.delay || '60');
      if (delay < 10) return '延迟时间不能少于10秒';
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('JackYun Portal', { body: title, icon: '/Webicon.png' });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification('JackYun Portal', { body: title, icon: '/Webicon.png' });
            }
          });
        }
      }, delay * 1000);
      const minutes = Math.round(delay / 60);
      return `⏰ 已设置提醒"${title}"，将在${minutes > 0 ? `${minutes}分钟后` : `${delay}秒后`}通知你`;
    },
  },
  {
    id: 'get_weather',
    name: '天气查询',
    description: '在新标签页中打开天气查询页面。参数：city (城市名，如 Shanghai)',
    scope: ['global'],
    handler: async (params) => {
      const city = encodeURIComponent(params.city || '');
      if (city) {
        window.open(`https://www.google.com/search?q=${city}+天气`, '_blank');
        return `🌤 已打开 ${params.city} 的天气查询`;
      }
      return '请提供城市名称';
    },
  },
  {
    id: 'open_app',
    name: '打开工具',
    description: '打开一个在线工具或应用。参数：app (工具名称: google-docs|google-sheets|canva|notion|github|gmail|calendar|youtube)',
    scope: ['global'],
    handler: async (params) => {
      const appMap: Record<string, string> = {
        'google-docs': 'https://docs.google.com',
        'google-sheets': 'https://sheets.google.com',
        canva: 'https://www.canva.com',
        notion: 'https://www.notion.so',
        github: 'https://github.com',
        gmail: 'https://mail.google.com',
        calendar: 'https://calendar.google.com',
        youtube: 'https://youtube.com',
        drive: 'https://drive.google.com',
        classroom: 'https://classroom.google.com',
      };
      const app = (params.app || '').toLowerCase();
      const url = appMap[app];
      if (url) {
        window.open(url, '_blank');
        return `🚀 已打开 ${app}`;
      }
      const apps = Object.keys(appMap).join('、');
      return `未知工具，可用工具：${apps}`;
    },
  },
  {
    id: 'current_time',
    name: '查看时间',
    description: '查看当前日期和时间。参数：无',
    scope: ['global', 'quiz', 'plan', 'control', 'study_guide'],
    handler: async () => {
      const now = new Date();
      return `当前时间：${now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`;
    },
  },
];

/**
 * 辅助：将 "HH:MM" 转为分钟数（用于日程中心）
 */
function timeToMin(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 根据 scope 获取可用的工具列表
 */
export function getToolsByScope(scope: ToolScope): AiTool[] {
  return AI_TOOLS.filter((tool) => tool.scope.includes(scope));
}

/**
 * 生成用于 system prompt 的工具描述和 TTS 指引
 */
export function getToolsDescription(scope: ToolScope): string {
  const tools = getToolsByScope(scope);
  if (tools.length === 0) return '';

  return (
    '【可用工具列表】\n' +
    '当用户提出相关需求时，你可以在回复末尾的 ```tool_call 代码块中返回工具调用指令。\n' +
    '系统会自动解析并在当前页面执行该工具。\n\n' +
    tools
      .map(
        (tool, i) =>
          `${i + 1}. **${tool.name}**（ID: \`${tool.id}\`）\n   ${tool.description}\n   调用格式：\`\`\`tool_call\n   {"tool": "${tool.id}", "params": { ... }}\n   \`\`\``,
      )
      .join('\n\n') +
    '\n\n【工具调用规则】\n' +
    '1. 在回复内容的**最后**添加工具调用代码块，用 ```tool_call 包裹\n' +
    '2. 如果不需要调用工具，则不输出工具调用代码块\n' +
    '3. 先回答用户的问题，再判断是否需要调用工具\n' +
    '4. 调用结果会自动添加到对话中\n\n' +
    '【TTS 朗读语言说明（重要）】\n' +
    '用户已经设置了 TTS 朗读语言，系统只会朗读你回复中对应语言的文本。\n' +
    '如果你的回复语言和用户设置的 TTS 语言不同，请在回复末尾用 [TTS_LANG:语言代码] 标签附加一份适合朗读的译文。\n' +
    '格式：\n' +
    '[TTS_LANG:语言代码]适合朗读的文本摘要[/TTS_LANG]\n' +
    '语言代码为 "zh-CN"（中文）或 "en-US"（英文）。\n' +
    '注意：这个标签内的文本不会在聊天界面显示，也**不会**送给用户看到，只用于 TTS 朗读。\n' +
    '示例：如果 TTS 语言是英文但你用中文回复，请在末尾加上：\n' +
    '[TTS_LANG:en-US]Here is the English version for TTS.[/TTS_LANG]\n' +
    '如果回复语言和 TTS 语言一致，且没有不适合朗读的内容（表格、代码等），则不需要 [TTS_LANG] 标签。'
  );
}

/**
 * 解析 AI 回复中的工具调用
 */
export function parseToolCall(
  content: string,
): { tool: string; params: Record<string, string> } | null {
  const match = content.match(/```tool_call\n([\s\S]*?)\n```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {
      // try without tool_call marker
    }
  }

  const jsonMatch = content.match(/\{\s*"tool"\s*:\s*"(.*?)"\s*,\s*"params"\s*:\s*\{([\s\S]*?)\}\s*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return { tool: obj.tool, params: obj.params || {} };
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * 执行一个工具调用
 */
export async function executeToolCall(
  toolCall: { tool: string; params: Record<string, string> },
): Promise<string> {
  const tool = AI_TOOLS.find((t) => t.id === toolCall.tool);
  if (!tool) {
    return `错误：未找到工具 "${toolCall.tool}"`;
  }
  try {
    return await tool.handler(toolCall.params);
  } catch (err) {
    return `工具执行错误：${err instanceof Error ? err.message : String(err)}`;
  }
}