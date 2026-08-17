// ==UserScript==
// @name         Jack's Ultimate Focus v24.9 (Retroactive Merge)
// @namespace    http://tampermonkey.net/
// @version      24.9
// @description  自动合并历史数据 | 修复碎片化统计 | 智能词库管理 | 完美UI
// @author       Jack
// @match        *://www.youtube.com/*
// @match        *://*.koolearn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log("🛡️ Focus Pro v24.9: Auto-Merge Logic Loaded.");

    // =========================================
    // === 🔐 Trusted Types ===
    // =========================================
    let ttPolicy = null;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            const policyName = 'jack_focus_policy_' + Math.floor(Math.random() * 1000000);
            ttPolicy = window.trustedTypes.createPolicy(policyName, { createHTML: (s) => s });
        } catch (e) { console.warn("Policy warning:", e); }
    }
    function safeHTML(html) { return ttPolicy ? ttPolicy.createHTML(html) : html; }

    // =========================================
    // === ⭐ 核心：智能匹配逻辑 ===
    // =========================================
    function isTitleMatch(title, keyword) {
        if (!title || typeof title !== 'string') return false;
        if (!keyword || typeof keyword !== 'string') return false;
        const t = title.toLowerCase();
        const k = keyword.toLowerCase().trim();
        // 组合词匹配 (e.g. "罗大佑-火车")
        if (k.includes('-')) {
            const parts = k.split('-').map(s => s.trim()).filter(s => s.length > 0);
            if (parts.length > 1) return parts.every(part => t.includes(part));
        }
        return t.includes(k);
    }

    // =========================================
    // === 🧹 新增：历史数据回溯合并 (核心修复) ===
    // =========================================
    function mergeHistoricalData() {
        const d = GM_getValue(STORAGE_KEY, {});
        const today = getTodayStr();
        if (!d[today] || !d[today].details) return;

        const keywords = getLearningKeywords();
        let details = d[today].details;
        let changed = false;

        // 遍历现有的每一个 Key (可能是未清洗的标题，也可能是旧Tag)
        Object.keys(details).forEach(oldKey => {
            // 尝试用当前词库去匹配这个 Key
            for (const kw of keywords) {
                // 格式化目标 Key (首字母大写或保持组合原样)
                const targetKey = kw.includes('-') ? kw : (kw.charAt(0).toUpperCase() + kw.slice(1));

                // 如果 oldKey 已经是目标 Key，跳过（避免自己合并自己）
                if (oldKey === targetKey) continue;

                // 如果 oldKey 符合 keyword 的规则 (例如 "羅大佑- 【火車】" 匹配了 "羅大佑-火車")
                if (isTitleMatch(oldKey, kw)) {
                    // 1. 转移时间
                    const time = details[oldKey];
                    details[targetKey] = (details[targetKey] || 0) + time;

                    // 2. 标记删除旧 Key
                    delete details[oldKey];
                    changed = true;

                    // 3. 匹配到一个后就停止，防止重复计算
                    break;
                }
            }
        });

        if (changed) {
            console.log("♻️ Focus Pro: 已自动合并碎片化数据");
            GM_setValue(STORAGE_KEY, d);
        }
    }

    // =========================================
    // === 📅 课程表数据 ===
    // =========================================
    const SCHEDULE_DATA = {
        1: [{n:'早读',s:'07:30',e:'07:50'},{n:'化学',s:'08:00',e:'08:40'},{n:'语文',s:'08:55',e:'09:35'},{n:'数学',s:'10:00',e:'10:40'},{n:'生物',s:'10:55',e:'11:35'},{n:'CS',s:'13:15',e:'13:55'},{n:'CS',s:'14:10',e:'14:50'},{n:'IELTS',s:'15:15',e:'15:55'},{n:'物理',s:'16:10',e:'16:50'},{n:'英语',s:'18:00',e:'18:40'},{n:'英语',s:'18:55',e:'19:35'},{n:'自习',s:'19:50',e:'20:30'},{n:'夜自习',s:'21:00',e:'22:45'}],
        2: [{n:'早读',s:'07:30',e:'07:50'},{n:'CS',s:'08:00',e:'08:40'},{n:'数学',s:'08:55',e:'09:35'},{n:'历史',s:'10:00',e:'10:40'},{n:'体育',s:'10:55',e:'11:35'},{n:'英语',s:'13:15',e:'13:55'},{n:'数学',s:'14:10',e:'14:50'},{n:'语文',s:'15:15',e:'15:55'},{n:'物理',s:'16:10',e:'16:50'},{n:'化学',s:'18:00',e:'18:40'},{n:'自习',s:'18:55',e:'19:35'},{n:'自习',s:'19:50',e:'20:30'},{n:'夜自习',s:'21:00',e:'22:45'}],
        3: [{n:'早读',s:'07:30',e:'07:50'},{n:'生物',s:'08:00',e:'08:40'},{n:'CS',s:'08:55',e:'09:35'},{n:'数学',s:'10:00',e:'10:40'},{n:'英语',s:'10:55',e:'11:35'},{n:'研究方法',s:'13:15',e:'13:55'},{n:'语文',s:'14:10',e:'14:50'},{n:'数学',s:'15:15',e:'15:55'},{n:'自习',s:'16:10',e:'16:50'},{n:'美术',s:'18:00',e:'18:40'},{n:'自习',s:'18:55',e:'19:35'},{n:'自习',s:'19:50',e:'20:30'},{n:'夜自习',s:'21:00',e:'22:45'}],
        4: [{n:'早读',s:'07:30',e:'07:50'},{n:'数学',s:'08:00',e:'08:40'},{n:'研究方法',s:'08:55',e:'09:35'},{n:'政治',s:'10:00',e:'10:40'},{n:'化学',s:'10:55',e:'11:35'},{n:'英语',s:'13:15',e:'13:55'},{n:'体育',s:'14:10',e:'14:50'},{n:'语文',s:'15:15',e:'15:55'},{n:'班会',s:'16:10',e:'16:50'},{n:'物理',s:'18:00',e:'18:40'},{n:'自习',s:'18:55',e:'19:35'},{n:'自习',s:'19:50',e:'20:30'},{n:'夜自习',s:'21:00',e:'22:45'}],
        5: [{n:'早读',s:'07:30',e:'07:50'},{n:'语文',s:'08:00',e:'08:40'},{n:'CS',s:'08:55',e:'09:35'},{n:'生物',s:'10:00',e:'10:40'},{n:'英语',s:'10:55',e:'11:35'},{n:'数学',s:'12:30',e:'13:10'},{n:'物理',s:'13:25',e:'14:05'},{n:'夜自习',s:'21:00',e:'22:45'}],
        7: [{n:'自习',s:'18:00',e:'18:40'},{n:'自习',s:'18:55',e:'19:35'},{n:'自习',s:'19:50',e:'20:30'},{n:'夜自习',s:'21:00',e:'22:45'}]
    };

    // =========================================
    // === 🛠️ 核心配置 ===
    // =========================================
    const TARGET_YOUTUBE_ID = "nLRL_NcnK-4";
    const STORAGE_KEY = "jack_study_data_v17";
    const SETTINGS_KEY = "jack_settings_v17";
    const UNLABELED_KEY = "jack_unlabeled_list_v24";
    const CUSTOM_KW_KEY = "jack_custom_keywords_v24";
    const LOG_KEY = "jack_intercept_log_v17";
    const DEFAULT_KW_LEARNING = ['python', 'math', 'physics', 'english', 'ielts'];

    const BLOCK_CHANNELS = [
        'BBC News 中文', 'BBC News', 'VOA', '美国之音', 'RFA', '自由亚洲电台',
        'DW 中文', '德国之声', 'New York Times', 'CNN', 'Fox News',
        'CCTV', '央视新闻', '观察者网', '大纪元', '新唐人', 'Gameranx', 'IGN'
    ];

    const KW_POLITICS = [
        '政治', 'politics', '选举', 'election', '民主', 'democracy',
        '共产党', 'ccp', '民进党', 'dpp', '国民党', 'kmt', '政府', 'government',
        '中共', '台海', '两岸', '習近平', '习近平', 'xi jinping',
        '連任', '任期', '全票', '第三任期', '主席', 'president', '国家主席',
        'cultural revolution', '文化大革命', '文革', 'mao', '毛泽东', 'pla', '解放军',
        '拜登', 'biden', '特朗普', '川普', 'trump', '普京', 'putin',
        '乌克兰', 'ukraine', 'israel', 'palestine', 'war', '战争',
        'bbc', 'voa', 'rfa', 'dw', '新闻', 'news', '时政', '评论', 'talk show'
    ];

    const KW_GAMES = [
        '游戏', '遊戲', 'game', 'gaming', 'gameplay', '电竞', 'esports',
        'steam', 'ps5', 'xbox', 'nintendo', 'switch',
        '解说', '实况', 'vtuber', '直播', 'live', 'highlight', '集锦', '攻略', 'walkthrough',
        'battlefield', '战地', 'cod', 'call of duty', '使命召唤',
        'minecraft', '我的世界', 'mc',
        '原神', 'genshin', 'mihoyo', '米哈游', '崩坏', 'honkai', 'star rail', '星穹铁道', '绝区零', 'zzZ',
        '王者荣耀', 'honor of kings', '王者',
        '英雄联盟', 'lol', 'league of legends', 'lpl', 'lck',
        'dota', 'csgo', 'cs2', 'counter-strike', 'valorant', '无畏契约',
        '鸣潮', 'wuthering waves',
        '黑神话', 'black myth', 'wukong', '悟空',
        '帕鲁', 'palworld',
        'elden ring', '法环', 'sekiro', '只狼',
        'roblox', 'fortnite', 'apex', 'gta', 'grand theft auto',
        '综艺', 'movie', '电影', 'drama', '剧集', '娱乐', '八卦', 'shorts'
    ];

    const CATEGORY_MAP = {
        'Gaming': 'GAME', 'Videogames': 'GAME', 'Entertainment': 'GAME',
        'News & Politics': 'POLITICS', 'Nonprofits & Activism': 'POLITICS'
    };

    // =========================================
    // === 🧠 数据管理 ===
    // =========================================
    function getSettings() { return GM_getValue(SETTINGS_KEY, { disableAll: false, disableGame: false, disablePolitics: false }); }
    function saveSettings(s) { GM_setValue(SETTINGS_KEY, s); }
    function getTodayStr() { return new Date().toLocaleDateString(); }

    function getLearningKeywords() {
        return GM_getValue(CUSTOM_KW_KEY, DEFAULT_KW_LEARNING);
    }

    function saveLearningKeywords(list) {
        const cleanList = [...new Set(list.map(s => s.trim()).filter(s => s))];
        GM_setValue(CUSTOM_KW_KEY, cleanList);
        cleanUnlabeledList(cleanList);
        mergeHistoricalData(); // ⭐ 保存时触发合并
        return cleanList;
    }

    function addKeywordsAndClean(inputString) {
        if (!inputString || inputString.trim() === "") return 0;
        const newKws = inputString.split(/[,，\n]/).map(s => s.trim()).filter(s => s.length > 0);
        if (newKws.length === 0) return 0;

        let currentKws = getLearningKeywords();
        let updatedKws = [...new Set([...currentKws, ...newKws])];

        saveLearningKeywords(updatedKws); // 触发合并
        return newKws.length;
    }

    function getHistoryData() {
        let d = GM_getValue(STORAGE_KEY, {});
        const today = getTodayStr();
        if (!d[today]) d[today] = { total_youtube: 0, details: {}, logs: [] };
        return d;
    }

    function tickTime(keyword) {
        const d = getHistoryData();
        const today = getTodayStr();
        d[today].total_youtube = (d[today].total_youtube || 0) + 1;
        const key = keyword || "Unlabeled";
        d[today].details[key] = (d[today].details[key] || 0) + 1;
        GM_setValue(STORAGE_KEY, d);
    }

    function logUnlabeledTitle(title) {
        let list = GM_getValue(UNLABELED_KEY, []);
        if (!list.includes(title)) {
            list.unshift(title);
            if (list.length > 100) list.pop();
            GM_setValue(UNLABELED_KEY, list);
        }
    }

    function cleanUnlabeledList(currentKeywords) {
        let list = GM_getValue(UNLABELED_KEY, []);
        if (list.length === 0) return;
        const newList = list.filter(title => {
            const matched = currentKeywords.some(kw => isTitleMatch(title, kw));
            return !matched;
        });
        GM_setValue(UNLABELED_KEY, newList);
    }

    function updateLog(keyword, title, url) {
        const d = getHistoryData();
        const today = getTodayStr();
        const logs = d[today].logs;
        const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
        if (!lastLog || lastLog.title !== title) {
            const now = new Date();
            const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
            logs.push({ time: timeStr, keyword: keyword || "Unknown", title: title, url: url });
            GM_setValue(STORAGE_KEY, d);
        }
    }

    // =========================================
    // === 🕵️ 核心检测逻辑 ===
    // =========================================
    let JACK_FOCUS_STATE = { isLearning: false, isPaused: false, keyword: "", title: "", blockReason: null, debugMsg: "Init" };

    function timeToMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

    function getCurrentStatus() {
        const now = new Date();
        const day = now.getDay();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        let currentClass = null;
        const todaySchedule = SCHEDULE_DATA[day === 0 ? 7 : day];
        if (todaySchedule) {
            for (const cls of todaySchedule) {
                const start = timeToMins(cls.s);
                const end = timeToMins(cls.e);
                if (currentMins >= start && currentMins <= end) { currentClass = cls.n; break; }
            }
        }
        const isWorkingDay = (day >= 1 && day <= 5);
        let isExceptionTime = false;
        if (currentClass === 'CS') isExceptionTime = true;
        if (day === 3 && currentClass === '自习') {
            const exceptionStart = timeToMins('16:10');
            const exceptionEnd = timeToMins('16:50');
            if (currentMins >= exceptionStart && currentMins <= exceptionEnd) isExceptionTime = true;
        }
        return { inClass: !!currentClass, className: currentClass, isWorkingDay: isWorkingDay, isException: isExceptionTime };
    }

    function getPageTitle() {
        const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                   document.querySelector('#title h1 yt-formatted-string');
        if (h1 && h1.innerText.length > 0) return h1.innerText;
        return document.title.replace(/^\(\d+\)\s*/, "").replace(" - YouTube", "");
    }

    function extractSmartTitle(title) {
        if (!title) return "Unknown";
        const regex = /[《【\[(](.*?)[》】\])]/;
        const match = title.match(regex);
        if (match && match[1] && match[1].trim().length > 1) {
            return match[1].trim();
        }
        if (title.length > 12) {
            return title.substring(0, 10) + "...";
        }
        return title;
    }

    function getLearningKeyword(text) {
        if (!text) return null;
        const keywords = getLearningKeywords();
        for (const kw of keywords) {
            if (isTitleMatch(text, kw)) {
                return kw.includes('-') ? kw : (kw.charAt(0).toUpperCase() + kw.slice(1));
            }
        }
        return null;
    }

    function checkBlockLogic(text, categoryOverride = null, channelName = null) {
        let detectedType = null;
        text = text ? text.toLowerCase() : "";
        if (channelName && BLOCK_CHANNELS.some(c => channelName.trim() === c || channelName.includes(c))) detectedType = 'CHANNEL';
        if (!detectedType && categoryOverride && CATEGORY_MAP[categoryOverride]) detectedType = CATEGORY_MAP[categoryOverride];
        if (!detectedType) {
            if (KW_POLITICS.some(kw => text.includes(kw))) detectedType = 'POLITICS';
            else if (KW_GAMES.some(kw => text.includes(kw))) detectedType = 'GAME';
        }
        if (!detectedType) return null;
        const settings = getSettings();
        if (settings.disableAll) return null;
        if (detectedType === 'CHANNEL' && !settings.disablePolitics) return "CHANNEL";
        if (detectedType === 'POLITICS' && !settings.disablePolitics) return "POLITICS";
        if (detectedType === 'GAME' && !settings.disableGame) return "GAME";
        return null;
    }

    function logInterception(content, category, source) {
        let logs = GM_getValue(LOG_KEY, []);
        const now = new Date();
        const timeStr = `${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')}`;
        if (logs.length > 0 && logs[0].content === content && (now.getTime() - logs[0].ts) < 5000) return;
        logs.unshift({ time: timeStr, content: content, category: category, source: source, ts: now.getTime() });
        if (logs.length > 50) logs = logs.slice(0, 50);
        GM_setValue(LOG_KEY, logs);
    }

    // =========================================
    // === 🚨 拦截 & 检测主逻辑 ===
    // =========================================
    function checkSearchBlock() {
        try {
            if (!window.location.hostname.includes('youtube.com')) return;
            if (!window.location.href.includes('/results')) {
                const oldBox = document.getElementById('search-block-box');
                if(oldBox) oldBox.remove();
                return;
            }
            const urlParams = new URLSearchParams(window.location.search);
            const query = decodeURIComponent(urlParams.get('search_query') || '');
            const blockType = checkBlockLogic(query);
            if (blockType) {
                const container = document.querySelector('ytd-two-column-search-results-renderer #primary');
                if (container && !container.querySelector('#search-block-box')) {
                    container.textContent = '';
                    const box = document.createElement('div');
                    box.id = 'search-block-box';
                    const htmlContent = `<div style="background:#fce8e6; color:#c5221f; padding:24px; border-radius:12px; margin:20px; display:flex; flex-direction:column; align-items:center; border:1px solid #fad2cf;"><div style="font-size:48px; margin-bottom:16px">⛔</div><div style="font-family:'Google Sans',sans-serif; font-size:22px; font-weight:500;">Access Denied</div><div style="font-size:14px; margin-top:8px">"${query}" (${blockType})</div></div>`;
                    box.innerHTML = safeHTML(htmlContent);
                    container.appendChild(box);
                    logInterception(query, blockType, "Search");
                }
            }
        } catch(e) { console.error("FS Search Error:", e); }
    }

    function isAdPlaying() {
        const adOverlay = document.querySelector('.ytp-ad-player-overlay');
        return adOverlay && adOverlay.offsetParent !== null;
    }

    function checkPlayer() {
        try {
            JACK_FOCUS_STATE.blockReason = null;
            JACK_FOCUS_STATE.debugMsg = "Checking...";

            if (isAdPlaying()) {
                JACK_FOCUS_STATE.debugMsg = "Ad Playing";
                return;
            }

            if (window.location.hostname.includes('koolearn.com')) {
                JACK_FOCUS_STATE.isLearning = true;
                JACK_FOCUS_STATE.keyword = "Koolearn";
                JACK_FOCUS_STATE.title = document.title;
                return;
            }
            if (!window.location.hostname.includes('youtube.com')) return;

            if (!window.location.href.includes('/watch') && !window.location.href.includes('/shorts/')) {
                 JACK_FOCUS_STATE.isLearning = false;
                 JACK_FOCUS_STATE.debugMsg = "Not in Player";
                 return;
            }

            const status = getCurrentStatus();
            const titleText = getPageTitle();
            const currentUrl = window.location.href;
            JACK_FOCUS_STATE.title = titleText;

            const learningKw = getLearningKeyword(titleText);
            const isTarget = currentUrl.includes(TARGET_YOUTUBE_ID);

            if (isTarget || learningKw) {
                JACK_FOCUS_STATE.isLearning = true;
                JACK_FOCUS_STATE.keyword = learningKw ? learningKw : "Target Video";
                JACK_FOCUS_STATE.debugMsg = isTarget ? "Target ID (Safe)" : "Keyword Matched";
                removeBlockScreen();
                updateLog(JACK_FOCUS_STATE.keyword, titleText, currentUrl);
                return;
            }

            const blockType = checkBlockLogic(titleText);

            if (!blockType) {
                JACK_FOCUS_STATE.isLearning = true;
                const smartTitle = extractSmartTitle(titleText);
                JACK_FOCUS_STATE.keyword = smartTitle;

                JACK_FOCUS_STATE.debugMsg = "Smart Title Active";
                removeBlockScreen();
                updateLog(smartTitle, titleText, currentUrl);
                logUnlabeledTitle(titleText);
                return;
            }

            if (status.isException) {
                JACK_FOCUS_STATE.isLearning = false;
                JACK_FOCUS_STATE.debugMsg = "Exception Time";
                removeBlockScreen();
                return;
            }

            if (blockType) {
                JACK_FOCUS_STATE.isLearning = false;
                JACK_FOCUS_STATE.debugMsg = `Blocked: ${blockType}`;
                const reason = status.isWorkingDay ? "工作日屏蔽" : "上课模式屏蔽";
                JACK_FOCUS_STATE.blockReason = `${reason} (${blockType})`;
                showBlockScreen(blockType, reason, titleText);
                if (!document.getElementById('block-overlay').getAttribute('data-logged')) {
                    logInterception(titleText, blockType, "Player");
                    document.getElementById('block-overlay').setAttribute('data-logged', 'true');
                }
            }
        } catch(e) { console.error("FS Player Error:", e); }
    }

    function sanitizePage() {
        try {
            if (!window.location.hostname.includes('youtube.com')) return;
            const status = getCurrentStatus();
            const settings = getSettings();
            if (status.isException || settings.disableAll) return;

            const selectors = ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-item-renderer', 'ytd-rich-shelf-renderer'];
            document.querySelectorAll(selectors.join(',')).forEach(item => {
                if (item.getAttribute('data-jack-checked') === 'true') return;
                let titleText = "", channelName = "";
                const titleEl = item.querySelector('#video-title') || item.querySelector('#video-title-link');
                if (titleEl) titleText = titleEl.innerText;
                const channelEl = item.querySelector('#channel-info #text') || item.querySelector('.ytd-channel-name');
                if (channelEl) channelName = channelEl.innerText;

                if (item.tagName.toLowerCase() === 'ytd-rich-shelf-renderer') {
                    const shelfTitle = item.querySelector('#title');
                    if (shelfTitle && checkBlockLogic(shelfTitle.innerText)) { item.style.display = 'none'; return; }
                }

                const blockType = checkBlockLogic(titleText, null, channelName);
                if (blockType) {
                    if (titleEl) {
                        titleEl.innerHTML = safeHTML(`<span style="color:#d93025; font-weight:700;">Illegal Video - ${blockType}</span>`);
                        titleEl.style.textDecoration = 'none';
                    }
                    const thumb = item.querySelector('ytd-thumbnail') || item.querySelector('.ytd-reel-item-renderer');
                    if (thumb && !thumb.querySelector('.illegal-overlay')) {
                        thumb.style.position = 'relative';
                        const overlay = document.createElement('div');
                        overlay.className = 'illegal-overlay';
                        overlay.innerHTML = safeHTML(`<div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:999; display:flex; flex-direction:column; justify-content:center; align-items:center; backdrop-filter: blur(4px);"><div style="font-size:24px; margin-bottom:8px">⚠️</div><div style="color:#d93025; font-family:'Google Sans',sans-serif; font-weight:700; font-size:14px;">BLOCKED</div><div style="color:#5f6368; font-size:10px; margin-top:2px;">${blockType}</div></div>`);
                        thumb.appendChild(overlay);
                        const link = item.querySelector('a');
                        if (link) { link.href = "javascript:void(0)"; link.onclick = (e) => { e.preventDefault(); e.stopPropagation(); }; }
                    }
                    item.setAttribute('data-jack-checked', 'true');
                }
            });
        } catch(e) { console.error("FS Sanitize Error:", e); }
    }

    function showBlockScreen(type, reason, detailText) {
        const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player') || document.body;
        if (!player) return;
        const video = document.querySelector('video');
        if (video && !video.paused) video.pause();
        let overlay = document.getElementById('block-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'block-overlay';
            player.appendChild(overlay);
        }
        if (player === document.body) { overlay.style.position = 'fixed'; overlay.style.zIndex = '999999'; }
        overlay.innerHTML = safeHTML(`<div style="font-size:64px; margin-bottom:24px;">🛡️</div><div style="font-size:32px; font-weight:400; margin-bottom:8px; font-family:'Google Sans',sans-serif">Access Restricted</div><div style="font-size:16px; color:#fce8e6; margin-bottom:32px; background:rgba(255,255,255,0.1); padding:6px 16px; border-radius:16px;">${type} · ${reason}</div><div style="font-size:14px; opacity:0.7; max-width:600px; line-height:1.5">${detailText}</div>`);
    }
    function removeBlockScreen() { const o = document.getElementById('block-overlay'); if (o) o.remove(); }

    // =========================================
    // === 📊 UI 与 数据 ===
    // =========================================
    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Google+Sans:wght@400;500;700&display=swap');
        #st-overlay { position: fixed; top: 24px; right: 24px; width: 340px; background: #fff; border-radius: 24px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); z-index: 2147483647; font-family: 'Roboto', sans-serif; display: none; overflow: hidden; border: 1px solid #e0e3e7; }
        #st-overlay.visible { display: block; }
        .st-header { padding: 20px 24px; color: white; display: flex; justify-content: space-between; align-items: center; transition: background 0.3s; }
        .st-header.mode-class { background: #B3261E; } .st-header.mode-break { background: #146c2e; }
        .st-header.mode-free { background: #1a73e8; } .st-header.mode-exception { background: #e37400; } .st-header.mode-unlocked { background: #5f6368; }
        .st-header.mode-learning { background: #188038; } .st-header.mode-paused { background: #d93025; }
        .st-tabs { display: flex; padding: 0 12px; border-bottom: 1px solid #f1f3f4; }
        .st-tab { flex: 1; text-align: center; padding: 16px 0; font-family: 'Google Sans'; font-size: 14px; font-weight: 500; color: #5f6368; cursor: pointer; border-bottom: 3px solid transparent; }
        .st-tab:hover { color: #1a73e8; background: #f8f9fa; border-radius: 8px 8px 0 0; }
        .st-tab.active { color: #1a73e8; border-bottom-color: #1a73e8; }
        .st-body { padding: 0; max-height: 500px; overflow-y: auto; }
        .st-view { display: none; padding: 24px; }
        .st-view.active { display: block; }
        .st-row { margin-bottom: 20px; }
        .st-label { display: flex; justify-content: space-between; font-size: 13px; color: #1f1f1f; margin-bottom: 6px; font-weight: 500; }
        .st-progress { height: 8px; background: #e2e2e2; border-radius: 4px; overflow: hidden; }
        .st-bar { height: 100%; background: #1a73e8; width: 0%; transition: width 0.3s; }
        .st-pct { font-size: 11px; color: #666; margin-left: 5px; }
        .setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 14px; color: #1f1f1f; font-family: 'Google Sans'; }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #e0e0e0; transition: .3s; border-radius: 24px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
        input:checked + .slider { background-color: #1a73e8; } input.danger:checked + .slider { background-color: #B3261E; } input:checked + .slider:before { transform: translateX(20px); }
        /* 日历样式 */
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
        .cal-day { height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px; cursor: pointer; position: relative; }
        .cal-day:hover { background: #f1f3f4; }
        .cal-day.today { background: #e8f0fe; color: #1a73e8; font-weight: bold; }
        .cal-day.active { background: #1a73e8; color: white; }
        .has-data-dot { position: absolute; bottom: 4px; width: 4px; height: 4px; background: #34a853; border-radius: 50%; }
        .cal-stats-box { background: #f8f9fa; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
        .cal-stat-title { font-size: 12px; color: #5f6368; margin-bottom: 12px; font-weight: 500; }
        .detail-list { margin-top: 0; padding-top: 0; max-height: none; }
        .detail-item { font-size: 12px; padding: 8px 0; border-bottom: 1px solid #f1f3f4; display: flex; justify-content: space-between; align-items: flex-start; }
        .detail-time { color: #999; min-width: 35px; }
        .detail-btn { background:#1a73e8; color:white; padding:2px 8px; border-radius:12px; text-decoration:none; font-size:10px; display:inline-block; font-weight:500; }
        .st-footer { padding: 12px 24px; background: #f8f9fa; border-top: 1px solid #e0e3e7; font-size: 12px; color: #757575; display: flex; justify-content: space-between; font-weight: 500; }
        #st-fab { position: fixed; bottom: 30px; right: 30px; width: 56px; height: 56px; background: #1a73e8; border-radius: 50%; box-shadow: 0 4px 12px rgba(26,115,232,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; cursor: pointer; z-index: 2147483646; transition: transform 0.2s; }
        #st-fab:hover { transform: scale(1.05); }
        #block-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #B3261E; z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; text-align: center; font-family: 'Google Sans', sans-serif; }
        .btn-action { background:#f1f3f4; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; color:#1a73e8; font-weight:500; font-size:12px; margin-top:5px; transition:0.2s; }
        .btn-action:hover { background:#e8f0fe; }
        .btn-primary { background:#1a73e8 !important; color:white !important; }
        .btn-warning { background:#f9ab00 !important; color:white !important; }
    `;
    GM_addStyle(css);

    function createUI() {
        if (document.getElementById('st-overlay')) return;
        const div = document.createElement('div');
        div.id = 'st-overlay';

        const html = `
            <div class="st-header mode-free" id="st-header-bg">
                <div style="font-family:'Google Sans'; font-weight:500; font-size:18px" id="st-header-title">Focus Pro</div>
                <div style="font-size:12px; background:rgba(255,255,255,0.2); padding:4px 10px; border-radius:16px;" id="st-class-name">...</div>
            </div>
            <div class="st-tabs">
                <div class="st-tab active" id="tab-home">统计</div>
                <div class="st-tab" id="tab-calendar">日历</div>
                <div class="st-tab" id="tab-settings">设置</div>
            </div>
            <div class="st-body">
                <div id="view-home" class="st-view active"><div id="st-stats-container"></div></div>
                <div id="view-calendar" class="st-view">
                    <div class="cal-grid" id="st-cal-grid" style="margin-bottom:20px;"></div>
                    <div id="st-cal-details">
                        <div style="text-align:center; color:#999; padding:20px">点击日期查看详情</div>
                    </div>
                </div>
                <div id="view-settings" class="st-view">
                    <div class="setting-row"><span>🔓 解除所有限制</span><label class="switch"><input type="checkbox" id="sw-all" class="danger"><span class="slider round"></span></label></div>
                    <div class="setting-row"><span>🎮 允许游戏内容</span><label class="switch"><input type="checkbox" id="sw-game"><span class="slider round"></span></label></div>
                    <div class="setting-row"><span>🏛️ 允许政治内容</span><label class="switch"><input type="checkbox" id="sw-politics"><span class="slider round"></span></label></div>

                    <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">

                    <div style="font-size:12px; color:#5f6368; margin-bottom:5px; font-weight:bold;">🤖 未分类 (第一步：复制给 AI)</div>
                    <textarea id="st-unlabeled-area" style="width:100%; height:60px; border:1px solid #ddd; border-radius:4px; font-size:11px; padding:5px; resize:vertical; background:#fafafa" readonly></textarea>
                    <button id="btn-copy-ai" class="btn-action" style="width:100%">📋 复制提示词</button>

                    <div style="margin-top:15px; font-size:12px; color:#5f6368; margin-bottom:5px; font-weight:bold;">✨ 回填 (第二步：粘贴 AI 结果)</div>
                    <textarea id="st-backfill-area" placeholder="在此粘贴 AI 给出的关键词，用逗号分隔..." style="width:100%; height:50px; border:1px solid #1a73e8; border-radius:4px; font-size:11px; padding:5px; resize:vertical;"></textarea>
                    <button id="btn-submit-backfill" class="btn-action btn-primary" style="width:100%">🚀 添加并自动清理</button>

                    <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">

                    <div style="font-size:12px; color:#5f6368; margin-bottom:5px; font-weight:bold;">📚 核心关键词库 (可全量编辑)</div>
                    <textarea id="st-kw-library" style="width:100%; height:120px; border:1px solid #ddd; border-radius:4px; font-size:11px; padding:5px; resize:vertical; font-family:monospace;"></textarea>
                    <button id="btn-save-library" class="btn-action btn-warning" style="width:100%">💾 保存库并回溯合并历史</button>
                </div>
            </div>
            <div class="st-footer">
                <span id="st-status-msg">Active</span>
                <span style="font-size:9px; color:#aaa; margin-left:auto;" id="st-debug-info">Init</span>
            </div>
        `;
        div.innerHTML = safeHTML(html);
        document.body.appendChild(div);

        if (!document.getElementById('st-fab')) {
            const fab = document.createElement('div');
            fab.id = 'st-fab';
            fab.innerHTML = safeHTML('🛡️');
            fab.onclick = togglePanel;
            document.body.appendChild(fab);
        }

        const views = ['home', 'calendar', 'settings'];
        views.forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            if(el) {
                el.onclick = () => {
                    views.forEach(x => { document.getElementById(`view-${x}`).classList.remove('active'); document.getElementById(`tab-${x}`).classList.remove('active'); });
                    document.getElementById(`view-${t}`).classList.add('active'); document.getElementById(`tab-${t}`).classList.add('active');
                    if(t==='calendar') renderCalendar();
                    if(t==='settings') loadSettingsView();
                };
            }
        });

        const settings = getSettings();
        const swAll = document.getElementById('sw-all'), swGame = document.getElementById('sw-game'), swPol = document.getElementById('sw-politics');
        if(swAll) {
            swAll.checked = settings.disableAll; swGame.checked = settings.disableGame; swPol.checked = settings.disablePolitics;
            const updateSw = () => {
                saveSettings({ disableAll: swAll.checked, disableGame: swGame.checked, disablePolitics: swPol.checked });
                updateUI(); location.reload();
            };
            swAll.onchange = updateSw; swGame.onchange = updateSw; swPol.onchange = updateSw;
        }

        document.getElementById('btn-copy-ai').onclick = () => {
            const list = GM_getValue(UNLABELED_KEY, []);
            if (list.length === 0) { alert("暂无未分类视频"); return; }
            const prompt = `请帮我分析以下视频标题，提取最核心的“主题关键词”或“精简名称”。
规则：
1. 学习类：提取学科或技能（如 Python, History, 雅思）。
2. 音乐/娱乐类：提取“人名 - 作品”或“游戏/电影名”（例如：标题是“羅大佑 Lo Da-Yu【火車】Official Music Video”，请提取“羅大佑 - 火車”；标题是“原神攻略”，请提取“原神”）。
3. 格式：请按逗号分隔输出所有提取后的关键词，不要换行，不要序号，不要多余解释。

待分析列表：
${list.join('\n')}`;
            GM_setClipboard(prompt);
            alert("✅ 已复制提示词！请粘贴给 AI。");
        };

        // 回填逻辑
        document.getElementById('btn-submit-backfill').onclick = () => {
            const val = document.getElementById('st-backfill-area').value;
            if(!val) return;
            const count = addKeywordsAndClean(val);
            if(count > 0) {
                alert(`✅ 成功添加 ${count} 个关键词，并已自动合并历史数据！`);
                document.getElementById('st-backfill-area').value = '';
                loadSettingsView();
            } else {
                alert("⚠️ 未检测到有效关键词，或输入为空");
            }
        };

        // 库手动保存逻辑
        document.getElementById('btn-save-library').onclick = () => {
            const raw = document.getElementById('st-kw-library').value;
            if(!raw) return;
            const newKws = raw.split(/[,，\n]/).map(s => s.trim()).filter(s => s.length > 0);
            saveLearningKeywords(newKws);
            alert("✅ 词库已保存，历史数据已自动合并！");
            loadSettingsView();
        };
    }

    function loadSettingsView() {
        document.getElementById('st-unlabeled-area').value = GM_getValue(UNLABELED_KEY, []).join('\n');
        document.getElementById('st-kw-library').value = getLearningKeywords().join(', ');
    }

    function togglePanel() {
        const panel = document.getElementById('st-overlay');
        if (!panel) return;
        if (panel.style.display === 'none') { panel.style.display = 'block'; panel.classList.add('visible'); updateUI(); }
        else { panel.style.display = 'none'; panel.classList.remove('visible'); }
    }

    function renderCalendar() {
        const grid = document.getElementById('st-cal-grid');
        if(!grid) return;
        grid.textContent = '';
        const history = getHistoryData();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString();
            const record = history[dateStr];
            const el = document.createElement('div');
            el.className = `cal-day ${i===0?'today':''}`;
            el.innerHTML = safeHTML(`${d.getDate()}${record ? '<div class="has-data-dot"></div>' : ''}`);
            el.onclick = () => {
                document.querySelectorAll('.cal-day').forEach(e => e.classList.remove('active'));
                el.classList.add('active');
                showDayDetails(dateStr, record);
            };
            grid.appendChild(el);
        }
    }

    function showDayDetails(dateStr, record) {
        const container = document.getElementById('st-cal-details');
        if (!record) {
            container.innerHTML = safeHTML(`<div style="text-align:center;color:#999;margin-top:20px">${dateStr} 无数据</div>`);
            return;
        }

        let html = '';
        if (record.total_youtube > 0) {
            html += `<div class="cal-stats-box"><div class="cal-stat-title">${dateStr} 学习统计 (总计: ${Math.floor(record.total_youtube/60)}m)</div>`;
            const sortedKeys = Object.keys(record.details).sort((a,b) => record.details[b] - record.details[a]);
            sortedKeys.forEach(key => {
                const time = Math.floor(record.details[key] / 60);
                const pct = Math.min(100, (record.details[key] / record.total_youtube) * 100);
                html += `<div class="st-row" style="margin-bottom:10px" title="${key}"><div class="st-label" style="font-size:12px; margin-bottom:4px"><span>${key}</span><span>${time}m <span class="st-pct">(${Math.floor(pct)}%)</span></span></div><div class="st-progress"><div class="st-bar" style="width:${pct}%"></div></div></div>`;
            });
            html += `</div>`;
        }
        if (record.logs && record.logs.length > 0) {
            html += `<div class="detail-list">`;
            [...record.logs].reverse().forEach(log => {
                html += `<div class="detail-item"><div style="flex:1; margin-right:10px;"><div style="color:#999; font-size:10px; margin-bottom:2px">${log.time} <span style="color:#1a73e8; font-weight:700; margin-left:4px">[${log.keyword}]</span></div><div style="line-height:1.3; color:#333;">${log.title}</div></div><a href="${log.url}" target="_blank" class="detail-btn">▶ 继续</a></div>`;
            });
            html += `</div>`;
        } else { html += `<div style="text-align:center;color:#999;font-size:12px;margin-top:10px">无详细日志</div>`; }
        container.innerHTML = safeHTML(html);
    }

    function updateUI() {
        const panel = document.getElementById('st-overlay');
        if (!panel) return;
        const status = getCurrentStatus();
        const settings = getSettings();
        const header = document.getElementById('st-header-bg');
        const title = document.getElementById('st-header-title');
        const classBadge = document.getElementById('st-class-name');
        const msg = document.getElementById('st-status-msg');
        const debug = document.getElementById('st-debug-info');

        if (settings.disableAll) { header.className = 'st-header mode-unlocked'; classBadge.innerText = '已解锁'; msg.innerText = '休眠模式'; }
        else if (JACK_FOCUS_STATE.isLearning) {
            if (JACK_FOCUS_STATE.isPaused) { header.className = 'st-header mode-paused'; title.innerText = '暂停学习'; classBadge.innerText = JACK_FOCUS_STATE.keyword; msg.innerText = '请回到视频'; }
            else { header.className = 'st-header mode-learning'; title.innerText = '正在学习'; classBadge.innerText = JACK_FOCUS_STATE.keyword; msg.innerText = '记录中...'; }
        } else if (status.isException) { header.className = 'st-header mode-exception'; title.innerText = 'Focus Pro'; classBadge.innerText = `${status.className}`; msg.innerText = '特许时间'; }
        else if (status.inClass) { header.className = 'st-header mode-class'; title.innerText = 'Focus Pro'; classBadge.innerText = `${status.className}`; msg.innerText = '上课模式'; }
        else if (status.isWorkingDay) { header.className = 'st-header mode-break'; title.innerText = 'Focus Pro'; classBadge.innerText = '课间'; msg.innerText = '屏蔽开启'; }
        else { header.className = 'st-header mode-free'; title.innerText = 'Focus Pro'; classBadge.innerText = '日常'; msg.innerText = '运行中'; }

        if(debug) debug.innerText = JACK_FOCUS_STATE.debugMsg || "OK";

        if (document.getElementById('view-home').classList.contains('active')) {
            const d = getHistoryData();
            const today = getTodayStr();
            const todayData = d[today];
            const container = document.getElementById('st-stats-container');
            if (!todayData || todayData.total_youtube === 0) {
                container.innerHTML = safeHTML('<div style="text-align:center; color:#999; margin-top:40px; font-size:13px">今天尚未开始学习<br>加油！💪</div>');
            } else {
                let html = `<div style="margin-bottom:15px; font-size:12px; color:#5f6368; text-align:right">今日总计: <span style="font-weight:bold; color:#1a73e8">${Math.floor(todayData.total_youtube/60)}</span> 分钟</div>`;
                const sortedKeys = Object.keys(todayData.details).sort((a,b) => todayData.details[b] - todayData.details[a]);
                sortedKeys.forEach(key => {
                    const time = Math.floor(todayData.details[key] / 60);
                    const pct = Math.min(100, (todayData.details[key] / todayData.total_youtube) * 100);
                    html += `<div class="st-row" title="${key}"><div class="st-label"><span>${key}</span><span>${time}m <span class="st-pct">(${Math.floor(pct)}%)</span></span></div><div class="st-progress"><div class="st-bar" style="width:${pct}%"></div></div></div>`;
                });
                container.innerHTML = safeHTML(html);
            }
        }
    }

    // =========================================
    // === 🔄 初始化 & 循环 ===
    // =========================================
    const initLoop = setInterval(() => {
        if (document.body) {
            clearInterval(initLoop);
            try {
                // 初始化时尝试合并一次
                mergeHistoricalData();
                createUI();
            } catch(e) { console.error("UI Init failed", e); }

            document.addEventListener("fullscreenchange", () => {
                const fab = document.getElementById('st-fab');
                if (!fab) return;
                if (document.fullscreenElement) fab.style.display = 'none';
                else fab.style.display = 'flex';
            });

            setInterval(() => {
                try {
                    checkPlayer();
                    const v = document.querySelector('video');
                    const isVisible = !document.hidden;
                    const isPlaying = v && !v.paused && !v.ended && v.readyState > 2;

                    if (JACK_FOCUS_STATE.isLearning) {
                        if (!isPlaying || !isVisible) {
                            JACK_FOCUS_STATE.isPaused = true;
                        } else {
                            JACK_FOCUS_STATE.isPaused = false;
                            if (!document.getElementById('block-overlay')) tickTime(JACK_FOCUS_STATE.keyword);
                        }
                    } else { JACK_FOCUS_STATE.isPaused = false; }
                    updateUI();
                } catch(e) { console.error("Loop error", e); }
            }, 1000);

            const observer = new MutationObserver(() => {
                try { sanitizePage(); checkPlayer(); checkSearchBlock(); } catch(e) {}
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }, 100);

    window.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
            e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault();
            togglePanel();
        }
    }, true);

})();