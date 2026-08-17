// ==UserScript==
// @name         ZNotes 刷题助手 - v2.3 极致稳定版
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  保留 v1.6 核心点击逻辑，仅增加 Google 风格对错弹窗，不破坏网页布局
// @author       Gemini
// @match        https://znotes.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes gSlideDown {
            0% { transform: translate(-50%, -30px); opacity: 0; }
            100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .google-toast-ui {
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
            padding: 10px 24px; border-radius: 50px; color: white;
            font-family: sans-serif; font-weight: bold; font-size: 16px;
            z-index: 2147483647; pointer-events: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            display: none; animation: gSlideDown 0.3s ease-out;
        }
        .google-toast-ui.is-correct { background-color: #34a853; display: block; }
        .google-toast-ui.is-wrong { background-color: #ea4335; display: block; }
    `;
    document.head.appendChild(style);

    const toast = document.createElement('div');
    toast.className = 'google-toast-ui';
    document.body.appendChild(toast);

    const showPop = (type, text) => {
        toast.innerText = text;
        toast.className = `google-toast-ui is-${type}`;
        setTimeout(() => { toast.className = 'google-toast-ui'; }, 1200);
    };

    const getQuizOptions = () => {
        const container = document.querySelector('.attempt-quiz, main');
        if (!container) return [];
        const selectors = ['[class*="option-card"]', '.attempt-quiz-type-card', '[class*="QuizOption"]', 'div[role="button"]', '.zn-button-outlined'];
        for (const selector of selectors) {
            const found = container.querySelectorAll(selector);
            if (found.length > 0) return Array.from(found);
        }
        return Array.from(container.querySelectorAll('div')).filter(el => {
            const computedStyle = window.getComputedStyle(el);
            return el.innerText.trim().length > 0 && el.innerText.length < 300 && (computedStyle.borderWidth !== '0px' || computedStyle.cursor === 'pointer');
        }).slice(0, 4);
    };

    const smartClick = (el) => {
        if (!el) return;
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
        const input = el.querySelector('input');
        if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    const observer = new MutationObserver(() => {
        const isCorrect = document.querySelector('[style*="rgb(52, 168, 83)"], [class*="Correct"]');
        const isWrong = document.querySelector('[style*="rgb(234, 67, 53)"], [class*="Incorrect"]');
        if (isCorrect && !toast.classList.contains('is-correct')) showPop('correct', '✓ Correct');
        else if (isWrong && !toast.classList.contains('is-wrong')) showPop('wrong', '✕ Incorrect');
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key >= '1' && e.key <= '4') {
            const options = getQuizOptions();
            const index = parseInt(e.key, 10) - 1;
            if (options[index]) {
                options[index].style.transform = 'scale(0.98)';
                setTimeout(() => { options[index].style.transform = ''; }, 100);
                smartClick(options[index]);
            }
        }
        if (e.key === 'Enter') {
            const nextButton = document.querySelector('.attempt-quiz-footer button, button.zn-button-filled:not([disabled]), [class*="NextQuestion"]');
            if (nextButton) smartClick(nextButton);
        }
    }, true);

    console.log('%c[ZNotes v2.3] 极致稳定版已启动 - 仅保留 v1.6 核心逻辑', 'color: #34a853; font-weight: bold;');
})();
