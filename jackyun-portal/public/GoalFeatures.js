/* ============================================================
   GOAL FEATURES v3.7.0
   - 学习进度报告（今日任务 + 任务记录日历）
   - 计时悬浮小窗
   - 部署时间选项（从现在开始 / 设定时间）
   - AI 分析收起按钮
   ============================================================ */

/* ===================== 学习进度报告 ===================== */
let prCurrentTab = 'today';
let prSelectedDate = today(); // YYYY-MM-DD

function openProgressReport(){
  prCurrentTab = 'today';
  prSelectedDate = today();
  document.getElementById('prTabToday').className = 'btn btn-ai';
  document.getElementById('prTabRecords').className = 'btn btn-ghost';
  document.getElementById('prTodayView').style.display = 'block';
  document.getElementById('prRecordsView').style.display = 'none';
  renderPRToday();
  renderPRCalendar();
  openM('progressReportModal');
}

function prSwitchTab(tab){
  prCurrentTab = tab;
  const todayBtn = document.getElementById('prTabToday');
  const recBtn = document.getElementById('prTabRecords');
  if(tab === 'today'){
    todayBtn.className = 'btn btn-ai';
    recBtn.className = 'btn btn-ghost';
    document.getElementById('prTodayView').style.display = 'block';
    document.getElementById('prRecordsView').style.display = 'none';
    renderPRToday();
  } else {
    todayBtn.className = 'btn btn-ghost';
    recBtn.className = 'btn btn-ai';
    document.getElementById('prTodayView').style.display = 'none';
    document.getElementById('prRecordsView').style.display = 'block';
    renderPRCalendar();
  }
}

// 获取今天的计划任务 + 完成记录
function prGetTodayData(){
  const plan = loadDailyPlan();
  const t = today();
  const todayHistory = {};
  // 汇总所有目标今天的历史记录（非历史累积）
  goals.forEach(g=>{
    if(g.parentId === null && goals.some(c=>c.parentId === g.id)) return; // skip parents with children
    (g.history||[]).forEach(h=>{
      if(h.date === t && !h.isHistorical) {
        todayHistory[g.id] = { name: g.name, done: h.done != null ? h.done : g.done, total: h.total || g.total, note: h.note || '' };
      }
    });
    // 额外记录（不在计划中但完成了的）
    (g.sessions||[]).forEach(s=>{
      if(s.date === t) {
        if(!todayHistory[g.id]) todayHistory[g.id] = { name: g.name, done: 0, total: g.total, note: s.note || '' };
        todayHistory[g.id]._sessions = (todayHistory[g.id]._sessions||0) + (s.minutes||0);
      }
    });
  });
  return { planItems: plan.items, todayHistory, total: getTodayItemTotal() };
}

