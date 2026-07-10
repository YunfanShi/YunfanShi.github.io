/**
 * AI 助手工具注册表 —— 定义每个 AI 助手可用的工具
 *
 * 不同 scope 的 AI 助手拥有不同的工具权限：
 * - global (主页)：全部工具
 * - quiz (QuizWise)：仅题目分析、批改、反馈
 * - plan (Studyplan)：仅学习计划相关
 * - control (Control)：仅控制和查询
 */

export type ToolScope = 'global' | 'quiz' | 'plan' | 'control';

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
    description: '跳转到一个功能页面。参数：page (control|quiz|plan|study|vocab|music|settings|goal|relax|dashboard)',
    scope: ['global'],
    handler: async (params) => {
      const pageMap: Record<string, string> = {
        control: '/Control.html',
        quiz: '/quiz.html',
        plan: '/Studyplan.html',
        study: '/Studyplan.html',
        vocab: '/Vocab.html',
        music: '/MusicPlayer.html',
        settings: '/settings',
        goal: '/Goal.html',
        relax: '/Relax.html',
        dashboard: '/dashboard',
      };
      const page = params.page?.toLowerCase() || '';
      const url = pageMap[page];
      if (url) {
        window.location.href = url;
        return `正在跳转到 ${page} 页面...`;
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

  // ====== 控制类工具 ======
  {
    id: 'start_timer',
    name: '开始计时',
    description: '在 Control 页面开始专注计时。参数：duration (分钟数)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const duration = parseInt(params.duration || '30');
      // 通过 localStorage 发送指令到 Control 页面
      localStorage.setItem(
        'warden_ai_command',
        JSON.stringify({ action: 'start_timer', duration })
      );
      window.location.href = '/Control.html';
      return `已在 Control 页面设置 ${duration} 分钟计时器`;
    },
  },
  {
    id: 'play_music',
    name: '播放音乐',
    description: '播放网易云歌单或音乐。参数：playlist_id (歌单ID)',
    scope: ['global', 'control'],
    handler: async (params) => {
      const playlistId = params.playlist_id || '17652191106';
      localStorage.setItem(
        'warden_ai_command',
        JSON.stringify({ action: 'play_music', playlistId })
      );
      window.location.href = '/Control.html';
      return `已切换到歌单`;
    },
  },

  // ====== 查询类工具 ======
  {
    id: 'get_today_schedule',
    name: '查看今日日程',
    description: '查看今天的学习计划安排。参数：无',
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
      // QuizWise 页面会监听这个 localStorage 指令
      const questionText = params.question_text || '';
      localStorage.setItem('quizwise_ai_command', JSON.stringify({ action: 'analyze', text: questionText }));
      return '已将题目发送到 QuizWise 进行分析，请打开 QuizWise 页面查看结果';
    },
  },

  // ====== 通用工具 ======
  {
    id: 'current_time',
    name: '查看时间',
    description: '查看当前日期和时间。参数：无',
    scope: ['global', 'quiz', 'plan', 'control'],
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
 * 根据 scope 获取可用的工具列表
 */
export function getToolsByScope(scope: ToolScope): AiTool[] {
  return AI_TOOLS.filter((tool) => tool.scope.includes(scope));
}

/**
 * 生成用于 system prompt 的工具描述
 */
export function getToolsDescription(scope: ToolScope): string {
  const tools = getToolsByScope(scope);
  if (tools.length === 0) return '';

  return (
    '你可以使用以下工具来帮助用户。当用户提出相应需求时，在回复末尾用 JSON 格式返回工具调用：\n' +
    tools
      .map(
        (tool) =>
          `- ${tool.name} (${tool.id})：${tool.description}`,
      )
      .join('\n') +
    '\n\n工具调用格式：{"tool": "工具ID", "params": { "参数名": "值" }}' +
    '\n请将工具调用放在回复末尾的独立代码块中，格式为 ```tool_call```'
  );
}

/**
 * 解析 AI 回复中的工具调用
 */
export function parseToolCall(
  content: string,
): { tool: string; params: Record<string, string> } | null {
  // 查找 ```tool_call 代码块
  const match = content.match(/```tool_call\n([\s\S]*?)\n```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {
      // try without tool_call marker
    }
  }

  // 尝试查找 JSON 格式的 tool call
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