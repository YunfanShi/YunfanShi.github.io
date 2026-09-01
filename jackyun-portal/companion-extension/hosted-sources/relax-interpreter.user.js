// ==UserScript==
// @name         Jack's Relax Interpreter (Lite)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  为 Relax.html 仅添加指令解释功能 (去除控制台UI)
// @author       Gemini
// @match        https://yunfanshi.github.io/Relax.html
// @match        https://yunfanshi.github.io/*.html
// @match        file:///*Relax*.html
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const primaryColor = '#1a73e8';
    const commandDictionary = {
        'THEME: DRAGON_RAJA_RED': '🔥 切换主题: 龙族·红',
        'THEME: ERI_PINK': '🌸 切换主题: 绘梨衣·粉',
        'THEME: DEFAULT': '🔵 切换主题: 默认蓝',
        'UI_LEVEL: MINIMAL': '🍃 UI模式: 极简 (隐藏侧栏)',
        'UI_LEVEL: COMBAT': '⚔️ UI模式: 战斗 (完整显示)',
        'MED: SPINE_LOCK': '🦴 医疗: 强制锁屏 (护脊)',
        'MED: EYE_AMBER': '👁️ 医疗: 护眼模式',
        'MED: BREATH_SYNC': '🫁 医疗: 呼吸训练',
        'MISSION: ADD_DEADLINE': '📅 任务: 设定考试倒计时',
        'MISSION: IELTS_TIMER': '⏱️ 任务: 雅思计时 (20min)',
        'MISSION: NAV_STUDY': '🚀 导航: 跳转学习页',
        'EFFECT: MATRIX': '📟 特效: 黑客帝国代码雨',
        'EFFECT: EXPLOSION': '💥 特效: 屏幕震动',
        'TOOL: COLOR_GEN': '🎨 工具: 生成配色',
        'ZEN_SCREEN': '🧘 模式: 禅 (黑屏)',
        'DEBUG': '🔧 调试信息'
    };

    function processNode(node) {
        if (node.dataset.explained === 'true') return;
        const regex = /\[([A-Z_]+)(?::\s*([^\]<]+))?\]/g;
        if (!regex.test(node.innerHTML)) return;
        regex.lastIndex = 0;
        node.innerHTML = node.innerHTML.replace(regex, (match, tag, value) => {
            const key = value ? `${tag}: ${value.trim()}` : tag;
            const explanation = commandDictionary[key] || `⚙️ 执行指令: ${key}`;
            return `<span style="color:${primaryColor};font-weight:bold;font-family:monospace">${match}</span><span style="font-size:12px;color:#999;background:#f1f3f4;padding:2px 6px;border-radius:4px;vertical-align:middle;margin-left:4px">${explanation}</span>`;
        });
        node.dataset.explained = 'true';
    }

    function explainCommands() {
        const chatBox = document.querySelector('#chat-box');
        if (!chatBox) return;
        new MutationObserver(mutations => {
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.classList.contains('bubble') && node.classList.contains('ai')) processNode(node);
            }));
        }).observe(chatBox, { childList: true });
        document.querySelectorAll('.bubble.ai').forEach(processNode);
    }

    window.addEventListener('load', () => {
        explainCommands();
        console.log("Jack's Interpreter (Lite) Running...");
    });
})();