function renderPRToday(){
  const el = document.getElementById('prTodayView');
  if(!el) return;
  const { planItems, todayHistory, total } = prGetTodayData();
  
  let html = '<div style="margin-bottom:10px;font-size:13px;color:var(--text2);">📅 ' + today() + ' · 计划总耗时 ' + total + 'min</div>';
  
  // 今日计划任务
  if(planItems.length){
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text3);margin-bottom:7px;">📋 今日计划</div>';
    html += planItems.map(item=>{
      const g = goals.find(x=>x.id===item.goalId);
      const color = g ? gc(g.color).hex : '#4d9ef7';
      const h = item.goalId != null ? todayHistory[item.goalId] : null;
      const done = !!(h && (h.done > 0 || h._sessions));
      const estMin = (item.count||1)*(item.estMin||30);
      const useTime = h && h._sessions ? h._sessions : 0;
      return `<div style="display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:6px;">
        <span class="today-item-dot" style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <span style="flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.name||(g?g.name:'任务'))}</span>
        <span style="font-size:11px;color:var(--text3);font-family:var(--mono);">⏱ ${estMin}min${useTime?` → 已用 ${useTime}min`:''}</span>
        <button class="btn btn-ico" style="flex-shrink:0;" onclick="prQuickSubmit(${item.goalId != null ? item.goalId : 'null'})" title="快速提交">📝</button>
        <span style="font-size:13px;color:${done?'var(--green)':'var(--text3)'};">${done?'✅':'⬜'}</span>
      </div>`;
    }).join('');
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px;">今天还没有计划任务<br><span style="font-size:11px;">在「今日计划」中添加或让 AI 帮你规划</span></div>';
  }

  // 完成记录（计划内 + 额外）
  const extraRecords = [];
  const plannedDone = [];
  goals.forEach(g=>{
    if(g.parentId === null && goals.some(c=>c.parentId === g.id)) return;
    (g.history||[]).forEach(h=>{
      if(h.date === today() && !h.isHistorical){
        if(planItems.some(p=>p.goalId === g.id)) plannedDone.push({ name: g.name, done: h.done, total: h.total, note: h.note });
        else extraRecords.push({ name: g.name, done: h.done, total: h.total, note: h.note, kind: 'add' });
      }
    });
    (g.sessions||[]).forEach(s=>{
      if(s.date === today()){
        if(!planItems.some(p=>p.goalId === g.id)){
          extraRecords.push({ name: g.name, minutes: s.minutes, note: s.note, kind: 'session' });
        }
      }
    });
  });

  if(plannedDone.length || extraRecords.length){
    if(plannedDone.length){
      html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--green);margin:12px 0 7px;">✅ 计划内完成</div>';
      html += plannedDone.map(h=>`<div style="display:flex;align-items:center;gap:8px;background:rgba(52,199,106,.05);border:1px solid rgba(52,199,106,.15);border-radius:8px;padding:7px 11px;margin-bottom:5px;font-size:12px;"><span style="flex:1;">${esc(h.name)}</span><span style="font-family:var(--mono);color:var(--green);font-weight:600;">${h.done}/${h.total}</span>${h.note?`<span style="color:var(--text3);font-size:11px;">${esc(h.note)}</span>`:''}</div>`).join('');
    }
    if(extraRecords.length){
      html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--blue);margin:12px 0 7px;">✦ 额外完成</div>';
      html += extraRecords.map(h=>`<div style="display:flex;align-items:center;gap:8px;background:rgba(77,158,247,.05);border:1px solid rgba(77,158,247,.15);border-radius:8px;padding:7px 11px;margin-bottom:5px;font-size:12px;"><span style="flex:1;">${esc(h.name)}</span>${h.kind==='session'?`<span style="font-family:var(--mono);color:var(--blue);">+${h.minutes}min</span>`:`<span style="font-family:var(--mono);color:var(--blue);">${h.done}/${h.total}</span>`}${h.note?`<span style="color:var(--text3);font-size:11px;">${esc(h.note)}</span>`:''}</div>`).join('');
    }
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px;">今天还没有完成记录，加油！💪</div>';
  }

  el.innerHTML = html;
}

// 快速提交（从进度报告今日任务弹窗）
function prQuickSubmit(goalId){
  if(goalId != null){
    openProg(Number(goalId));
  } else {
    toast('该任务没有关联目标，请在「今日计划」中管理');
  }
}

