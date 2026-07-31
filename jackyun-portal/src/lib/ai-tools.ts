/**
 * AI 助手工具注册表 —— 定义每个 AI 助手可用的工具 + 完整使用手册
 *
 * 不同 scope 的 AI 助手拥有不同的工具权限：
 * - global (主页)：全部工具
 * - quiz (QuizWise)：仅题目分析、批改、反馈
 * - plan (Studyplan)：仅学习计划相关
 * - control (Control)：仅控制和查询
 */

export type ToolScope = 'global' | 'dashboard' | 'quiz' | 'plan' | 'control' | 'study_guide' | 'goal' | 'study' | 'vocab' | 'music' | 'poem' | 'relax' | 'countdown' | 'settings' | 'tools';

export interface ConsentInfo {
  /** 要执行的操作描述 */
  action: string;
  /** 为什么要这么做（目的） */
  purpose: string;
  /** 可能的影响/后果 */
  consequence: string;
}

/** 工具风险等级 — 用于 YOLO/安全模式判断 */
export type ToolRiskLevel = 'low' | 'high';

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
  /** 是否需要用户确认后才执行（写操作需要） */
  requiresConsent?: boolean;
  /** 确认弹窗信息：操作 + 目的 + 后果 */
  consentInfo?: (params: Record<string, string>) => ConsentInfo;
  /** 风险等级：high 需要确认（安全模式下），low 自动通过 */
  riskLevel?: ToolRiskLevel;
}

/**
 * 工具注册表
 */
