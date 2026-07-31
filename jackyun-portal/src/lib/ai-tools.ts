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
  /** 是否需要用户确认后才执行（写操作需要） */
  requiresConsent?: boolean;
  /** 确认弹窗描述：操作 + 原因 + 后果 */
  consentInfo?: (params: Record<string, string>) => string;
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
    description: '播放网易云音乐。支持两种模式：song_id (单曲ID，如 186001) 或 playlist_id (歌单ID，如 17652191106)。可选 song_name (歌曲名称)',
    scope: ['global', 'control'],
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
    description: '停止当前音乐播放。参数：无',
    scope: ['global', 'control'],
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
  // ====== 目标管理工具（从 Goal.html 复制能力） ======
  {
    id: 'read_goal_data',
    name: '读取目标数据',
    description: '读取所有目标管理的完整数据，包括名称、进度、截止日期、优先级等',
    scope: ['global'],
    handler: async () => {
      try {
        const goals = readGoalData();
        if (goals.length === 0) return '尚无目标数据';
        return goals.map((g: any) => {
          // 支持无上限任务（total=0 表示没有终点，只显示已完成数）
          const pct = g.total > 0 ? Math.round((g.done || 0) / g.total * 100) : 0;
          const deadline = g.deadline ? '截止 ' + g.deadline : '无截止日期';
          const parent = g.parentId ? '子任务(父ID:' + g.parentId + ')' : '主任务';
          const totalText = g.total > 0 ? String(g.total) : '∞（无上限）';
          return '- [' + parent + '] ' + g.name + '：进度 ' + (g.done || 0) + '/' + totalText + (g.total > 0 ? '（' + pct + '%）' : '（无限累积）') + '，' + deadline;
        }).join('\n');
      } catch (e: any) {
        return '读取目标数据出错：' + (e.message || String(e));
      }
    },
  },
  {
    id: 'manage_goal',
    name: '修改目标',
    description: '创建/修改/删除目标。参数：action(create/update/delete), id, name, desc, deadline, priority, done, total, color, parentId, unit。total 可为 0 表示无上限任务。',
    scope: ['global'],
    requiresConsent: true,
    consentInfo: (params) => `目标管理操作：${params.action === 'create' ? '创建新目标「' + (params.name || '') + '」' : params.action === 'delete' ? '删除目标 ID ' + params.id : '修改目标（ID: ' + params.id + '）'}。后果：数据将被更新并云端同步。`,
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
            parentId: params.parentId !== undefined ? (params.parentId === 'null' ? null : Number(params.parentId)) : null,
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
          return '✅ 已创建目标「' + newGoal.name + '」（ID: ' + newGoal.id + '）' + (newGoal.total === 0 ? '（无上限任务）' : '');
        } else if (action === 'update') {
          const id = Number(params.id);
          const idx = goals.findIndex((g: any) => g.id === id);
          if (idx === -1) return '❌ 未找到 ID 为 ' + id + ' 的目标';
          if (params.name !== undefined) goals[idx].name = params.name;
          if (params.desc !== undefined) goals[idx].desc = params.desc;
          if (params.deadline !== undefined) goals[idx].deadline = params.deadline || null;
          if (params.priority !== undefined) goals[idx].priority = params.priority;
          if (params.done !== undefined) goals[idx].done = Number(params.done);
          if (params.total !== undefined) {
            const totalVal = Number(params.total);
            goals[idx].total = Number.isFinite(totalVal) && totalVal >= 0 ? totalVal : goals[idx].total;
          }
          if (params.color !== undefined) goals[idx].color = params.color;
          if (params.unit !== undefined) goals[idx].unit = params.unit;
          writeGoalData(goals);
          window.dispatchEvent(new Event('storage'));
          return '✅ 已更新目标「' + goals[idx].name + '」';
        } else if (action === 'delete') {
          const id = Number(params.id);
          const newGoals = goals.filter((g: any) => g.id !== id && g.parentId !== id);
          writeGoalData(newGoals);
          window.dispatchEvent(new Event('storage'));
          return '✅ 已删除目标 ID: ' + id;
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
    description: '读取日程中心的安排，包括事件、任务和时间表',
    scope: ['global'],
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
    description: '读取 IGCSE 考试倒计时的数据，包括考试日期、计时器设置等',
    scope: ['global'],
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
    description: '修改 IGCSE 考试倒计时设置。参数：examDate (YYYY-MM-DD 格式的考试日期)',
    scope: ['global'],
    requiresConsent: true,
    consentInfo: (params) => `考试倒计时操作：将考试日期更新为 ${params.examDate || '未知日期'}。后果：顶部倒计时将立即重新计算并云端同步。`,
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
        return '请提供 examDate 参数';
      } catch (e: any) {
        return '修改倒计时出错：' + (e.message || String(e));
      }
    },
  },
  // ====== 学习进度工具 ======
  {
    id: 'read_study_progress',
    name: '读取学习进度',
    description: '读取学习计划的进度数据，包括各学科的完成情况',
    scope: ['global'],
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
    description: '读取学习计划中所有知识点的红绿灯审计状态（红/黄/绿）',
    scope: ['global'],
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
    description: '修改某个知识点的红绿灯状态。参数：subject (科目名), unit (知识点/单元名), color (green|yellow|red)',
    scope: ['global'],
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
    description: '根据 Goal 目标数据和当前学习进度，生成一份日程计划并输出到日程表。参数：date (可选，YYYY-MM-DD 格式，默认今天)',
    scope: ['global'],
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
    description: '读取日程中心的执行结果（已完成/跳过的任务），用于 AI 分析建议',
    scope: ['global'],
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
    description: '分析日程执行结果，生成增减活动的建议并反馈给用户',
    scope: ['global'],
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
    description: '读取 QuizWise 刷题记录和进度',
    scope: ['global'],
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
    '注意：这个标签不会在聊天界面显示，只用于对话列表标题。后续对话**不需要**再生成标题。'
  );
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