// ==UserScript==
// @name         BestExamHelp Batch Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  尝试将 BestExamHelp 上的 .php 页面链接转换为 .pdf 并批量下载。适用于 IGCSE/A-Level 页面。
// @author       Jack's AI
// @match        https://bestexamhelp.com/exam/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bestexamhelp.com
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    const header = document.querySelector('main h1');
    if (!header) return;

    const button = document.createElement('button');
    button.innerText = '📥 一键下载所有 PDF';
    button.style.marginLeft = '20px';
    button.style.padding = '10px 20px';
    button.style.backgroundColor = '#d9534f';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.style.fontWeight = 'bold';

    button.onclick = async function() {
        const links = document.querySelectorAll('main ul li a');
        if (links.length === 0) {
            alert('未找到可下载的链接！');
            return;
        }

        if (!confirm(`找到 ${links.length} 个文件。\n\n注意：脚本将尝试把 .php 链接转换为 .pdf 直接下载链接。\n是否开始批量下载？`)) return;

        button.innerText = '正在下载...';
        button.disabled = true;

        for (const link of links) {
            const urlParts = link.href.split('/');
            let fileName = urlParts[urlParts.length - 1];
            let pdfUrl = link.href;

            if (fileName.endsWith('.php')) {
                fileName = fileName.replace(/-/g, '_').replace('.php', '.pdf');
                urlParts[urlParts.length - 1] = fileName;
                pdfUrl = urlParts.join('/');
            }

            GM_download({
                url: pdfUrl,
                name: fileName,
                saveAs: false,
                onload: () => console.log(`✅ 成功: ${fileName}`),
                onerror: error => console.error(`❌ 失败: ${fileName}`, error)
            });

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        setTimeout(() => {
            button.innerText = '📥 下载完成 (看控制台)';
            button.disabled = false;
        }, 1000);
    };

    header.appendChild(button);
})();
