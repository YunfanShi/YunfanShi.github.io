// ==UserScript==
// @name         Save My Exams 终极控制台 (v30.0 开发者旗舰版)
// @namespace    http://tampermonkey.net/
// @version      30.0
// @description  集成全能调试控制台，支持全功能模块独立测试、动画预览、错误模拟及可视化劫持，保留流式下载内核。
// @author       Gemini
// @match        *://*.savemyexams.com/*
// @match        *://*.savemyexams.co.uk/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- 0. 配置中心 ---
    const CONFIG = {
        debug: localStorage.getItem('sme_v30_debug') === 'true',
        hijack: localStorage.getItem('sme_v30_hijack') !== 'false',
        autoClose: localStorage.getItem('sme_v30_autoclose') !== 'false',
        cachePrefix: 'sme_cache_v2_'
    };

    // --- 1. Material Design 样式 ---
    const css = `
        :root { --md-primary: #1a73e8; --md-surface: #ffffff; --md-shadow: 0 8px 30px rgba(0,0,0,0.15); }

        /* 主面板 */
        #sme-panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95);
            width: 700px; height: 85vh; background: var(--md-surface);
            border-radius: 24px; box-shadow: var(--md-shadow);
            z-index: 2147483647; display: flex; flex-direction: column;
            font-family: 'Google Sans', Roboto, sans-serif;
            opacity: 0; pointer-events: none; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #sme-panel.active { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%) scale(1); }

        /* 侧边日志抽屉 */
        #sme-logger {
            position: fixed; top: 0; right: 0; width: 360px; height: 100vh;
            background: rgba(255, 255, 255, 0.98); border-left: 1px solid #eee;
            box-shadow: -5px 0 20px rgba(0,0,0,0.05); z-index: 2147483646;
            transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex; flex-direction: column;
        }
        #sme-logger.visible { transform: translateX(0); }
        .log-item { margin: 6px 12px; padding: 10px; border-radius: 8px; background: #f8f9fa; border-left: 4px solid #ccc; font-size: 12px; line-height: 1.4; animation: slideIn 0.2s ease; }
        .log-item.success { border-left-color: #34a853; background: #e6f4ea; }
        .log-item.error { border-left-color: #ea4335; background: #fce8e6; }
        .log-item.warn { border-left-color: #fbbc04; background: #fef7e0; }
        .log-item.info { border-left-color: #1a73e8; }
        @keyframes slideIn { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:translateX(0); } }

        /* 悬浮按钮组 (FAB) */
        #sme-fab-group { position: fixed; bottom: 30px; right: 30px; z-index: 99999; display: flex; flex-direction: column-reverse; gap: 12px; align-items: end; }
        .sme-fab {
            width: 48px; height: 48px; border-radius: 16px; background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; display: flex;
            align-items: center; justify-content: center; font-size: 20px;
            transition: all 0.2s; border: 1px solid #eee; position: relative;
        }
        .sme-fab:hover { transform: scale(1.1); box-shadow: 0 6px 16px rgba(0,0,0,0.2); }
        .sme-fab.primary { background: var(--md-primary); color: white; border: none; }
        .sme-fab.debug { background: #212529; color: #0f0; border: 1px solid #333; }

        /* 调试面板 */
        #sme-debug-console {
            position: fixed; top: 10%; left: 10%; width: 400px; max-height: 80vh;
            background: #212529; color: #f8f9fa; border-radius: 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5); z-index: 2147483648;
            display: none; flex-direction: column; overflow: hidden;
            font-family: 'Consolas', monospace; border: 1px solid #444;
        }
        .dbg-header { padding: 10px 15px; background: #343a40; border-bottom: 1px solid #495057; display: flex; justify-content: space-between; align-items: center; font-weight: bold; cursor: move;}
        .dbg-body { padding: 15px; overflow-y: auto; flex: 1; }
        .dbg-section { margin-bottom: 15px; border: 1px solid #495057; border-radius: 6px; padding: 10px; }
        .dbg-title { font-size: 11px; color: #adb5bd; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }
        .dbg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .dbg-btn {
            background: #495057; color: white; border: none; padding: 6px 10px;
            border-radius: 4px; cursor: pointer; font-size: 11px; text-align: left;
            transition: background 0.2s; display: flex; align-items: center; gap: 5px;
        }
        .dbg-btn:hover { background: #6c757d; }
        .dbg-btn:active { transform: translateY(1px); }
        .dbg-btn.red { background: #5c2b2b; color: #ffadad; } .dbg-btn.red:hover { background: #7a3b3b; }
        .dbg-btn.green { background: #2b5c35; color: #adffbf; } .dbg-btn.green:hover { background: #3b7a4b; }

        /* 幽灵按钮可视类 */
        .sme-ghost-btn { position: absolute; z-index: 999999; cursor: pointer; background: transparent; }
        .sme-ghost-visible { border: 2px solid red !important; background: rgba(255,0,0,0.2) !important; transition: all 0.3s; }
    `;
    const styleEl = document.createElement('style');
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);

    // --- 2. 健壮日志系统 ---
    const Logger = {
        el: null,
        queue: [],
        init: function() {
            if (this.el) return;
            this.el = document.createElement('div');
            this.el.id = 'sme-logger';
            this.el.innerHTML = `
                <div style="padding:15px 20px; font-size:16px; font-weight:500; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                    <span>📜 运行日志</span>
                    <button onclick="document.getElementById('sme-logger').classList.remove('visible')" style="background:none; border:none; cursor:pointer; font-size:18px; color:#666;">×</button>
                </div>
                <div id="sme-log-body" style="flex:1; overflow-y:auto; padding:10px 0;"></div>
                <div style="padding:10px; border-top:1px solid #eee; text-align:center;">
                    <button onclick="document.getElementById('sme-log-body').innerHTML=''" style="background:none; border:1px solid #ddd; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:11px; color:#666;">清空日志</button>
                </div>
            `;
            document.body.appendChild(this.el);
            this.queue.forEach(q => this.render(q.msg, q.type, q.detail));
            this.queue = [];
        },
        toggle: function() {
            if(!this.el) this.init();
            this.el.classList.toggle('visible');
        },
        show: function() {
            if(!this.el) this.init();
            this.el.classList.add('visible');
        },
        log: function(msg, type = 'info', detail = '') {
            if (!this.el) this.init();
            const panel = document.getElementById('sme-panel');
            if (type === 'error' || (panel && panel.classList.contains('active'))) {
                this.show();
            }
            this.render(msg, type, detail);
        },
        render: function(msg, type, detail) {
            const body = document.getElementById('sme-log-body');
            if (!body) return;
            const item = document.createElement('div');
            item.className = `log-item ${type}`;
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            item.innerHTML = `<div><span style="opacity:0.6; font-size:11px; margin-right:5px;">${time}</span><strong>${msg}</strong></div>${detail ? `<div style="margin-top:4px; opacity:0.8; font-size:11px; word-break:break-all; font-family:monospace;">${detail}</div>` : ''}`;
            body.appendChild(item);
            body.scrollTop = body.scrollHeight;
        }
    };

    // --- 3. 调试控制台 (Debugger) ---
    const Debugger = {
        init: function() {
            const ui = document.createElement('div');
            ui.id = 'sme-debug-console';
            ui.innerHTML = `
                <div class="dbg-header">
                    <span>🐞 开发者调试台</span>
                    <span style="cursor:pointer;" onclick="document.getElementById('sme-debug-console').style.display='none'">✕</span>
                </div>
                <div class="dbg-body">
                    <div class="dbg-section">
                        <div class="dbg-title">UI 组件交互</div>
                        <div class="dbg-grid">
                            <button class="dbg-btn" onclick="window.smeDebug.toggleMainPanel()">📂 主面板开关</button>
                            <button class="dbg-btn" onclick="window.smeDebug.toggleLogger()">📜 日志栏开关</button>
                            <button class="dbg-btn" onclick="window.smeDebug.toggleSettings()">⚙️ 设置窗开关</button>
                            <button class="dbg-btn" onclick="window.smeDebug.testGhostVis()">👻 幽灵按钮显形</button>
                        </div>
                    </div>

                    <div class="dbg-section">
                        <div class="dbg-title">日志系统测试</div>
                        <div class="dbg-grid">
                            <button class="dbg-btn" onclick="window.smeDebug.logInfo()">ℹ️ 写入普通日志</button>
                            <button class="dbg-btn green" onclick="window.smeDebug.logSuccess()">✅ 写入成功日志</button>
                            <button class="dbg-btn" onclick="window.smeDebug.logWarn()">⚠️ 写入警告日志</button>
                            <button class="dbg-btn red" onclick="window.smeDebug.logError()">🚫 写入错误日志</button>
                        </div>
                    </div>

                    <div class="dbg-section">
                        <div class="dbg-title">流程模拟 (不真实下载)</div>
                        <div class="dbg-grid">
                            <button class="dbg-btn green" onclick="window.smeDebug.simDownload()">🚀 模拟完整抓取</button>
                            <button class="dbg-btn" onclick="window.smeDebug.simImageWait()">🖼️ 模拟图片等待</button>
                            <button class="dbg-btn" onclick="window.smeDebug.simAutoClose()">⏱️ 模拟自动关闭</button>
                        </div>
                    </div>

                    <div class="dbg-section">
                        <div class="dbg-title">异常模拟</div>
                        <div class="dbg-grid">
                            <button class="dbg-btn red" onclick="window.smeDebug.sim403()">🔒 模拟 403 封锁</button>
                            <button class="dbg-btn red" onclick="window.smeDebug.simNetFail()">📡 模拟断网重试</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(ui);

            // 导出 API
            window.smeDebug = {
                toggleMainPanel: () => {
                    const p = document.getElementById('sme-panel');
                    if(p) p.classList.toggle('active');
                    else openMainPanel();
                },
                toggleLogger: () => Logger.toggle(),
                toggleSettings: () => toggleSettings(),
                testGhostVis: () => {
                    document.querySelectorAll('.sme-ghost-btn').forEach(g => {
                        g.classList.add('sme-ghost-visible');
                        setTimeout(() => g.classList.remove('sme-ghost-visible'), 2000);
                    });
                    Logger.log("已高亮所有劫持层", "info");
                },
                logInfo: () => Logger.log("这是一个测试信息", "info", "Detail info here..."),
                logSuccess: () => Logger.log("操作成功完成", "success"),
                logWarn: () => Logger.log("发现潜在问题", "warn", "Cache miss"),
                logError: () => Logger.log("发生严重错误", "error", "Error Code: 500"),

                simDownload: () => {
                    const tasks = [
                        {title: "Unit 1: Test Topic A", url: "#", unit: "Unit 1"},
                        {title: "Unit 1: Test Topic B", url: "#", unit: "Unit 1"},
                        {title: "Unit 2: Test Topic C", url: "#", unit: "Unit 2"}
                    ];
                    startStreamingProcess(tasks, true); // true = debug mode
                },
                simImageWait: () => {
                    const w = window.open('', '_blank');
                    w.document.write('<h1>Image Wait Test</h1><div id="img-loading-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);color:white;display:flex;justify-content:center;align-items:center;"><h2>等待图片...</h2></div>');
                    setTimeout(() => w.close(), 3000);
                },
                simAutoClose: () => {
                    const w = window.open('', '_blank');
                    setupAutoClose(w);
                },
                sim403: () => Logger.log("抓取失败：拒绝访问", "error", "HTTP 403 Forbidden - Cloudflare"),
                simNetFail: () => {
                    Logger.log("网络请求失败", "error", "NetworkError");
                    Logger.log("正在重试 (1/3)...", "warn");
                }
            };
        }
    };

    // --- 4. 幽灵覆盖劫持 ---
    function initGhostHijack() {
        if (!CONFIG.hijack) return;
        setInterval(() => {
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                const text = (btn.innerText || "").toLowerCase();
                if (text.includes('download pdf') || text.includes('下载 pdf') || (btn.querySelector('svg') && text.includes('download'))) {
                    if (btn.dataset.smeHijacked) return;

                    const rect = btn.getBoundingClientRect();
                    if (rect.width < 10 || rect.height < 10) return;

                    const ghost = document.createElement('div');
                    ghost.className = 'sme-ghost-btn';
                    ghost.style.width = rect.width + 'px';
                    ghost.style.height = rect.height + 'px';
                    // 确保父级有定位
                    const parent = btn.offsetParent || document.body;
                    btn.style.position = 'relative';
                    ghost.style.position = 'absolute';
                    ghost.style.top = '0';
                    ghost.style.left = '0';

                    ghost.onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        Logger.log('用户点击原生按钮，劫持成功', 'success');
                        openMainPanel();
                    };

                    btn.appendChild(ghost);
                    btn.dataset.smeHijacked = "true";
                }
            });
        }, 1000);
    }

    // --- 5. UI 初始化 ---
    function initUI() {
        const group = document.createElement('div');
        group.id = 'sme-fab-group';

        const mainBtn = document.createElement('div');
        mainBtn.className = 'sme-fab primary';
        mainBtn.innerHTML = '📥';
        mainBtn.title = "打开下载面板";
        mainBtn.onclick = openMainPanel;
        if (CONFIG.hijack) mainBtn.style.display = 'none';

        const debugBtn = document.createElement('div');
        debugBtn.className = 'sme-fab debug';
        debugBtn.innerHTML = '🐞';
        debugBtn.title = "调试控制台";
        debugBtn.onclick = () => {
            const con = document.getElementById('sme-debug-console');
            con.style.display = con.style.display === 'flex' ? 'none' : 'flex';
        };

        const setBtn = document.createElement('div');
        setBtn.className = 'sme-fab';
        setBtn.innerHTML = '⚙️';
        setBtn.title = "设置";
        setBtn.onclick = toggleSettings;

        group.appendChild(setBtn);
        group.appendChild(debugBtn);
        group.appendChild(mainBtn);
        document.body.appendChild(group);

        const panel = document.createElement('div');
        panel.id = 'sme-panel';
        document.body.appendChild(panel);
    }

    function toggleSettings() {
        const exist = document.getElementById('sme-settings-modal');
        if(exist) { exist.remove(); return; }

        const modal = document.createElement('div');
        modal.id = 'sme-settings-modal';
        modal.style.cssText = `position: fixed; bottom: 100px; right: 30px; width: 280px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 5px 25px rgba(0,0,0,0.15); z-index: 100000; animation: slideIn 0.2s ease; font-family: sans-serif;`;
        modal.innerHTML = `
            <h3 style="margin:0 0 15px 0; font-size:16px;">全局设置</h3>
            <label style="display:flex; justify-content:space-between; margin-bottom:15px; cursor:pointer;"><span>🕷️ 劫持原生按钮</span><input type="checkbox" ${CONFIG.hijack?'checked':''} onchange="localStorage.setItem('sme_v30_hijack', this.checked); alert('刷新生效')"></label>
            <label style="display:flex; justify-content:space-between; margin-bottom:15px; cursor:pointer;"><span>⏱️ 下载后自动关闭</span><input type="checkbox" ${CONFIG.autoClose?'checked':''} onchange="localStorage.setItem('sme_v30_autoclose', this.checked)"></label>
            <div style="text-align:right; margin-top:10px;">
                <button onclick="localStorage.clear(); alert('缓存已清空')" style="background:#ffdddd; color:red; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🗑️ 清空缓存</button>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.addEventListener('click', function close(e) {
            if(!e.target.closest('#sme-settings-modal') && !e.target.closest('.sme-fab')) { modal.remove(); document.removeEventListener('click', close); }
        }), 100);
    }

    // --- 6. 目录与抓取 ---
    function openMainPanel() {
        const panel = document.getElementById('sme-panel');
        Logger.log("正在分析目录结构...", "info");

        const units = [];
        const level1Items = document.querySelectorAll('li:has([class*="level1"])');

        level1Items.forEach((li, idx) => {
            const titleEl = li.querySelector('h3');
            if(!titleEl) return;
            const uTitle = titleEl.innerText.split('\n')[0].trim();
            const notes = [];
            li.querySelectorAll('a[href*="/revision-notes/"]').forEach(a => {
                if(a.classList.toString().includes('level1')) return;
                const nTitle = a.innerText.split('\n')[0].trim();
                if(!notes.find(n=>n.url===a.href)) notes.push({ title: nTitle, url: a.href });
            });
            if(notes.length > 0) units.push({ id: `u${idx}`, title: uTitle, notes });
        });

        if (units.length === 0) {
            Logger.log("无法识别目录，请确保侧边栏已加载", "error");
            alert("⚠️ 无法识别目录！请确保当前页面左侧有 [Topic List]。");
            return;
        }
        Logger.log(`识别成功：${units.length} 个单元`, "success");

        panel.innerHTML = `
            <div style="padding:20px 24px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between;">
                <div><div style="font-size:20px; font-weight:500;">单元下载助手</div><div style="font-size:12px; color:#666;">v30.0 Developer Edition</div></div>
                <button onclick="document.getElementById('sme-panel').classList.remove('active')" style="background:none; border:none; font-size:24px; cursor:pointer;">×</button>
            </div>
            <div id="sme-list-area" style="flex:1; overflow-y:auto; padding:10px 20px;"></div>
            <div style="padding:20px; border-top:1px solid #eee; text-align:right;">
                <span id="sme-sel-txt" style="margin-right:15px; font-size:13px; color:#666;">未选择</span>
                <button id="sme-run-btn" style="background:#1a73e8; color:white; border:none; padding:10px 25px; border-radius:20px; font-weight:500; cursor:pointer; opacity:0.5; pointer-events:none;">开始抓取</button>
            </div>
        `;

        const listArea = panel.querySelector('#sme-list-area');
        units.forEach(u => {
            const grp = document.createElement('div');
            grp.innerHTML = `
                <div class="sme-unit-header">
                    <input type="checkbox" class="u-chk" style="width:18px; height:18px; margin-right:10px;">
                    <span style="font-weight:500; flex:1;">${u.title}</span>
                    <span class="sme-badge">${u.notes.length}</span>
                </div>
                <div class="sme-notes" style="display:none; padding-left:40px;">
                    ${u.notes.map(n => `<div style="padding:8px 0; display:flex;"><input type="checkbox" class="n-chk" value="${n.url}" data-title="${n.title}" style="width:16px; height:16px; margin-right:10px;"><span style="font-size:13px; color:#555;">${n.title}</span></div>`).join('')}
                </div>
            `;
            const header = grp.querySelector('.sme-unit-header');
            const notesDiv = grp.querySelector('.sme-notes');
            const uChk = grp.querySelector('.u-chk');

            header.onclick = (e) => { if(e.target !== uChk) notesDiv.style.display = notesDiv.style.display==='none'?'block':'none'; };
            uChk.onchange = () => { notesDiv.querySelectorAll('.n-chk').forEach(c => c.checked = uChk.checked); updateBtn(); };
            notesDiv.querySelectorAll('.n-chk').forEach(c => c.onchange = () => {
                const all = Array.from(notesDiv.querySelectorAll('.n-chk'));
                uChk.checked = all.every(x=>x.checked);
                uChk.indeterminate = !uChk.checked && all.some(x=>x.checked);
                updateBtn();
            });
            listArea.appendChild(grp);
        });

        function updateBtn() {
            const count = panel.querySelectorAll('.n-chk:checked').length;
            const btn = panel.querySelector('#sme-run-btn');
            panel.querySelector('#sme-sel-txt').innerText = `已选 ${count} 篇`;
            btn.style.opacity = count > 0 ? 1 : 0.5;
            btn.style.pointerEvents = count > 0 ? 'auto' : 'none';
        }

        panel.querySelector('#sme-run-btn').onclick = () => {
            const tasks = [];
            panel.querySelectorAll('.n-chk:checked').forEach(c => {
                const uTitle = c.closest('.sme-notes').previousElementSibling.querySelector('span').innerText;
                tasks.push({ unit: uTitle, title: c.dataset.title, url: c.value });
            });
            panel.classList.remove('active');
            Logger.show();
            startStreamingProcess(tasks);
        };

        panel.classList.add('active');
    }

    // --- 7. 流式下载核心 (v25 Kernel) ---
    async function startStreamingProcess(queue, isDebug = false) {
        Logger.log(`🚀 启动任务队列: ${queue.length} 项${isDebug?' (模拟)':''}`, "info");

        const printWin = window.open('', '_blank');
        if (!printWin) { Logger.log("❌ 弹窗被拦截，请允许", "error"); return; }

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(s => s.outerHTML).join('\n');

        printWin.document.write(`
            <!DOCTYPE html><html><head><title>正在生成...</title>${styles}
            <style>
                body { background: white !important; margin: 0 auto !important; padding: 0 !important; max-width: 900px; font-family: sans-serif; }
                #progress-header { position: fixed; top: 0; left: 0; width: 100%; background: #212529; color: white; padding: 10px; z-index: 9999; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
                #progress-bar-bg { width: 300px; height: 10px; background: #495057; display: inline-block; border-radius: 5px; margin: 0 10px; overflow: hidden; vertical-align: middle;}
                #progress-bar-fill { height: 100%; background: #28a745; width: 0%; transition: width 0.3s; }
                #img-loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; color: white; display: none; flex-direction: column; justify-content: center; align-items: center; }
                @media print { #progress-header, #img-loading-overlay { display: none !important; } @page { margin: 15mm; } }
                .pdf-unit-cover { height: 90vh; display: flex; align-items: center; justify-content: center; text-align: center; border: 5px solid #000; margin: 20px 0; page-break-after: always; background: #f8f9fa; }
                .pdf-chapter-title { border-bottom: 2px solid #000; padding-bottom: 10px; margin-top: 40px; font-size: 28px; color: #000; page-break-after: avoid; }
                .page-break { page-break-after: always; }
                button, nav, aside, iframe, video, [class*="Breadcrumbs"], [class*="DownloadRibbon"], [class*="Sidebar"], [class*="Feedback"] { display: none !important; }
                img { max-width: 100% !important; display: block; margin: 10px auto; }
            </style></head><body>
            <div id="progress-header"><span id="step-text">初始化...</span><div id="progress-bar-bg"><div id="progress-bar-fill"></div></div></div>
            <div id="img-loading-overlay"><h2>等待图片加载...</h2><p id="img-count">0/0</p></div>
            <div id="doc-body"><div style="text-align:center; padding-top:150px; height:80vh; page-break-after: always;"><h1 style="font-size:40px;">Revision Notes</h1><p>${new Date().toLocaleDateString()}</p></div></div>
            </body></html>
        `);
        printWin.document.close();

        const docBody = printWin.document.getElementById('doc-body');
        const pBar = printWin.document.getElementById('progress-bar-fill');
        const pText = printWin.document.getElementById('step-text');
        let currentUnit = "";

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            if(pText) pText.innerText = `抓取 (${i+1}/${queue.length}): ${item.title}`;
            if(pBar) pBar.style.width = `${Math.round(((i)/queue.length)*100)}%`;
            Logger.log(`正在抓取: ${item.title}`, "info");

            if (item.unit !== currentUnit) {
                currentUnit = item.unit;
                const unitDiv = printWin.document.createElement('div');
                unitDiv.className = 'pdf-unit-cover';
                unitDiv.innerHTML = `<h1>${currentUnit}</h1>`;
                docBody.appendChild(unitDiv);
            }

            try {
                let text = "";
                if (isDebug) {
                    text = `<html><body><article><h3>[模拟数据] ${item.title}</h3><p>这是一段调试文字...</p></article></body></html>`;
                    await new Promise(r => setTimeout(r, 200));
                } else {
                    const resp = await fetch(item.url);
                    if(!resp.ok) throw new Error(resp.status);
                    text = await resp.text();
                    await new Promise(r => setTimeout(r, 1200));
                }

                const content = cleanHTML(text);
                if (content) {
                    const div = printWin.document.createElement('div');
                    div.innerHTML = `<h2 class="pdf-chapter-title">${item.title}</h2>${content}<div class="page-break"></div>`;
                    docBody.appendChild(div);
                    printWin.scrollTo(0, printWin.document.body.scrollHeight);
                }
            } catch (e) {
                Logger.log(`出错: ${item.title}`, "error", e.message);
                const errDiv = printWin.document.createElement('div');
                errDiv.innerHTML = `<p style="color:red">[抓取失败] ${item.title}</p>`;
                docBody.appendChild(errDiv);
            }
        }

        if(pText) pText.innerText = "检查图片...";
        if(pBar) pBar.style.width = "100%";

        const overlay = printWin.document.getElementById('img-loading-overlay');
        if(overlay && !isDebug) overlay.style.display = 'flex';

        let checkTimes = 0;
        const checker = setInterval(() => {
            const imgs = Array.from(printWin.document.images);
            const loaded = imgs.filter(img => img.complete && img.naturalHeight !== 0).length;
            if(printWin.document.getElementById('img-count')) printWin.document.getElementById('img-count').innerText = `${loaded} / ${imgs.length}`;

            if (loaded >= imgs.length || checkTimes++ > 15 || isDebug) {
                clearInterval(checker);
                if(overlay) overlay.style.display = 'none';
                if(!isDebug) {
                    printWin.document.title = `${currentUnit || 'Notes'} - Compilation`;
                    printWin.print();
                    if(CONFIG.autoClose) setupAutoClose(printWin);
                } else {
                    alert('调试抓取完成，未执行打印。');
                }
            }
        }, 800);
    }

    function setupAutoClose(win) {
        const div = win.document.createElement('div');
        div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); color:white; display:flex; justify-content:center; align-items:center; z-index:10000; flex-direction:column;";
        div.innerHTML = `<h2>打印结束</h2><p id="timer">10秒后关闭</p><button id="stop" style="padding:10px 20px; cursor:pointer;">取消自动关闭</button>`;
        win.document.body.appendChild(div);
        let t = 10;
        const timer = setInterval(() => {
            t--;
            win.document.getElementById('timer').innerText = `${t}秒后关闭`;
            if(t<=0) { clearInterval(timer); win.close(); }
        }, 1000);
        win.document.getElementById('stop').onclick = () => { clearInterval(timer); div.remove(); };
    }

    function cleanHTML(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.revision-notes-content');
        if (!content) return null;
        if(content.querySelector('h1')) content.querySelector('h1').remove();
        const rem = ['nav', 'aside', 'footer', 'button', 'iframe', 'video', '[class*="Breadcrumbs"]', '[class*="DownloadRibbon"]', '[class*="Sidebar"]', '[class*="Author"]', '[class*="CTA"]'];
        rem.forEach(s => content.querySelectorAll(s).forEach(e => e.remove()));
        const junk = ["Test yourself", "Flashcards", "Next:", "Previous:", "Updated on"];
        const walker = doc.createTreeWalker(content, NodeFilter.SHOW_ELEMENT, null, false);
        let n; const del=[];
        while(n=walker.nextNode()) {
            if(n.innerText && n.innerText.length < 100 && junk.some(j=>n.innerText.includes(j)) && !n.querySelector('img')) del.push(n);
        }
        del.forEach(e=>e.remove());
        return content.innerHTML;
    }

    // 启动
    initUI();
    Debugger.init();
    setTimeout(initGhostHijack, 2000);

})();