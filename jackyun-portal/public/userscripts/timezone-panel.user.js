// ==UserScript==
// @name         Timezone Panel · Bilibili & Discord (show CST)
// @namespace    https://github.com/your-namespace
// @version      5.1.0
// @description  You are BJT (UTC+8). Shows their CST (UTC-6) time next to every message on Bilibili and Discord.
// @author       Claude
// @match        https://message.bilibili.com/*
// @match        https://discord.com/channels/*
// @match        https://discord.com/@me*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const IS_DISCORD  = location.hostname === 'discord.com';
    const IS_BILIBILI = location.hostname === 'message.bilibili.com';

    // ── Helpers ───────────────────────────────────────────────────────────────
    const pad = n => String(n).padStart(2, '0');

    // Format a Date using UTC-based getUTC* — immune to local system timezone.
    // We manually shift the UTC epoch so getUTC* reads as CST wall-clock.
    // CST = UTC−6, so we subtract 6h from the UTC ms, then read via getUTC*.
    function utcToCST(utcDate) {
        // Shift epoch by −6h so getUTC* gives CST wall-clock values
        return new Date(utcDate.getTime() - 6 * 3_600_000);
    }

    function fmt12UTC(shifted) {
        // Read via getUTC* because local getHours() would apply system timezone again
        const h = shifted.getUTCHours(), m = shifted.getUTCMinutes(), s = shifted.getUTCSeconds();
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${pad(h % 12 || 12)}:${pad(m)}:${pad(s)} ${ampm}`;
    }

    function fmt12NoSecUTC(shifted) {
        const h = shifted.getUTCHours(), m = shifted.getUTCMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${pad(h % 12 || 12)}:${pad(m)} ${ampm}`;
    }

    function fmtDateUTC(shifted) {
        return `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth()+1)}/${pad(shifted.getUTCDate())}`;
    }

    function fmtWeekdayUTC(shifted) {
        return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][shifted.getUTCDay()];
    }

    function fmtBadgeUTC(shifted) {
        return `CST ${pad(shifted.getUTCMonth()+1)}/${pad(shifted.getUTCDate())} ${fmt12NoSecUTC(shifted)}`;
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    const CSS = `
        #tz-float-panel {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99999;
            width: 210px;
            background: #111214;
            border-radius: 14px;
            box-shadow: 0 8px 36px rgba(0,0,0,.55);
            font-family: 'SF Mono','Consolas','Menlo',monospace;
            color: #e0e0e0;
            user-select: none;
            border: 1px solid rgba(255,255,255,.09);
            overflow: hidden;
        }
        #tz-float-panel .tzp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 12px 5px;
            background: rgba(255,255,255,.04);
            border-bottom: 1px solid rgba(255,255,255,.07);
            cursor: grab;
            font-size: 10px;
            letter-spacing: .1em;
            color: #999;
            text-transform: uppercase;
        }
        #tz-float-panel .tzp-header:active { cursor: grabbing; }
        #tz-float-panel .tzp-close {
            cursor: pointer; color: #555; font-size: 14px;
            padding: 0 2px; transition: color .15s;
        }
        #tz-float-panel .tzp-close:hover { color: #f04747; }
        #tz-float-panel .tzp-block { padding: 10px 14px 12px; }
        #tz-float-panel .tzp-label {
            font-size: 10px; letter-spacing: .1em;
            text-transform: uppercase; margin-bottom: 3px; color: #59c4e6;
        }
        #tz-float-panel .tzp-time {
            font-size: 20px; font-weight: 600;
            letter-spacing: .02em; color: #f0f0f0; line-height: 1.2;
        }
        #tz-float-panel .tzp-date { font-size: 11px; color: #777; margin-top: 2px; }

        .tz-cst-badge {
            display: inline-flex;
            align-items: center;
            margin-left: 8px;
            font-size: 10.5px;
            font-family: 'SF Mono','Consolas','Menlo',monospace;
            border-radius: 12px;
            padding: 1px 8px;
            vertical-align: middle;
            white-space: nowrap;
            background: rgba(89,196,230,.13);
            color: #59c4e6;
            opacity: .85;
            transition: opacity .15s;
            cursor: default;
        }
        .tz-cst-badge:hover { opacity: 1; }
    `;

    function injectCSS() {
        if (document.getElementById('tz-cst-styles')) return;
        const s = document.createElement('style');
        s.id = 'tz-cst-styles';
        s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    // ── Floating Panel ────────────────────────────────────────────────────────
    // new Date() reflects system clock = BJT (UTC+8).
    // To get CST we convert: BJT is UTC+8, so UTC = BJT−8h, then CST = UTC−6h = BJT−14h.
    // But we still use the UTC trick: getTime() is always UTC epoch regardless of system tz.
    function createPanel() {
        if (document.getElementById('tz-float-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'tz-float-panel';
        panel.innerHTML = `
            <div class="tzp-header" id="tzp-drag">
                🌎 Their Time (CST)
                <span class="tzp-close" id="tzp-close">✕</span>
            </div>
            <div class="tzp-block">
                <div class="tzp-label">Them · CST (UTC−6)</div>
                <div class="tzp-time" id="tzp-cst-time">--:--:-- --</div>
                <div class="tzp-date" id="tzp-cst-date">----/--/-- ---</div>
            </div>
        `;
        document.body.appendChild(panel);
        document.getElementById('tzp-close').addEventListener('click', () => panel.remove());
        makeDraggable(panel, document.getElementById('tzp-drag'));
    }

    function makeDraggable(panel, handle) {
        let ox = 0, oy = 0, sx = 0, sy = 0;
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            const r = panel.getBoundingClientRect();
            panel.style.bottom = panel.style.right = 'auto';
            panel.style.top  = (ox = r.top)  + 'px';
            panel.style.left = (oy = r.left) + 'px';
            sx = e.clientX; sy = e.clientY;
            const move = e => {
                panel.style.left = (oy + e.clientX - sx) + 'px';
                panel.style.top  = (ox + e.clientY - sy) + 'px';
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    function tickPanel() {
        const timeEl = document.getElementById('tzp-cst-time');
        const dateEl = document.getElementById('tzp-cst-date');
        if (!timeEl) return;
        // new Date().getTime() is always UTC epoch — safe regardless of system tz
        const cst = utcToCST(new Date());
        timeEl.textContent = fmt12UTC(cst);
        dateEl.textContent = `${fmtDateUTC(cst)} ${fmtWeekdayUTC(cst)}`;
    }

    // ── Discord ───────────────────────────────────────────────────────────────
    // datetime="2026-05-14T23:44:35.571Z" is UTC.
    // UTC 23:44 → CST = 23:44 − 6h = 17:44 (same day May 14).
    function labelDiscordMsg(msgEl) {
        if (msgEl.querySelector('.tz-cst-badge')) return;
        const timeEl = msgEl.querySelector('time[datetime]');
        if (!timeEl) return;

        const utcDate = new Date(timeEl.getAttribute('datetime'));
        if (isNaN(utcDate)) return;

        const cst = utcToCST(utcDate);           // shift epoch, read via getUTC*
        const badge = document.createElement('span');
        badge.className = 'tz-cst-badge';
        badge.title = 'Their time (CST, UTC−6)';
        badge.textContent = fmtBadgeUTC(cst);

        const insertAfter = timeEl.closest('span') || timeEl;
        insertAfter.parentNode?.insertBefore(badge, insertAfter.nextSibling);
    }

    function scanDiscord() {
        document.querySelectorAll('li.messageListItem__5126c .message__5126c')
            .forEach(labelDiscordMsg);
    }

    // ── Bilibili ──────────────────────────────────────────────────────────────
    // Bilibili times are displayed in BJT. Your system clock is also BJT,
    // so new Date() correctly interprets the parsed numbers as local (BJT) time.
    // Then we call .getTime() (UTC epoch) and subtract 6h to get CST.
    function parseBilibiliTime(raw, now = new Date()) {
        let m;
        if ((m = raw.match(/^(\d+)分钟前$/)))   return new Date(now - m[1] * 60_000);
        if ((m = raw.match(/^(\d+)小时前$/)))   return new Date(now - m[1] * 3_600_000);
        if (raw === '刚刚')                       return now;
        if ((m = raw.match(/^今天\s+(\d{1,2}):(\d{2})$/))) {
            const d = new Date(now); d.setHours(+m[1],+m[2],0,0); return d;
        }
        if ((m = raw.match(/^昨天\s+(\d{1,2}):(\d{2})$/))) {
            const d = new Date(now); d.setDate(d.getDate()-1); d.setHours(+m[1],+m[2],0,0); return d;
        }
        if ((m = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/)))
            return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
        if ((m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/)))
            return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
        if ((m = raw.match(/^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/))) {
            let d = new Date(now.getFullYear(),+m[1]-1,+m[2],+m[3],+m[4]);
            if (d > now) d.setFullYear(d.getFullYear()-1);
            return d;
        }
        return now;
    }

    function labelBilibiliMsg(msgEl) {
        if (msgEl.querySelector('.tz-cst-badge')) return;
        const timeEl = msgEl.querySelector('._Msg__Time_o7f0t_25');
        if (!timeEl) return;
        const raw = timeEl.innerText.trim();
        if (!raw) return;

        // parseBilibiliTime returns a Date whose epoch is correct UTC ms
        // (because system tz = BJT, so new Date(y,m,d,h,min) uses BJT correctly)
        const bjt = parseBilibiliTime(raw);   // BJT wall-clock → correct UTC epoch
        const cst = utcToCST(bjt);            // subtract 6h, read via getUTC*

        const badge = document.createElement('span');
        badge.className = 'tz-cst-badge';
        badge.title = 'Their time (CST, UTC−6)';
        badge.textContent = fmtBadgeUTC(cst);
        timeEl.parentNode?.insertBefore(badge, timeEl.nextSibling);
    }

    function scanBilibili() {
        document.querySelectorAll('._Msg_o7f0t_1').forEach(labelBilibiliMsg);
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        injectCSS();
        createPanel();
        setInterval(tickPanel, 1000);
        tickPanel();

        const scan = IS_DISCORD ? scanDiscord : scanBilibili;
        setTimeout(scan, 1200);

        const obs = new MutationObserver(muts => {
            if (muts.some(m => m.addedNodes.length)) setTimeout(scan, 150);
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setInterval(scan, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();