/* ===================== 任务记录日历 ===================== */
let prCalYear, prCalMonth;
function renderPRCalendar(){
  const el = document.getElementById('prRecordsView');
  if(!el) return;
  const now = new Date();
  if(!prCalYear){ prCalYear = now.getFullYear(); prCalMonth = now.getMonth(); }
  
  const firstDay = new Date(prCalYear, prCalMonth, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(prCalYear, prCalMonth+1, 0).getDate();
  const todayStr = today();
  const monthStr = `${prCalYear}年${prCalMonth+1}月`;
  
  // 收集每天有活动记录的日期
  const activeDates = {};
  goals.forEach(g=>{
    if(g.parentId === null && goals.some(c=>c.parentId === g.id)) return;
    (g.history||[]).forEach(h=>{
      if(h.date && h.date.startsWith(`${prCalYear}-${String(prCalMonth+1).padStart(2,'0')}`)) activeDates[h.date] = true;
    });
    (g.sessions||[]).forEach(s=>{
      if(s.date && s.date.startsWith(`${prCalYear}-${String(prCalMonth+1).padStart(2,'0')}`)) activeDates[s.date] = true;
    });
  });
  // 今日计划也标记
  try{
    const plan = loadDailyPlan();
    if(plan && plan.date) activeDates[plan.date] = true;
  }catch(e){}

  let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
    <button class="btn btn-ghost" style="font-size:12px;" onclick="prCalNav(-1)">◀ 上月</button>
    <div style="flex:1;text-align:center;font-size:15px;font-weight:600;">${monthStr}</div>
    <button class="btn btn-ghost" style="font-size:12px;" onclick="prCalNav(1)">下月 ▶</button>
  </div>`;
  
  // 日历网格
  const dayNames = ['日','一','二','三','四','五','六'];
  html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px;">${dayNames.map(d=>`<div style="text-align:center;font-size:10px;color:var(--text3);font-weight:600;">${d}</div>`).join('')}</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">`;
  
  // 前导空格
  for(let i=0;i<startDow;i++) html += '<div></div>';
  
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${prCalYear}-${String(prCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const isActive = activeDates[dateStr];
    const isSelected = dateStr === prSelectedDate;
    html += `<div onclick="prSelectDate('${dateStr}')" style="cursor:pointer;border-radius:8px;padding:8px 4px;text-align:center;font-size:13px;font-family:var(--mono);background:${isSelected?'rgba(77,158,247,.2)':isToday?'rgba(52,199,106,.12)':'transparent'};border:1px solid ${isToday?'rgba(52,199,106,.4)':'transparent'};position:relative;">
      ${d}
      ${isActive?`<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:${isSelected?'var(--blue)':'var(--green)'};"></div>`:''}
    </div>`;
  }
  html += '</div>';
  
  // 图例
  html += '<div style="display:flex;gap:14px;margin:10px 0 14px;font-size:11px;color:var(--text3);"><span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);"></span> 有记录</span><span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--blue);"></span> 已选中</span></div>';
  
  // 选中日期的详情
  html += prRenderDateDetail(prSelectedDate);
  
  el.innerHTML = html;
}

function prCalNav(dir){
  prCalMonth += dir;
  if(prCalMonth < 0){ prCalMonth = 11; prCalYear--; }
  if(prCalMonth > 11){ prCalMonth = 0; prCalYear++; }
  const curSel = prSelectedDate;
  // 如果选中日期不在当前月，重置为1号
  if(!curSel || !curSel.startsWith(`${prCalYear}-${String(prCalMonth+1).padStart(2,'0')}`)){
    prSelectedDate = `${prCalYear}-${String(prCalMonth+1).padStart(2,'0')}-01`;
  }
  renderPRCalendar();
}

function prSelectDate(dateStr){
  prSelectedDate = dateStr;
  renderPRCalendar();
}

function prRenderDateDetail(dateStr){
  // 汇总该日期的所有记录
  const records = [];
  goals.forEach(g=>{
    if(g.parentId === null && goals.some(c=>c.parentId === g.id)) return;
    (g.history||[]).forEach(h=>{
      if(h.date === dateStr){
        records.push({ name: g.name, kind: h.isHistorical ? 'hist' : 'done', done: h.done != null ? h.done : g.done, total: h.total || g.total, note: h.note || '', isHistorical: h.isHistorical });
      }
    });
    (g.sessions||[]).forEach(s=>{
      if(s.date === dateStr) records.push({ name: g.name, kind: 'session', minutes: s.minutes, note: s.note || '', isHistorical: false });
    });
  });
  
  // 当日计划
  let planInfo = '';
  try{
    const planRaw = localStorage.getItem('jackyun_daily_plan');
    if(planRaw){
      const plan = JSON.parse(planRaw);
      if(plan.date === dateStr && plan.items && plan.items.length){
        planInfo = `<div style="margin-bottom:8px;font-size:11px;color:var(--text3);">📋 计划 ${plan.items.length} 个任务 · ${plan.items.reduce((s,i)=>s+(i.estMin||30),0)}min</div>`;
      }
    }
  }catch(e){}
  
  if(!records.length && !planInfo){
    return `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">📅 ${dateStr}<br><br>这一天没有记录</div>`;
  }
  
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  const d = new Date(dateStr + 'T00:00:00');
  const weekdayLabel = weekdays[d.getDay()] || '';
  
  let html = `<div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px;">
    <div style="font-size:14px;font-weight:600;margin-bottom:10px;">📅 ${dateStr} ${weekdayLabel}</div>
    ${planInfo}`;
  
  if(records.length){
    // 按完成类型分组
    const done = records.filter(r=>r.kind==='done');
    const hist = records.filter(r=>r.kind==='hist');
    const sessions = records.filter(r=>r.kind==='session');
    
    if(done.length){
      html += `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:5px;">✅ 完成</div>`;
      html += done.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="flex:1;">${esc(r.name)}</span><span style="font-family:var(--mono);color:var(--green);">${r.done}/${r.total}</span>${r.note?`<span style="color:var(--text3);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.note)}</span>`:''}</div>`).join('');
    }
    if(sessions.length){
      const totalMin = sessions.reduce((s,x)=>s+(x.minutes||0),0);
      html += `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--blue);margin:8px 0 5px;">⏱ 专注 ${totalMin}min</div>`;
      html += sessions.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="flex:1;">${esc(r.name)}</span><span style="font-family:var(--mono);color:var(--blue);">+${r.minutes}min</span>${r.note?`<span style="color:var(--text3);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.note)}</span>`:''}</div>`).join('');
    }
    if(hist.length){
      html += `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin:8px 0 5px;">📦 历史累积</div>`;
      html += hist.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="flex:1;">${esc(r.name)}</span><span style="font-family:var(--mono);color:var(--text3);">${r.done}/${r.total}</span></div>`).join('');
    }
  } else {
    html += '<div style="color:var(--text3);font-size:12px;padding:10px 0;">这天只有计划，没有完成记录</div>';
  }
  
  html += '</div>';
  return html;
}

/* ===================== 计时悬浮小窗 ===================== */
let floatTimerEl = null;
let floatTimerInterval = null;

// 创建 / 更新悬浮小窗（显示正在运行的计时任务）
function ensureFloatTimer(){
  if(floatTimerEl) return;
  floatTimerEl = document.createElement('div');
  floatTimerEl.id = 'goal-float-timer';
  floatTimerEl.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 1500;
    background: rgba(20,20,20,0.96); border: 1px solid var(--ai-border);
    border-radius: 16px; padding: 14px 16px; min-width: 220px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6); backdrop-filter: blur(12px);
    font-family: var(--font); color: var(--text); display: none;
    cursor: move; user-select: none;
  `;
  floatTimerEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:14px;">⏱</span>
      <span id="float-timer-name" style="font-size:13px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">任务</span>
      <button class="btn btn-ico del" onclick="closeFloatTimer()" title="关闭" style="font-size:10px;">✕</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span id="float-timer-time" style="font-family:var(--mono);font-size:24px;font-weight:700;color:var(--ai);flex:1;">00:00</span>
      <button id="float-timer-pause" class="btn btn-ico" onclick="toggleFloatTimerPause()" title="暂停/继续" style="background:rgba(245,166,35,.12);color:var(--yellow);">⏸</button>
      <button class="btn btn-ico" onclick="stopFloatTimer()" title="结束任务" style="background:rgba(255,92,92,.12);color:var(--red);">⏹</button>
    </div>
  `;
  document.body.appendChild(floatTimerEl);
  
  // 拖拽
  let isDragging = false, offsetX = 0, offsetY = 0;
  floatTimerEl.addEventListener('mousedown', e=>{
    if(e.target.closest('button')) return;
    isDragging = true;
    const rect = floatTimerEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e=>{
    if(!isDragging || !floatTimerEl) return;
    const x = Math.max(0, Math.min(window.innerWidth - floatTimerEl.offsetWidth, e.clientX - offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - floatTimerEl.offsetHeight, e.clientY - offsetY));
    floatTimerEl.style.left = x + 'px';
    floatTimerEl.style.top = y + 'px';
    floatTimerEl.style.right = 'auto';
    floatTimerEl.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', ()=>{ isDragging = false; });
}

function updateFloatTimer(){
  ensureFloatTimer();
  if(!floatTimerEl) return;
  const runningId = Object.keys(activeTimers).find(id=>activeTimers[id] && activeTimers[id].running);
  if(!runningId){
    floatTimerEl.style.display = 'none';
    if(floatTimerInterval){ clearInterval(floatTimerInterval); floatTimerInterval = null; }
    return;
  }
  const g = goals.find(x=>x.id === Number(runningId));
  if(!g){ floatTimerEl.style.display = 'none'; return; }
  
  floatTimerEl.style.display = 'block';
  document.getElementById('float-timer-name').textContent = g.name;
  document.getElementById('float-timer-time').textContent = fmtTaskTime(timerMs(g.id));
  const pauseBtn = document.getElementById('float-timer-pause');
  if(activeTimers[runningId].running){
    pauseBtn.textContent = '⏸';
    pauseBtn.title = '暂停';
  } else {
    pauseBtn.textContent = '▶';
    pauseBtn.title = '继续';
  }
  
  if(!floatTimerInterval){
    floatTimerInterval = setInterval(()=>{
      const rid = Object.keys(activeTimers).find(id=>activeTimers[id] && activeTimers[id].running);
      if(!rid){ closeFloatTimer(); return; }
      const el = document.getElementById('float-timer-time');
      if(el) el.textContent = fmtTaskTime(timerMs(rid));
    }, 1000);
  }
}

function closeFloatTimer(){
  if(floatTimerInterval){ clearInterval(floatTimerInterval); floatTimerInterval = null; }
  if(floatTimerEl){ floatTimerEl.style.display = 'none'; }
}

function toggleFloatTimerPause(){
  const runningId = Object.keys(activeTimers).find(id=>activeTimers[id] && activeTimers[id].running);
  if(!runningId) return;
  const pausedId = Object.keys(activeTimers).find(id=>activeTimers[id] && !activeTimers[id].running && activeTimers[id].acc > 0);
  if(pausedId){
    startTaskTimer(Number(pausedId));
  } else if(runningId){
    pauseTaskTimer(Number(runningId));
  }
  updateFloatTimer();
}

function stopFloatTimer(){
  const runningId = Object.keys(activeTimers).find(id=>activeTimers[id]);
  if(!runningId) return;
  stopTaskTimer(Number(runningId));
  setTimeout(()=>updateFloatTimer(), 100);
}

// 拦截 startTaskTimer 以显示悬浮窗
const _origStartTaskTimer = window.startTaskTimer;
window.startTaskTimer = function(id){
  const result = _origStartTaskTimer.apply(this, arguments);
  updateFloatTimer();
  return result;
};

// 拦截 stopTaskTimer 以隐藏悬浮窗
const _origStopTaskTimer = window.stopTaskTimer;
window.stopTaskTimer = function(id){
  const result = _origStopTaskTimer.apply(this, arguments);
  setTimeout(()=>updateFloatTimer(), 100);
  return result;
};

// 拦截 pauseTaskTimer 以更新悬浮窗
const _origPauseTaskTimer = window.pauseTaskTimer;
window.pauseTaskTimer = function(id){
  const result = _origPauseTaskTimer.apply(this, arguments);
  updateFloatTimer();
  return result;
};

/* ===================== 部署时间选项 ===================== */
// 在「推送到日程表」按钮旁添加时间模式选项
// 使用 window.__deploySettings 让 Goal.html 内主脚本可读取
window.__deploySettings = { mode: 'now', start: '08:00', end: '22:00' };

function setupDeployTimeUI(){
  const actionsEl = document.querySelector('.today-panel-actions');
  if(!actionsEl) return;
  // 在推送到日程表前插入时间设置（如果不存在）
  if(document.getElementById('deployTimeWrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'deployTimeWrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;';
  wrap.innerHTML = `
    <button id="deployNowBtn" class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="setDeployMode('now')">⏱ 从现在开始</button>
    <button id="deploySchedBtn" class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="setDeployMode('scheduled')">📅 设定时间</button>
    <div id="deployTimeInputs" style="display:none;gap:4px;align-items:center;">
      <input type="time" id="deployStartInput" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:11px;padding:3px 6px;" value="08:00" onchange="window.__deploySettings.start=this.value">
      <span style="color:var(--text3);">~</span>
      <input type="time" id="deployEndInput" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:11px;padding:3px 6px;" value="22:00" onchange="window.__deploySettings.end=this.value">
    </div>
  `;
  actionsEl.insertBefore(wrap, actionsEl.querySelector('#todayPushRes') || null);
  setDeployMode('now');
}

function setDeployMode(mode){
  window.__deploySettings.mode = mode;
  const nowBtn = document.getElementById('deployNowBtn');
  const schedBtn = document.getElementById('deploySchedBtn');
  const inputs = document.getElementById('deployTimeInputs');
  if(!nowBtn || !schedBtn) return;
  if(mode === 'now'){
    nowBtn.style.background = 'var(--blue)';
    nowBtn.style.color = '#000';
    schedBtn.style.background = 'transparent';
    schedBtn.style.color = 'var(--text2)';
    inputs.style.display = 'none';
  } else {
    nowBtn.style.background = 'transparent';
    nowBtn.style.color = 'var(--text2)';
    schedBtn.style.background = 'var(--blue)';
    schedBtn.style.color = '#000';
    inputs.style.display = 'flex';
    window.__deploySettings.start = (document.getElementById('deployStartInput') || {}).value || '08:00';
    window.__deploySettings.end = (document.getElementById('deployEndInput') || {}).value || '22:00';
  }
}

// 读取部署起始时间（分钟）
function getDeployCursor(){
  if(window.__deploySettings.mode === 'scheduled'){
    return t2min(window.__deploySettings.start || '08:00');
  }
  return Math.max(8*60, cursorNow());
}

// 读取部署结束时间（分钟）
function getDeployEndLimit(){
  if(window.__deploySettings.mode === 'scheduled'){
    return t2min(window.__deploySettings.end || '22:00');
  }
  return 24*60;
}

/* ===================== AI 分析收起按钮 ===================== */
function setupAiCollapse(){
  // 今日计划的 AI 建议区域添加收起按钮
  const suggestEl = document.getElementById('todayAiSuggest');
  if(!suggestEl) return;
  
  // 在 aiPlanToday 成功后自动包装，这里通过 MutationObserver 监听内容变化
  const observer = new MutationObserver(()=>{
    if(suggestEl.style.display === 'block' && !suggestEl.querySelector('.ai-collapse-btn')){
      const btn = document.createElement('div');
      btn.className = 'ai-collapse-btn';
      btn.style.cssText = 'text-align:center;padding:4px;cursor:pointer;color:var(--text3);font-size:11px;border-top:1px solid var(--ai-border);margin-top:6px;';
      btn.textContent = '▲ 收起';
      btn.onclick = ()=>{
        const body = suggestEl.querySelector('.ai-body-wrap');
        if(body){
          if(body.style.display === 'none'){
            body.style.display = '';
            btn.textContent = '▲ 收起';
          } else {
            body.style.display = 'none';
            btn.textContent = '▼ 展开';
          }
        }
      };
      // 包住现有内容
      const content = suggestEl.innerHTML;
      suggestEl.innerHTML = `<div class="ai-body-wrap">${content}</div>`;
      suggestEl.appendChild(btn);
    }
  });
  observer.observe(suggestEl, { childList: true, subtree: true, characterData: true });
}

/* ===================== INIT ===================== */
// 页面加载后初始化新功能
window.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(()=>{
    try{ setupDeployTimeUI(); }catch(e){}
    try{ setupAiCollapse(); }catch(e){}
    try{ updateFloatTimer(); }catch(e){}
  }, 300);
});

// 每 3 秒检查一次计时悬浮窗
setInterval(()=>{
  try{ updateFloatTimer(); }catch(e){}
}, 3000);

// 导出全局函数供 HTML onclick 使用
window.openProgressReport = openProgressReport;
window.prSwitchTab = prSwitchTab;
window.prQuickSubmit = prQuickSubmit;
window.prCalNav = prCalNav;
window.prSelectDate = prSelectDate;
window.setDeployMode = setDeployMode;
window.closeFloatTimer = closeFloatTimer;
window.toggleFloatTimerPause = toggleFloatTimerPause;
window.stopFloatTimer = stopFloatTimer;