export const AI_TOOLS: AiTool[] = [
  // ====== 导航类工具 ======
  {
    id: 'navigate',
    name: '跳转到页面',
    description: `跳转到一个功能页面。

参数说明：
- page (必填)：要跳转的页面标识，可选值：
  dashboard(主页) / control(日程中心) / quiz(QuizWise刷题) / study(学习计划) / vocab(词汇) / music(音乐) / poem(诗词) / settings(设置) / goal(目标管理) / relax(放松) / study-guide(学习指导) / mock-portal(模拟考试) / tools(工具箱) / countdown(倒计时) / bilibili-sync(B站同步) / igcountdown(IG倒计时) / timetable-hub(课程表) / update-hub(更新日志) / md2word(MD转Word) / answer-sheet(答题卡)
- section (可选)：跳转到页面内的某个区域，如 timer/schedule

调用示例：
\`\`\`tool_call
{"tool": "navigate", "params": {"page": "goal"}}
\`\`\`

跳转到目标管理页面。`,
    scope: ['global', 'dashboard', 'goal', 'study', 'study_guide', 'quiz', 'vocab', 'music', 'poem', 'relax', 'countdown', 'settings', 'tools', 'control'],
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
        'update-hub': '/update',
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
      return `未知页面: ${page}。可用页面：${Object.keys(pageMap).join(', ')}`;
    },
  },
  {
    id: 'open_link',
    name: '打开外部链接',
    description: `打开一个外部链接或资源。

参数说明：
- url (必填)：完整的链接地址（需要 http:// 或 https:// 开头）

调用示例：
\`\`\`tool_call
{"tool": "open_link", "params": {"url": "https://example.com"}}
\`\`\`

会在新标签页中打开指定链接。`,
    scope: ['global', 'dashboard', 'study_guide', 'vocab', 'music', 'poem', 'relax', 'settings', 'tools'],
    handler: async (params) => {
      const url = params.url || '';
      if (url) {
        window.open(url, '_blank');
        return `已打开链接: ${url}`;
      }
      return '请提供要打开的链接（url 参数）';
    },
  },
  {
    id: 'go_back',
    name: '返回上一页',
    description: `返回浏览器上一页。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "go_back", "params": {}}
\`\`\``,
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
    description: `播放网易云音乐（通过右下角迷你播放器播放，不需要跳转页面）。

参数说明：
- song_id (可选)：网易云单曲 ID，如 "186001"
- playlist_id (可选)：网易云歌单 ID，如 "17652191106"
- song_name (可选)：歌曲名称（便于显示）
注意：song_id 和 playlist_id 至少提供一个。

调用示例（播放单曲）：
\`\`\`tool_call
{"tool": "play_music", "params": {"song_id": "186001", "song_name": "罗生门"}}
\`\`\`

调用示例（播放歌单）：
\`\`\`tool_call
{"tool": "play_music", "params": {"playlist_id": "17652191106"}}
\`\`\``,
    scope: ['global', 'dashboard', 'control', 'music', 'relax'],
    handler: async (params) => {
      const songId = params.song_id || params.songId || '';
      const playlistId = params.playlist_id || params.playlistId || '';
      const songName = params.song_name || params.songName || '';
      
      if (!songId && !playlistId) {
        return '请提供歌曲 ID（如 song_id: "186001"）或歌单 ID（如 playlist_id: "17652191106"）';
      }
      
      // 清除上次命令
      localStorage.removeItem('jackyun_ai_music_command');
      
      const detail: any = { action: 'play', timestamp: Date.now() };
      let label = '';
      
      if (songId) {
        detail.songId = songId;
        detail.type = 'song';
        detail.songName = songName;
        label = songName || `歌曲 ${songId}`;
      } else {
        detail.playlistId = playlistId;
        detail.type = 'playlist';
        detail.songName = songName || '';
        label = '歌单';
      }
      
      // 触发自定义事件让 MiniPlayer 弹出
      window.dispatchEvent(new CustomEvent('jackyun-ai-music', { detail }));
      
      // 写入 localStorage
      localStorage.setItem('jackyun_ai_music_command', JSON.stringify(detail));
      
      return `🎵 正在播放${label}，右下角可见播放器图标`;
    },
  },
  {
    id: 'stop_music',
    name: '停止播放',
    description: `停止当前音乐播放。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "stop_music", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'control', 'music', 'relax'],
    handler: async () => {
      localStorage.removeItem('jackyun_ai_music_command');
      window.dispatchEvent(new CustomEvent('jackyun-ai-music', {
        detail: { action: 'stop', timestamp: Date.now() },
      }));
      return '已停止音乐播放';
    },
  },
  {
    id: 'start_timer',
    name: '开始计时',
    description: `开始专注计时（在日程中心页面生效）。

参数说明：
- duration (可选)：分钟数，默认 30

调用示例：
\`\`\`tool_call
{"tool": "start_timer", "params": {"duration": "25"}}
\`\`\`

会启动一个 25 分钟的专注计时器。`,
    scope: ['global', 'dashboard', 'control'],
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
    description: `停止当前计时器。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "stop_timer", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'control'],
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
    description: `查看今天的完整时间表和任务安排（日程中心数据）。

参数：无（自动读取当天数据）

调用示例：
\`\`\`tool_call
{"tool": "get_schedule", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'control', 'tools'],
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
    description: `查看现在正在进行的任务。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "get_current_task", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'control'],
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
    riskLevel: 'high',
    description: `标记某个任务为已完成，或取消完成状态。

参数说明：
- task_index (必填)：任务序号（从 1 开始），对应 get_schedule 中显示的任务序号

调用示例：
\`\`\`tool_call
{"tool": "toggle_task_done", "params": {"task_index": "2"}}
\`\`\`

如果第 2 个任务未完成，则标记为完成；如果已完成，则取消完成。`,
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
    riskLevel: 'high',
    description: `跳过当前正在进行的任务（标记为跳过）。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "skip_task", "params": {}}
\`\`\``,
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
    riskLevel: 'high',
    description: `提前结束当前正在进行的任务（日程中心的「提前完成」功能）。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "finish_task_early", "params": {}}
\`\`\``,
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
    description: `查看某一天的日程安排。

参数说明：
- day_offset (必填)：偏移量，0=今天，-1=昨天，1=明天，2=后天...

调用示例（查看明天的日程）：
\`\`\`tool_call
{"tool": "switch_day", "params": {"day_offset": "1"}}
\`\`\``,
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
    description: `查看今天的学习计划安排（Studyplan 数据）。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "get_today_schedule", "params": {}}
\`\`\``,
    scope: ['global', 'plan', 'dashboard', 'study', 'study_guide'],
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
    description: `查看指定学科的学习进度。

参数说明：
- subject (必填)：学科名称，如 "Mathematics"、"Physics"、"Chemistry"、"Biology"

调用示例：
\`\`\`tool_call
{"tool": "get_progress", "params": {"subject": "Mathematics"}}
\`\`\``,
    scope: ['global', 'plan', 'dashboard', 'study', 'study_guide'],
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
    description: `查看考试或学校开学倒计时。

参数说明：
- type (必填)：倒计时类型，"exam" 考试 或 "school" 开学

调用示例：
\`\`\`tool_call
{"tool": "get_countdown", "params": {"type": "exam"}}
\`\`\``,
    scope: ['global', 'plan', 'dashboard', 'study', 'study_guide', 'countdown'],
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
    description: `分析一道考试题目，识别类型、提取答案和解析。

参数说明：
- question_text (必填)：完整的题目文本

调用示例：
\`\`\`tool_call
{"tool": "analyze_question", "params": {"question_text": "把题目文本粘贴到这里"}}
\`\`\`

会将题目发送到 QuizWise 页面进行分析。`,
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
    description: `在浏览器新标签页中打开 Google 搜索。

参数说明：
- query (必填)：搜索关键词

调用示例：
\`\`\`tool_call
{"tool": "search_web", "params": {"query": "IGCSE 数学真题"}}
\`\`\``,
    scope: ['global', 'dashboard', 'study_guide', 'vocab', 'music', 'poem', 'settings', 'tools'],
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
    description: `执行数学计算并返回结果。

参数说明：
- expression (必填)：数学表达式，如 "25*4+10"、"2*(3+5)"、"sqrt(16)"

调用示例：
\`\`\`tool_call
{"tool": "calculate", "params": {"expression": "25*4+10"}}
\`\`\``,
    scope: ['global', 'dashboard', 'quiz', 'plan', 'control', 'study_guide', 'goal', 'study', 'vocab', 'music', 'poem', 'relax', 'countdown', 'settings', 'tools'],
    handler: async (params) => {
      const expr = (params.expression || '').trim();
      if (!expr) return '请提供要计算的表达式（expression 参数）';
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
    riskLevel: 'high',
    description: `设置一个浏览器通知提醒。

参数说明：
- title (必填)：提醒标题
- delay (可选)：延迟秒数，默认 60 秒，不能少于 10 秒

调用示例（30秒后提醒做数学题）：
\`\`\`tool_call
{"tool": "set_reminder", "params": {"title": "做30分钟数学题", "delay": "1800"}}
\`\`\``,
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
    description: `在新标签页中打开天气查询页面。

参数说明：
- city (必填)：城市名，如 "Shanghai"、"Beijing"

调用示例：
\`\`\`tool_call
{"tool": "get_weather", "params": {"city": "Shanghai"}}
\`\`\``,
    scope: ['global', 'dashboard'],
    handler: async (params) => {
      const city = encodeURIComponent(params.city || '');
      if (city) {
        window.open(`https://www.google.com/search?q=${city}+天气`, '_blank');
        return `🌤 已打开 ${params.city} 的天气查询`;
      }
      return '请提供城市名称（city 参数）';
    },
  },
  {
    id: 'open_app',
    name: '打开工具',
    description: `打开一个在线工具或应用（新标签页）。

参数说明：
- app (必填)：工具名称，可选值：
  google-docs / google-sheets / canva / notion / github / gmail / calendar / youtube / drive / classroom

调用示例：
\`\`\`tool_call
{"tool": "open_app", "params": {"app": "notion"}}
\`\`\``,
    scope: ['global', 'dashboard', 'tools'],
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
    description: `查看当前日期和时间。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "current_time", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'quiz', 'plan', 'control', 'study_guide', 'goal', 'study', 'vocab', 'music', 'poem', 'relax', 'countdown', 'settings', 'tools'],
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
  // ====== 目标管理工具（从 Goal.html 复制能力） ======
  {
    id: 'read_goal_data',
    name: '读取目标数据',
    description: `读取所有目标管理的完整数据，包括名称、ID、进度、截止日期、优先级、层级关系等。

参数：无

⚠️ 重要：在修改/删除任何目标之前，必须先调用此工具获取真实 ID！

调用示例：
\`\`\`tool_call
{"tool": "read_goal_data", "params": {}}
\`\`\`

返回结果包含清晰的树形层级结构，每个目标的 ID 是关键——后续 manage_goal 操作必须使用这里返回的真实 ID。`,
    scope: ['global', 'dashboard', 'goal', 'study', 'study_guide', 'control', 'tools'],
    handler: async () => {
      try {
        const goals = readGoalData();
        if (goals.length === 0) return '尚无目标数据。可以使用 manage_goal 工具的 create 操作创建新目标。';
        
        // 构建树形结构
        const parents = goals.filter((g: any) => !g.parentId);
        const childrenMap: Record<number, any[]> = {};
        goals.forEach((g: any) => {
          if (g.parentId) {
            if (!childrenMap[g.parentId]) childrenMap[g.parentId] = [];
            childrenMap[g.parentId].push(g);
          }
        });

        const lines: string[] = [];
        lines.push(`📊 目标数据概览（共 ${goals.length} 个目标，${parents.length} 个主任务）：`);
        
        const formatGoal = (g: any, indent: string, isLast: boolean): string => {
          const pct = g.total > 0 ? Math.round((g.done || 0) / g.total * 100) : 0;
          const pctStr = g.total > 0 ? `（${pct}%）` : '（无上限）';
          const deadline = g.deadline ? `，截止 ${g.deadline}` : '';
          const priority = g.priority ? `，优先级:${g.priority}` : '';
          const totalStr = g.total > 0 ? `${g.done || 0}/${g.total}` : `已累计 ${g.done || 0}（无上限）`;
          const cat = g.cat ? `，分类:${g.cat}` : '';
          return `${lines.length > 0 ? '' : ''}${indent}${isLast ? '└─' : '├─'} ${g.name}（ID:${g.id}）进度:${totalStr}${pctStr}${deadline}${priority}${cat}`;
        };

        parents.forEach((p: any, pi: number) => {
          lines.push(`🎯 ${p.name}（ID:${p.id}）进度:${p.total > 0 ? `${p.done || 0}/${p.total}` : `已累计 ${p.done || 0}（无上限）`}${p.deadline ? `，截止 ${p.deadline}` : ''}${p.priority ? `，优先级:${p.priority}` : ''}`);
          const children = childrenMap[p.id] || [];
          children.forEach((c: any, ci: number) => {
            lines.push(formatGoal(c, '  ', ci === children.length - 1));
          });
        });

        // 独立子任务（parentId 指向不存在的主任务）
        const orphans = goals.filter((g: any) => g.parentId && !parents.some((p: any) => p.id === g.parentId));
        if (orphans.length > 0) {
          lines.push('⚠️ 孤立子任务（父任务不存在）：');
          orphans.forEach((o: any) => {
            lines.push(`  ├─ ${o.name}（ID:${o.id}，parentId:${o.parentId}）`);
          });
        }

        // 按 ID 排序的完整列表（供 AI 精确查找）
        lines.push('\n📋 按 ID 索引的完整目标列表：');
        [...goals]
          .sort((a: any, b: any) => a.id - b.id)
          .forEach((g: any) => {
            const parentName = g.parentId ? goals.find((x: any) => x.id === g.parentId)?.name || g.parentId : '主任务';
            lines.push(`  ID:${g.id} | ${g.name} | ${g.parentId ? `子任务(父:${parentName})` : '主任务'} | ${g.total > 0 ? `${g.done || 0}/${g.total}` : `累计${g.done || 0}`}${g.deadline ? ` | 截止:${g.deadline}` : ''}`);
          });

        return lines.join('\n');
      } catch (e: any) {
        return '读取目标数据出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'manage_goal',
    name: '修改目标',
    description: `创建/修改/删除目标管理的目标。

📌 重要规则：
- ⚠️ 在修改或删除目标前，你必须**先调用 read_goal_data** 获取所有目标的真实 ID！
- ❌ 不要自己凭空想象 ID，必须使用 read_goal_data 返回结果中的实际数字。
- ✅ 修改子任务的父级时，parentId 必须是 read_goal_data 返回的主任务真实 ID。

📋 参数说明：
| 参数     | 必填 | 说明 |
|---------|------|------|
| action  | ✅ 必须 | "create"(创建) / "update"(修改) / "delete"(删除) |
| id      | update/delete 必须 | 目标 ID（从 read_goal_data 获取的真实数字） |
| name    | create 建议 | 目标名称 |
| desc    | 可选 | 描述文字 |
| done    | 可选 | 已完成数量（数字） |
| total   | 可选 | 总任务量（0=无上限任务，如背单词） |
| parentId | 可选 | 父任务 ID；设为 null 或 "null" 表示独立任务 |
| deadline | 可选 | 截止日期，格式 "YYYY-MM-DD" |
| priority | 可选 | "high" / "mid" / "low" |
| color   | 可选 | 颜色："blue"/"green"/"red"/"yellow"/"purple"/"orange" |
| unit    | 可选 | 单位，如"章""页""个""篇""小时" |

✅ 正确用法示例：

1️⃣ 创建新主任务：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "create", "name": "历史", "total": "10", "unit": "章"}}
\`\`\`

2️⃣ 创建子任务（挂到主任务下）：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "create", "name": "中国近代史", "parentId": 18, "total": "5"}}
\`\`\`

3️⃣ 修改目标（更新进度）：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "update", "id": 9, "done": "3"}}
\`\`\`

4️⃣ 调整目标层级（把 ID 9 挂到 ID 8 下面）：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "update", "id": 9, "parentId": 8}}
\`\`\`

5️⃣ 批量修改（一次输出多个 tool_call 代码块）：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "update", "id": 9, "parentId": 8}}
\`\`\`
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "update", "id": 10, "parentId": 8}}
\`\`\`

6️⃣ 删除目标：
\`\`\`tool_call
{"tool": "manage_goal", "params": {"action": "delete", "id": 3}}
\`\`\`

📋 标准操作流程：
1. 先调用 read_goal_data 获取完整数据（包含所有真实 ID）
2. 根据返回的 ID 和名称确定要操作的目标
3. 一次输出所有需要的 manage_goal 调用（批量操作）
4. 操作完成后，再次调用 read_goal_data 确认结果
5. 最后如实汇报结果给用户`,
    scope: ['global', 'goal'],
    requiresConsent: true,
    riskLevel: 'high',
    consentInfo: (params) => {
      if (params.action === 'create') {
        return {
          action: `创建新目标「${params.name || '未命名'}」` + (params.total !== undefined && params.total !== '' ? `，任务量 ${params.total}` : ''),
          purpose: '将新的学习或生活目标添加到目标管理页，方便在主页/目标页跟踪进度。',
          consequence: '目标将出现在目标管理列表中并被云端同步。如不需要可以直接删除。',
        };
      }
      if (params.action === 'delete') {
        return {
          action: `删除目标（ID: ${params.id}）` + (params.name ? `「${params.name}」` : ''),
          purpose: '从目标管理中移除不再需要跟踪的目标，保持列表清晰。',
          consequence: '该目标及其所有子任务将被永久删除，删除后无法恢复！',
        };
      }
      const fieldDesc: Record<string, string> = {
        name: '名称', desc: '描述', deadline: '截止日期', priority: '优先级',
        done: '已完成数量', total: '总任务量', color: '颜色', unit: '单位', parentId: '父任务',
      };
      const fields = Object.keys(params).filter(k => !['action', 'id'].includes(k));
      const fieldLabel = fields.map(f => fieldDesc[f] || f).join('、') || '字段';
      return {
        action: `修改目标（ID: ${params.id}${params.name ? '「' + params.name + '」' : ''}）的${fieldLabel}`,
        purpose: '更新目标信息，使目标进度和数据保持最新，方便跟踪完成情况。',
        consequence: '修改的内容会立即保存并云端同步，同时主页/目标页显示将同步更新。',
      };
    },
    handler: async (params: Record<string, string>) => {
      try {
        const goals = readGoalData();
        const action = params.action || '';
        
        if (action === 'create') {
          // total: 0 表示无上限任务
          const totalVal = params.total !== undefined && params.total !== '' ? Number(params.total) : NaN;
          const newGoal: any = {
            id: Date.now(),
            name: params.name || '新目标',
            desc: params.desc || '',
            cat: params.cat || 'general',
            priority: params.priority || 'mid',
            parentId: params.parentId !== undefined ? (params.parentId === 'null' || params.parentId === '' ? null : Number(params.parentId)) : null,
            done: Number(params.done) || 0,
            total: Number.isFinite(totalVal) && totalVal >= 0 ? totalVal : 10,
            color: params.color || 'blue',
            deadline: params.deadline || null,
            unit: params.unit || '',
            createdAt: new Date().toISOString(),
            history: [],
          };
          goals.push(newGoal);
          writeGoalData(goals);
          window.dispatchEvent(new Event('storage'));
          // 同时触发自定义事件让 Goal.html 感知更新
          window.dispatchEvent(new CustomEvent('jackyun-goal-updated', { detail: { goals } }));
          return '✅ 已创建目标「' + newGoal.name + '」（ID: ' + newGoal.id + '）' + (newGoal.total === 0 ? '（无上限任务）' : '');
        } else if (action === 'update') {
          let id = Number(params.id);
          let idx = goals.findIndex((g: any) => g.id === id);
          
          // 如果按 ID 找不到，尝试按 name 模糊匹配
          if (idx === -1 && params.name) {
            const nameLower = params.name.toLowerCase();
            const matches = goals
              .map((g: any, i: number) => ({ g, i }))
              .filter(({ g }) => (g.name || '').toLowerCase().includes(nameLower) || nameLower.includes((g.name || '').toLowerCase()));
            if (matches.length === 1) {
              idx = matches[0].i;
              id = goals[idx].id;
            } else if (matches.length > 1) {
              return `⚠️ 名称「${params.name}」匹配到多个目标，请使用 read_goal_data 确认具体 ID：${matches.map(m => `ID:${m.g.id}=${m.g.name}`).join('，')}`;
            }
          }
          
          if (idx === -1) {
            // 失败时返回可用目标列表，帮助 AI 纠正
            const available = goals.map((g: any) => `  ID:${g.id} | ${g.name} | ${g.parentId ? '子任务' : '主任务'}`).join('\n');
            return `❌ 未找到 ID 为 ${params.id} 的目标。当前所有可用目标：\n${available}\n请先调用 read_goal_data 确认正确的 ID 后重试。`;
          }
          if (params.name !== undefined) goals[idx].name = params.name;
          if (params.desc !== undefined) goals[idx].desc = params.desc;
          if (params.deadline !== undefined) goals[idx].deadline = params.deadline || null;
          if (params.priority !== undefined) goals[idx].priority = params.priority;
          if (params.done !== undefined) {
            const doneVal = Number(params.done);
            goals[idx].done = Number.isFinite(doneVal) && doneVal >= 0 ? doneVal : goals[idx].done;
          }
          if (params.total !== undefined) {
            const totalVal = Number(params.total);
            goals[idx].total = Number.isFinite(totalVal) && totalVal >= 0 ? totalVal : goals[idx].total;
          }
          if (params.color !== undefined) goals[idx].color = params.color;
          if (params.unit !== undefined) goals[idx].unit = params.unit;
          if (params.parentId !== undefined) {
            const pid = params.parentId === 'null' || params.parentId === '' ? null : Number(params.parentId);
            // 防止循环引用：不能把父任务设置为自己的子任务
            if (pid !== null && pid !== goals[idx].id) {
              const isDescendant = (currentId: number | null, targetId: number): boolean => {
                if (currentId === null) return false;
                if (currentId === targetId) return true;
                const parent = goals.find((g: any) => g.id === currentId);
                return parent ? isDescendant(parent.parentId, targetId) : false;
              };
              if (!isDescendant(pid, goals[idx].id)) {
                goals[idx].parentId = pid;
              } else {
                return `❌ 无法设置：目标「${goals[idx].name}」的父任务不能是其自身或子任务`;
              }
            } else {
              goals[idx].parentId = pid;
            }
          }
          writeGoalData(goals);
          window.dispatchEvent(new Event('storage'));
          window.dispatchEvent(new CustomEvent('jackyun-goal-updated', { detail: { goals } }));
          return '✅ 已更新目标「' + goals[idx].name + '」（ID: ' + id + '）';
        } else if (action === 'delete') {
          let id = Number(params.id);
          let exists = goals.some((g: any) => g.id === id);
          
          // 如果按 ID 找不到，尝试按 name 模糊匹配
          if (!exists && params.name) {
            const nameLower = params.name.toLowerCase();
            const matches = goals.filter((g: any) => (g.name || '').toLowerCase().includes(nameLower) || nameLower.includes((g.name || '').toLowerCase()));
            if (matches.length === 1) {
              id = matches[0].id;
              exists = true;
            } else if (matches.length > 1) {
              return `⚠️ 名称「${params.name}」匹配到多个目标，请使用 read_goal_data 确认具体 ID：${matches.map(g => `ID:${g.id}=${g.name}`).join('，')}`;
            }
          }
          
          if (!exists) {
            const available = goals.map((g: any) => `  ID:${g.id} | ${g.name} | ${g.parentId ? '子任务' : '主任务'}`).join('\n');
            return `❌ 未找到 ID 为 ${params.id} 的目标。当前所有可用目标：\n${available}\n请先调用 read_goal_data 确认正确的 ID 后重试。`;
          }
          const newGoals = goals.filter((g: any) => g.id !== id && g.parentId !== id);
          writeGoalData(newGoals);
          window.dispatchEvent(new Event('storage'));
          window.dispatchEvent(new CustomEvent('jackyun-goal-updated', { detail: { goals: newGoals } }));
          return '✅ 已删除目标 ID: ' + id + '（及其所有子任务）';
        }
        return '请指定 action: create/update/delete';
      } catch (e: any) {
        return '修改目标出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 日程中心工具 ======
  {
    id: 'read_timetable',
    name: '读取日程',
    description: `读取日程中心（TimetableHub）的安排，包括事件、任务和时间表。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_timetable", "params": {}}
\`\`\`

返回最近的日程事件（最多20条）。`,
    scope: ['global', 'control'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('jackyun_control_events');
        if (!raw) return '尚无日程数据';
        const events: any[] = JSON.parse(raw);
        if (!Array.isArray(events) || events.length === 0) return '尚无日程事件';
        return events.slice(0, 20).map((e: any) =>
          '- ' + (e.title || '未命名事件') + (e.time ? ' at ' + e.time : '') + (e.done ? ' ✓已完成' : '')
        ).join('\n') + (events.length > 20 ? '\n...及另外 ' + (events.length - 20) + ' 条' : '');
      } catch (e: any) {
        return '读取日程出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 考试倒计时工具 ======
  {
    id: 'read_countdown',
    name: '读取考试倒计时',
    description: `读取 IGCSE 考试倒计时的数据，包括考试日期、计时器设置等。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_countdown", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'countdown'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('jackyun_igcountdown');
        if (!raw) return '尚无倒计时数据';
        const data: any = JSON.parse(raw);
        const examDate: string = data.examDate || data.sExamDate || '';
        const timers: any[] = data.timers || [];
        let result = '';
        if (examDate) {
          const days = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000);
          result += '考试日期：' + examDate + '（' + (days > 0 ? '还剩 ' + days + ' 天' : days === 0 ? '就是今天！' : '已超期 ' + (-days) + ' 天') + '）\n';
        }
        if (timers.length > 0) {
          result += '计时器（' + timers.length + ' 个）：\n' + timers.slice(0, 10).map((t: any) =>
            '  - ' + (t.name || '未命名') + ': ' + (t.running ? '运行中' : t.paused ? '暂停' : '已停止')
          ).join('\n');
        }
        return result || '倒计时数据为空';
      } catch (e: any) {
        return '读取倒计时出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'manage_countdown',
    name: '修改考试倒计时',
    description: `修改 IGCSE 考试倒计时设置。

参数说明：
- examDate (必填)：考试日期，格式 "YYYY-MM-DD"

调用示例：
\`\`\`tool_call
{"tool": "manage_countdown", "params": {"examDate": "2027-06-02"}}
\`\`\`

更新后，顶部倒计时会立即重新计算剩余天数。`,
    scope: ['global', 'countdown'],
    requiresConsent: true,
    riskLevel: 'high',
    consentInfo: (params) => ({
      action: `将考试日期更新为 ${params.examDate || '未知日期'}`,
      purpose: '更新考试倒计时，确保倒计时显示正确的剩余天数。',
      consequence: '顶部倒计时将立即重新计算并云端同步。如填错日期可再次修改。',
    }),
    handler: async (params: Record<string, string>) => {
      try {
        const raw = localStorage.getItem('jackyun_igcountdown');
        const data: any = raw ? JSON.parse(raw) : {};
        if (params.examDate) {
          data.examDate = params.examDate;
          localStorage.setItem('jackyun_igcountdown', JSON.stringify(data));
          window.dispatchEvent(new Event('storage'));
          return '✅ 考试日期已更新为 ' + params.examDate;
        }
        return '请提供 examDate 参数（格式 YYYY-MM-DD）';
      } catch (e: any) {
        return '修改倒计时出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 学习进度工具 ======
  {
    id: 'read_study_progress',
    name: '读取学习进度',
    description: `读取学习计划（StudyGuide）的进度数据，包括各学科的完成情况。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_study_progress", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'study_guide', 'study'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('studyguide_progress');
        if (!raw) return '尚无学习进度数据';
        const data: any = JSON.parse(raw);
        const progress = data.checklists || {};
        const keys = Object.keys(progress);
        if (keys.length === 0) return '尚无学习进度记录';
        return '学习进度（' + keys.length + ' 天有记录）：\n' + keys.slice(-7).map((k: string) => {
          const items: any = progress[k];
          const done = Object.values(items).filter((v: any) => v).length;
          const total = Object.keys(items).length;
          return '  - ' + k + ': ' + done + '/' + total;
        }).join('\n') + (keys.length > 7 ? '\n...共 ' + keys.length + ' 天' : '');
      } catch (e: any) {
        return '读取学习进度出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 红绿灯审计工具（Studyplan） ======
  {
    id: 'read_traffic_audit',
    name: '读取红绿灯审计',
    description: `读取学习计划（StudyPlan）中所有知识点的红绿灯审计状态（红/黄/绿）。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_traffic_audit", "params": {}}
\`\`\`

红色=不会/薄弱，黄色=半懂，绿色=掌握。`,
    scope: ['global', 'dashboard', 'study', 'study_guide'],
    handler: async () => {
      try {
        const prefix = 'jackyun_traffic_';
        const results: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            try {
              const data = JSON.parse(localStorage.getItem(key) || '');
              const colorMap: Record<string, string> = { '#34a853': '🟢 绿灯', '#fbbc04': '🟡 黄灯', '#ea4335': '🔴 红灯' };
              results.push(`- ${data.subject} | ${data.unit}: ${colorMap[data.color] || data.color} (${data.date || ''})`);
            } catch {}
          }
        }
        return results.length > 0
          ? '红绿灯审计数据（' + results.length + ' 项）：\n' + results.join('\n')
          : '还没有红绿灯审计记录。请在 学习计划 页面为知识点打分。';
      } catch (e: any) {
        return '读取红绿灯审计出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'manage_traffic_audit',
    name: '修改红绿灯审计',
    riskLevel: 'high',
    description: `修改某个知识点的红绿灯状态（在学习计划页面生效）。

参数说明：
- subject (必填)：科目名，如 "Mathematics"、"Physics"
- unit (必填)：知识点/单元名
- color (必填)：状态颜色，green(绿灯/掌握) / yellow(黄灯/半懂) / red(红灯/不会)

调用示例：
\`\`\`tool_call
{"tool": "manage_traffic_audit", "params": {"subject": "Mathematics", "unit": "Quadratic Equations", "color": "green"}}
\`\`\``,
    scope: ['global', 'study'],
    handler: async (params) => {
      try {
        const { subject, unit, color } = params;
        if (!subject || !unit || !color) return '请提供 subject、unit、color 参数';
        const colorMap: Record<string, string> = {
          'green': '#34a853', 'yellow': '#fbbc04', 'red': '#ea4335',
          '绿灯': '#34a853', '黄灯': '#fbbc04', '红灯': '#ea4335',
        };
        const hexColor = colorMap[color] || '';
        if (!hexColor) return 'color 必须是 green/yellow/red';
        const key = `jackyun_traffic_${subject}|${unit}`;
        localStorage.setItem(key, JSON.stringify({
          color: hexColor,
          date: new Date().toISOString().slice(0, 10),
          subject,
          unit,
        }));
        // 同步到 caie_progress_v2_1
        try {
          const progress = JSON.parse(localStorage.getItem('caie_progress_v2_1') || '{}');
          progress[`${subject}|${unit}|traffic`] = true;
          localStorage.setItem('caie_progress_v2_1', JSON.stringify(progress));
        } catch {}
        return '✅ 已更新「' + subject + ' | ' + unit + '」红绿灯状态为 ' + color;
      } catch (e: any) {
        return '修改红绿灯审计出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 日程生成器 → 日程中心 联动工具 ======
  {
    id: 'create_schedule_from_goal',
    name: '从目标生成日程',
    riskLevel: 'high',
    description: `根据 Goal 目标数据和当前学习进度，生成一份日程计划并输出到日程中心。

参数说明：
- date (可选)：目标日期，"YYYY-MM-DD" 格式，默认今天

调用示例：
\`\`\`tool_call
{"tool": "create_schedule_from_goal", "params": {}}
\`\`\`

会读取所有目标数据、红绿灯状态，自动生成合理的时间安排。`,
    scope: ['global', 'control', 'goal'],
    handler: async (params) => {
      try {
        // 读取 Goal 数据
        const goalRaw = localStorage.getItem('jackyun_goal_data');
        const goals = goalRaw ? JSON.parse(goalRaw) : [];
        // 读取学习进度
        const progressRaw = localStorage.getItem('caie_progress_v2_1');
        const progress = progressRaw ? JSON.parse(progressRaw) : {};
        // 读取红绿灯审计
        const trafficData: any[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('jackyun_traffic_')) {
            try {
              trafficData.push(JSON.parse(localStorage.getItem(key) || ''));
            } catch {}
          }
        }

        const targetDate = params.date || new Date().toISOString().slice(0, 10);
        const redCount = trafficData.filter((t: any) => t.color === '#ea4335').length;
        const yellowCount = trafficData.filter((t: any) => t.color === '#fbbc04').length;

        // 生成日程
        const schedule = [
          { time: '09:00-10:00', task: '🗂 学习计划回顾', detail: '查看今日目标和红绿灯状态', done: false },
        ];
        if (redCount > 0) schedule.push({ time: '10:00-11:00', task: `🔴 红灯复习（${redCount} 个知识点）`, detail: '回课本看引言+定义，闭卷抄公式', done: false });
        if (yellowCount > 0) schedule.push({ time: '11:00-11:30', task: `🟡 黄灯复习（${yellowCount} 个知识点）`, detail: '制作 Anki 卡片', done: false });
        goals.slice(0, 3).forEach((g: any, i: number) => {
          if (g.done < g.total) {
            schedule.push({ time: `${14 + i}:00-${15 + i}:00`, task: `🎯 ${g.name}`, detail: `进度 ${g.done}/${g.total}`, done: false });
          }
        });
        if (schedule.length <= 1) schedule.push({ time: '14:00-15:00', task: '📚 自由学习', detail: '安排当前最需要提升的科目', done: false });

        localStorage.setItem('jackyun_schedule_output', JSON.stringify({
          date: targetDate,
          schedule,
          generatedAt: new Date().toISOString(),
          source: 'ai-schedule-generator',
        }));
        // 输出给日程中心 (w3_schedule)
        const w3Schedule = schedule.map((s: any) => ({
          start: s.time.split('-')[0],
          end: s.time.split('-')[1],
          cat: 'AI',
          detail: `${s.task} (${s.detail || ''})`,
          done: false,
        }));
        localStorage.setItem('w3_schedule', JSON.stringify(w3Schedule));
        window.dispatchEvent(new Event('storage'));
        return '✅ 已生成今日日程（' + schedule.length + ' 个时间段）并同步到日程中心。\n' +
          schedule.map((s: any, i: number) => `${i + 1}. ${s.time} ${s.task}`).join('\n');
      } catch (e: any) {
        return '生成日程出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'read_schedule_results',
    name: '读取日程执行结果',
    description: `读取日程中心（TimetableHub）的执行结果（已完成/跳过的任务），用于分析建议。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_schedule_results", "params": {}}
\`\`\``,
    scope: ['global', 'dashboard', 'control'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('w3_schedule');
        if (!raw) return '尚无日程数据';
        const tasks = JSON.parse(raw);
        if (!Array.isArray(tasks) || tasks.length === 0) return '日程表为空';
        const doneCount = tasks.filter((t: any) => t.done).length;
        const skippedCount = tasks.filter((t: any) => t.skipped).length;
        const taskList = tasks.map((t: any, i: number) =>
          `  ${i + 1}. ${t.detail || t.task || '任务'} (${t.start}-${t.end}) ${t.done ? '✅' : t.skipped ? '⏭️' : '⬜'}`
        ).join('\n');
        return `📋 日程执行结果（完成 ${doneCount}/${tasks.length}，跳过 ${skippedCount}）：\n${taskList}`;
      } catch (e: any) {
        return '读取执行结果出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'analyze_schedule_and_suggest',
    name: '分析日程并建议',
    description: `分析日程执行结果，生成学习建议。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "analyze_schedule_and_suggest", "params": {}}
\`\`\`

基于完成率和跳过任务数给出优化建议。`,
    scope: ['global', 'dashboard', 'control'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('w3_schedule');
        if (!raw) return '需要先有日程数据才能分析';
        const tasks = JSON.parse(raw);
        const doneCount = tasks.filter((t: any) => t.done).length;
        const skippedCount = tasks.filter((t: any) => t.skipped).length;
        const completionRate = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

        let suggestions: string[] = [];
        if (completionRate >= 80) {
          suggestions.push('✅ 完成率很高！可以考虑增加 1 个新的学习任务');
        } else if (completionRate >= 50) {
          suggestions.push('📊 完成率不错，建议减少一些任务量，保证质量');
        } else {
          suggestions.push('⚠️ 完成率偏低，建议大幅减少任务量，聚焦最重要的 2-3 项');
        }
        if (skippedCount > 0) {
          suggestions.push('🔄 有 ' + skippedCount + ' 个任务被跳过，建议检查是否任务设置过大或时间冲突');
        }
        return `📊 日程分析（完成率 ${completionRate}%）：\n` + suggestions.join('\n');
      } catch (e: any) {
        return '分析日程出错：' + (e.message || String(e));
      }
    },
  },
  // ====== Quiz 刷题数据工具 ======
  {
    id: 'read_quiz_data',
    name: '读取刷题数据',
    description: `读取 QuizWise 刷题记录和进度。

参数：无

调用示例：
\`\`\`tool_call
{"tool": "read_quiz_data", "params": {}}
\`\`\``,
    scope: ['global', 'quiz', 'dashboard'],
    handler: async () => {
      try {
        const raw = localStorage.getItem('quizwise_current_questions');
        if (!raw) return '尚无刷题数据';
        const data: any = JSON.parse(raw);
        const questions = data.questions || data;
        const count = Array.isArray(questions) ? questions.length : 0;
        return '刷题数据：' + count + ' 道题目' + (data.subject ? '，科目：' + data.subject : '');
      } catch (e: any) {
        return '读取刷题数据出错：' + (e.message || String(e));
      }
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
 * 读取目标数据的辅助：同时读取 gt_v6（Goal.html 实际存储）和 jackyun_goal_data（云端同步 key）
 */
function readGoalData(): any[] {
  // 优先读取 jackyun_goal_data（云端同步的 key）
  const cloudRaw = localStorage.getItem('jackyun_goal_data');
  if (cloudRaw) {
    try {
      const data = JSON.parse(cloudRaw);
      if (Array.isArray(data)) return data;
    } catch {}
  }
  // 回退读取 gt_v6（Goal.html 实际使用的 key）
  const v6Raw = localStorage.getItem('gt_v6');
  if (v6Raw) {
    try {
      const data = JSON.parse(v6Raw);
      if (Array.isArray(data)) return data;
    } catch {}
  }
  return [];
}

/**
 * 写入目标数据的辅助：同时写入 gt_v6 和 jackyun_goal_data
 */
function writeGoalData(goals: any[]): void {
  localStorage.setItem('gt_v6', JSON.stringify(goals));
  localStorage.setItem('jackyun_goal_data', JSON.stringify(goals));
  
  // 触发自定义事件，让同页面的 Goal.html 也能感知（即使不在 iframe 中）
  try {
    window.dispatchEvent(new CustomEvent('jackyun-goal-updated', { detail: { goals } }));
  } catch {}
}

/**
 * 根据 scope 获取可用的工具列表
 */
export function getToolsByScope(scope: ToolScope): AiTool[] {
  return AI_TOOLS.filter((tool) => tool.scope.includes(scope));
}

/**
 * 平台功能目录 — 让 AI 知道整个平台有哪些页面和功能
 * 但不会注入具体工具描述，AI 需要时通过 request_page_tools 按需获取
 */
export function getPlatformOverview(): string {
  return `【平台功能目录】
你所在的 JackYun Portal 包含以下功能页面。当前页面已直接提供相关工具，其他页面的能力可按需获取：

- 🏠 主页 (dashboard)：全局概览、快速访问所有数据
- 🎯 目标管理 (goal)：创建/修改/删除目标、调整层级、跟踪进度
- 📋 日程中心 (control)：查看今日日程、标记完成/跳过、启动计时器、生成日程
- 📚 学习计划 (study)：查看学习计划、学科进度、红绿灯审计
- 📖 学习指导 (study-guide)：每日学习进度、学习建议
- 🧠 QuizWise (quiz)：刷题、分析题目、批改答案
- 📝 词汇宝库 (vocab)：英语词汇管理
- 🎵 音乐播放器 (music)：播放/停止网易云音乐
- 📜 诗词天地 (poem)：浏览背诵经典诗词
- 🎮 放松一下 (relax)：游戏娱乐、播放音乐
- ⏱ 倒计时 (countdown)：查看/修改考试倒计时
- ⚙️ 设置 (settings)：AI、TTS、语言、账户配置
- 🧰 工具箱 (tools)：计算、搜索、打开在线工具

📌 **按需获取其他页面工具：**
如果用户需要操作**非当前页面**的功能数据，你可以调用 \`request_page_tools\` 工具获取该页面的完整工具手册。
\`\`\`tool_call
{"tool": "request_page_tools", "params": {"page": "goal"}}
\`\`\`
获取后即可在当前对话中继续使用这些工具（系统会将工具描述注入后续消息）。`;
}

/**
 * 生成用于 system prompt 的工具描述 — 完整操作手册
 */
export function getToolsDescription(scope: ToolScope): string {
  const tools = getToolsByScope(scope);

  const baseToolsDesc = tools.length > 0
    ? '【可用工具完整手册】\n' +
      '当用户提出相关需求时，你可以在回复末尾使用 ```tool_call 代码块调用工具。\n' +
      '系统会自动解析并在当前页面执行。你可以连续多轮调用工具完成任务，直到目标达成。\n\n' +
      tools
        .map((tool, i) => {
          return `━━━ 工具 ${i + 1}/${tools.length}：${tool.name}（ID: \`${tool.id}\`）━━━\n` +
            `${tool.description}`;
        })
        .join('\n\n')
    : '';

  return baseToolsDesc +
    (baseToolsDesc ? '\n\n' : '') +
    '【按需工具：request_page_tools】\n' +
    '如果你需要操作**当前页面没有**的其他功能数据，调用此工具获取目标页面的工具描述：\n' +
    '- page (必填)：目标页面标识，可选值：goal / control / study / study-guide / quiz / vocab / music / poem / relax / countdown / tools / settings\n' +
    '调用示例：\n' +
    '```tool_call\n' +
    '{"tool": "request_page_tools", "params": {"page": "goal"}}\n' +
    '```\n' +
    '系统会返回该页面的所有可用工具描述，之后你就可以正常使用了。\n\n' +
    '【工具调用规则（极其重要，必须遵守）】\n' +
    '1. 📖 **先读后改（铁律）**：任何修改/删除操作之前，必须先调用对应的读取工具获取真实数据。例如修改目标前必须先调用 read_goal_data。\n' +
    '2. 🔢 **不编造 ID**：所有目标 ID、任务序号等必须来自读取工具返回的实际数据。如果工具返回 ❌ 错误，说明参数有误，分析原因后重试。\n' +
    '3. ⚡ **批量执行**：如果一次需要执行多个操作（比如批量调整多个目标的层级），在同一个回复中输出**多个** ```tool_call 代码块。系统会串行执行它们。\n' +
    '4. ✅ **确认后再汇报**：所有工具调用完成后，回顾每条工具执行结果。如果存在 ❌ 错误，必须在最终总结中明确指出哪些操作失败、为什么失败。\n' +
    '5. 🚫 **诚实原则**：严禁在工具失败时编造「已全部完成」「全部成功」等虚假总结！必须如实汇报每项操作的成功/失败状态。\n' +
    '6. 🔄 **纠错能力**：如果工具返回错误（如 ❌ 未找到 ID），先分析返回的可用数据列表，然后使用正确的参数重新调用。\n' +
    '7. 📊 **最终总结**：任务完成后，给出**完整的总结**，包含成功项和失败项，以及当前的最新状态。\n' +
    '8. 📌 **数据读取效率规则（重要！）**：\n' +
    '   - 同一个数据源只需读取一次。如果对话历史中已有该数据（例如已调用过 read_goal_data），直接使用已有数据分析和回复，**不要重复调用**同一个读取工具。\n' +
    '   - 只有在该数据**可能已被修改**（比如你执行了写入操作 manage_goal / manage_countdown / toggle_task_done 之后）或用户明确要求刷新数据时，才需要重新读取。\n' +
    '   - 重复调用相同工具获取相同数据是浪费且低效的。\n' +
    '9. ✅ **任务完成标记（每次回复都必须判断！）**：\n' +
    '   - 当你确定用户的所有需求已经完成后，在**最终回复的末尾**添加标记 `[TASK_COMPLETE]`。\n' +
    '   - 系统检测到该标记后会**立即结束任务**并展示统计（用时、轮数、Token、费用），不再继续调用工具。\n' +
    '   - 如果还需要调用工具，则**不要添加**该标记，让系统继续执行下一轮推理。\n' +
    '   - 注意：`[TASK_COMPLETE]` 必须放在所有回复内容的最末尾，不要放在 tool_call 代码块内。\n\n' +
    '【TTS 朗读语言说明（非常重要，必须遵守）】\n' +
    '用户已经设置了 TTS 朗读语言，只能用你回复中与 TTS 语言一致的部分进行朗读。\n' +
    '语言代码为 "zh-CN"（中文）或 "en-US"（英文）。\n\n' +
    '**规则：**\n' +
    '1. 回复中必须包含一个 [TTS_LANG:对应语言]...[/TTS_LANG] 标签，标签内是你用 TTS 语言写的**简短朗读摘要**（2-3句话概括核心内容，不要放表格、代码、列表）。\n' +
    '2. 标签放在回复最后，这个标签内的文本不会在聊天界面显示，只用于 TTS 朗读。\n' +
    '3. 如果用户设置了英文 TTS，你的回复正文可以用中文，但 [TTS_LANG:en-US] 标签内必须是英文；反之亦然。\n' +
    '4. 如果回复正文本身就是 TTS 语言写的，且没有不适合朗读的内容，则 [TTS_LANG] 标签内的内容可省略。\n\n' +
    '【对话标题生成（仅第一次对话需要）】\n' +
    '如果这是本次对话的**第一条用户消息**（对话刚开始），你需要在回复最后额外添加一个 [TITLE] 标签，为本次对话生成一个简短标题（10-30字，概括用户本次对话的核心意图）。\n' +
    '格式：\n' +
    '[TITLE]简短标题[/TITLE]\n' +
    '注意：这个标签不会在聊天界面显示，只用于对话列表标题。后续对话**不需要**再生成标题。';
}

/**
 * 解析 AI 回复中的工具调用（支持多个）
 */
export function parseToolCall(
  content: string,
): { tool: string; params: Record<string, string> } | null {
  const calls = parseToolCalls(content);
  return calls.length > 0 ? calls[0] : null;
}

/**
 * 解析 AI 回复中的所有工具调用（返回数组，支持一次性执行多个工具）
 */
export function parseToolCalls(
  content: string,
): Array<{ tool: string; params: Record<string, string> }> {
  const results: Array<{ tool: string; params: Record<string, string> }> = [];

  // 1. 匹配 ```tool_call\n{...}\n``` 格式
  const toolCallRegex = /```tool_call\n([\s\S]*?)\n```/g;
  let match;
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const obj = JSON.parse(match[1].trim());
      results.push({ tool: obj.tool, params: obj.params || {} });
    } catch {
      // skip invalid
    }
  }

  // 2. 如果没找到 tool_call 代码块，尝试匹配裸 JSON 格式
  if (results.length === 0) {
    const bareJsonRegex = /\{\s*"tool"\s*:\s*"(.*?)"\s*,\s*"params"\s*:\s*\{([\s\S]*?)\}\s*\}/g;
    while ((match = bareJsonRegex.exec(content)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        results.push({ tool: obj.tool, params: obj.params || {} });
      } catch {
        // skip invalid
      }
    }
  }

  return results;
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

// ─────────────────────────────────────────────────────────────
// 页面数据全景图 — 告诉 AI 当前页面有什么数据可以读/写
// ─────────────────────────────────────────────────────────────

export type ConversationSource = 'dashboard' | 'control' | 'study-guide' | 'study' | 'quiz' | 'vocab' | 'music' | 'poem' | 'settings' | 'goal' | 'relax' | 'countdown' | 'tools' | 'other';

export function getPageContext(source: ConversationSource): string {
  const contexts: Record<ConversationSource, string> = {
    dashboard: `📊 当前页面数据全景图

你在「主页仪表盘 (Dashboard)」。以下是这个页面上所有你可以读取或操作的数据：

【🎯 目标管理数据】（localStorage key: jackyun_goal_data / gt_v6）
  📖 可读取：目标名称、ID、进度(done/total)、截止日期、优先级、颜色、层级关系、分类
  ✏️ 可操作：创建/修改/删除目标、调整进度、调整层级（父子关系）
  🛠 使用工具：read_goal_data（先读取）→ manage_goal（再修改）

【📋 日程中心数据】（localStorage key: w3_schedule / jackyun_control_events）
  📖 可读取：今日日程时间段、任务名称、完成/跳过状态
  ✏️ 可操作：标记任务完成/取消、跳过任务、查看当前任务
  🛠 使用工具：get_schedule、get_current_task、toggle_task_done、skip_task、read_schedule_results

【📚 学习计划数据】（localStorage key: caie_schedule_current / caie_progress_v2_1 / caie_syllabus_v3）
  📖 可读取：今日学习计划、各学科进度、考试/开学倒计时
  ✏️ 可操作：（只读）
  🛠 使用工具：get_today_schedule、get_progress、get_countdown

【🚦 红绿灯审计数据】（localStorage key: jackyun_traffic_*）
  📖 可读取：各科目各单元的红绿灯状态（红/黄/绿）
  ✏️ 可操作：修改知识点红绿灯状态
  🛠 使用工具：read_traffic_audit、manage_traffic_audit

【⏱ 考试倒计时数据】（localStorage key: jackyun_igcountdown）
  📖 可读取：考试日期、计时器设置
  ✏️ 可操作：修改考试日期
  🛠 使用工具：read_countdown、manage_countdown

【🧠 QuizWise 刷题数据】（localStorage key: quizwise_current_questions）
  📖 可读取：刷题记录、科目
  ✏️ 可操作：（只读）
  🛠 使用工具：read_quiz_data

【📖 学习指导数据】（localStorage key: studyguide_progress）
  📖 可读取：每日学习进度
  ✏️ 可操作：（只读）
  🛠 使用工具：read_study_progress

【其他实用能力】
  🎵 播放/停止网易云音乐（play_music / stop_music）
  ⏱ 设置专注计时器（start_timer / stop_timer）
  🔍 搜索网页（search_web）、计算（calculate）、设置提醒（set_reminder）、查看时间（current_time）
  🚀 打开在线工具（open_app）、查看天气（get_weather）
  🗺 跳转到任何功能页（navigate）、打开外链（open_link）

【🗓 日程智能联动】
  🛠 create_schedule_from_goal：根据目标和红绿灯状态自动生成今日日程
  🛠 analyze_schedule_and_suggest：分析日程完成率并给出建议

当用户提出需求时，先判断需要哪些数据，再按流程：读取数据 → 分析 → 执行修改 → 确认结果 → 汇报。`,
    control: `📊 当前页面数据全景图

你在「日程中心 (Control/TimetableHub)」。以下是这个页面上所有你可以读取或操作的数据：

【📋 日程安排数据】（localStorage key: w3_schedule / jackyun_control_events）
  📖 可读取：今日日程（时间段、任务名、类别、完成状态）、当前任务、执行结果
  ✏️ 可操作：标记任务完成/取消（切换done）、跳过任务、提前完成任务
  🛠 使用工具：get_schedule、get_current_task、toggle_task_done、skip_task、finish_task_early、switch_day、read_schedule_results、analyze_schedule_and_suggest

【⏱ 计时器控制】
  ✏️ 可操作：开始/停止专注计时
  🛠 使用工具：start_timer、stop_timer

【🎵 音乐播放】
  ✏️ 可操作：播放/停止网易云音乐
  🛠 使用工具：play_music、stop_music

【🎯 目标数据】
  📖 可读取：目标进度（用于分析日程与目标的关联）
  🛠 使用工具：read_goal_data（只读建议）

【🗓 日程生成】
  ✏️ 可操作：根据目标和红绿灯状态生成日程
  🛠 使用工具：create_schedule_from_goal

用户可以在日程中心管理时间安排。你可以帮他查看日程、标记完成、调整计划。`,
    'study-guide': `📊 当前页面数据全景图

你在「学习指导 (StudyGuide)」。以下是这个页面上所有你可以读取或操作的数据：

【📖 学习进度数据】（localStorage key: studyguide_progress）
  📖 可读取：每日学习进度（checklist 勾选情况）
  ✏️ 可操作：（只读）
  🛠 使用工具：read_study_progress

【📚 学习计划数据】（localStorage key: caie_schedule_current / caie_progress_v2_1 / caie_syllabus_v3）
  📖 可读取：今日学习计划、各学科进度、考试/开学倒计时
  🛠 使用工具：get_today_schedule、get_progress、get_countdown

【🚦 红绿灯审计数据】（localStorage key: jackyun_traffic_*）
  📖 可读取/操作：知识点红绿灯状态
  🛠 使用工具：read_traffic_audit、manage_traffic_audit

【其他实用能力】
  🔍 搜索网页、🧮 计算、🕐 查看时间

页面提供「今日」「学习」「习题」「考试」四大板块，帮助用户掌握高效学习方法。`,
    study: `📊 当前页面数据全景图

你在「学习计划 (StudyPlan)」。以下是这个页面上所有你可以读取或操作的数据：

【📚 学习计划数据】（localStorage key: caie_schedule_current / caie_progress_v2_1 / caie_syllabus_v3 / caie_settings_v2_1）
  📖 可读取：今日安排、各学科单元进度、考试/开学日期
  🛠 使用工具：get_today_schedule、get_progress、get_countdown

【🚦 红绿灯审计数据】（localStorage key: jackyun_traffic_*）
  📖 可读取：各知识点红绿灯状态
  ✏️ 可操作：修改红绿灯状态
  🛠 使用工具：read_traffic_audit、manage_traffic_audit

【🎯 目标数据】
  📖 可读取：目标进度，用于辅助学习计划
  🛠 使用工具：read_goal_data（只读建议）

【其他实用能力】
  🧮 计算、🕐 查看时间、⏱ 倒计时

用户可以学习计划页面查看和管理学习进度。`,
    quiz: `📊 当前页面数据全景图

你在「QuizWise 刷题」。以下是这个页面上所有你可以读取或操作的数据：

【🧠 刷题数据】（localStorage key: quizwise_current_questions）
  📖 可读取：当前题目列表、科目
  ✏️ 可操作：分析题目（发送到页面）
  🛠 使用工具：read_quiz_data、analyze_question

【💡 其他能力】
  🧮 计算、🕐 查看时间

用户在这里刷题和学习。你作为智能辅导老师，可以帮助分析题目、批改答案、讲解知识点。`,
    vocab: `📊 当前页面数据全景图

你在「词汇宝库 (Vocab)」。用户可以管理英语词汇、复习单词。

【其他实用能力】
  📖 可以查询单词意思（使用 search_web）
  🧮 计算、🕐 查看时间
  🎯 可以读取目标数据辅助学习规划

用户在这里管理英语词汇。`,
    music: `📊 当前页面数据全景图

你在「音乐播放器 (Music)」。

【🎵 音乐播放控制】
  ✏️ 可操作：播放/停止网易云音乐（单曲或歌单）
  🛠 使用工具：play_music、stop_music

【其他实用能力】
  🔍 搜索歌词/歌手（search_web）、🕐 查看时间

用户在这里听音乐、管理歌单。`,
    poem: `📊 当前页面数据全景图

你在「诗词天地 (Poem)」。用户可以浏览和背诵经典诗词。

【其他实用能力】
  🔍 搜索诗词（search_web）、🧮 计算、🕐 查看时间

用户在这里浏览诗词、背诵经典。`,
    settings: `📊 当前页面数据全景图

你在「设置页面 (Settings)」。用户在这里配置 AI、TTS、语言、账户等。

【其他实用能力】
  🕐 查看时间、🧮 计算、🔍 搜索

帮助用户了解设置在什么位置、如何配置。`,
    goal: `📊 当前页面数据全景图

你在「目标管理 (Goal)」。以下是这个页面上所有你可以读取或操作的数据：

【🎯 目标管理数据】（localStorage key: jackyun_goal_data / gt_v6）
  📖 可读取：所有目标的完整数据，包括：
    - 目标ID（重要！修改时必须使用）
    - 名称、描述（name / desc）
    - 进度（done / total，total=0表示无上限任务）
    - 截止日期（deadline）
    - 优先级（priority: high/mid/low）
    - 颜色（color）
    - 分类（cat）
    - 层级关系（parentId：null=主任务，数字=子任务）
    - 单位（unit）
  ✏️ 可操作：
    - 创建新目标（主任务或子任务）
    - 修改目标名称、描述、进度、总量、截止日期、优先级、颜色、单位
    - 调整目标层级（把子任务挂到主任务下 / 设为独立任务）
    - 删除目标（含所有子任务）
  🛠 使用工具：
    - read_goal_data（读取所有目标）— 修改前必须调用！
    - manage_goal（创建/修改/删除）— 参数：action, id, name, done, total, parentId, deadline, priority, color, unit, desc

📌 重要提示：
1. 修改/删除目标前，**必须先调用 read_goal_data** 获取真实 ID！
2. 不要凭空猜测 ID，必须使用 read_goal_data 返回的实际数字
3. 批量操作时，在同一个回复中输出多个 manage_goal 调用

【📋 日程联动】
  🛠 create_schedule_from_goal：根据目标生成日程

用户在目标管理页面跟踪所有学习/生活目标的进度。你作为智能助手，可以帮助创建目标、调整层级、更新进度。`,
    relax: `📊 当前页面数据全景图

你在「放松一下 (Relax)」。提供游戏和娱乐功能。

【其他实用能力】
  🎵 播放音乐（play_music / stop_music）
  🕐 查看时间、🧮 计算

用户在这里放松娱乐。`,
    countdown: `📊 当前页面数据全景图

你在「倒计时 (Countdown)」。用户可以查看重要日期倒计时。

【⏱ 倒计时数据】（localStorage key: jackyun_igcountdown / cd_v2）
  📖 可读取：考试日期、计时器设置
  ✏️ 可操作：修改考试日期
  🛠 使用工具：read_countdown、manage_countdown、get_countdown

【其他实用能力】
  🕐 查看时间、🧮 计算

用户在这里查看和管理考试倒计时。`,
    tools: `📊 当前页面数据全景图

你在「工具箱 (Tools)」。提供各种实用小工具。

【🧰 工具箱能力】
  📝 Markdown 转 Word（页面功能）
  🧮 计算（calculate）
  🕐 查看时间（current_time）
  🔍 搜索（search_web）
  🚀 打开在线工具（open_app）

【其他数据访问】
  🎯 目标数据（read_goal_data）
  📋 日程数据（get_schedule 等）
  📚 学习进度（get_progress 等）

用户可以在这里使用各种工具。`,
    other: `📊 当前页面数据全景图

你在 JackYun Portal 中。以下是你全局可以访问的所有数据：

【🎯 目标管理】→ read_goal_data / manage_goal
【📋 日程中心】→ get_schedule / get_current_task / toggle_task_done / skip_task / read_timetable / read_schedule_results / create_schedule_from_goal / analyze_schedule_and_suggest
【📚 学习计划】→ get_today_schedule / get_progress / get_countdown / read_traffic_audit / manage_traffic_audit / read_study_progress
【⏱ 考试倒计时】→ read_countdown / manage_countdown / get_countdown
【🧠 QuizWise】→ read_quiz_data / analyze_question
【🎵 音乐】→ play_music / stop_music
【⏱ 计时器】→ start_timer / stop_timer
【🔍 搜索/工具】→ search_web / calculate / set_reminder / get_weather / open_app / current_time
【🗺 导航】→ navigate / open_link / go_back

当用户提出需求时，先判断需要哪些数据，按流程：读取 → 分析 → 修改 → 确认 → 汇报。`,
  };
  return contexts[source] || contexts.other;
}