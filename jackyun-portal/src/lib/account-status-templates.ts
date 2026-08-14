const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const frame = (eyebrow: string, title: string, body: string, accent: string) => `
  <section style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#182230">
    <div style="display:inline-flex;align-items:center;gap:8px;border-radius:999px;background:${accent}12;color:${accent};padding:7px 11px;font-size:12px;font-weight:700;letter-spacing:.04em">${eyebrow}</div>
    <h1 style="margin:18px 0 10px;font-size:30px;line-height:1.2;letter-spacing:-.035em">${title}</h1>
    ${body}
  </section>
`;

export function suspendedAccountHtml(reason: string | null, explanation: string | null) {
  const safeReason = escapeHtml(reason || '账户需要进一步审核');
  const safeExplanation = escapeHtml(explanation || '管理员尚未提供补充说明。你可以通过下方申诉入口补充情况。');
  return frame(
    'ACCOUNT PAUSED',
    '你的账户目前已被暂停',
    `<p style="margin:0;color:#475467;font-size:15px;line-height:1.75">在审核完成前，工作台和个人数据功能暂时不可使用。账户数据仍会安全保留。</p>
     <div style="margin-top:24px;border:1px solid #fedf89;background:#fffaeb;border-radius:16px;padding:18px">
       <p style="margin:0 0 6px;color:#93370d;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em">暂停原因</p>
       <p style="margin:0;color:#7a2e0e;font-size:17px;font-weight:700">${safeReason}</p>
       <p style="margin:12px 0 0;color:#93370d;font-size:14px;line-height:1.7;white-space:pre-wrap">${safeExplanation}</p>
     </div>
     <p style="margin:20px 0 0;color:#667085;font-size:13px;line-height:1.7">如果你认为这是误判，或有新的信息需要说明，可以创建申诉工单并与管理员持续沟通。</p>`,
    '#b54708',
  );
}

export function deletionRecoveryHtml(deletedAt: string, deadline: string) {
  const deletedLabel = escapeHtml(new Date(deletedAt).toLocaleString('zh-CN'));
  const deadlineLabel = escapeHtml(new Date(deadline).toLocaleString('zh-CN'));
  return frame(
    'RECOVERY WINDOW',
    '你的账户正在等待注销',
    `<p style="margin:0;color:#475467;font-size:15px;line-height:1.75">账户已停用，但认证信息和个人数据会在 30 天恢复期内继续保留。恢复后可以继续使用原有账号和数据。</p>
     <div style="margin-top:24px;border:1px solid #b2ddff;background:#eff8ff;border-radius:16px;padding:18px">
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
         <div><p style="margin:0;color:#175cd3;font-size:12px;font-weight:700">申请注销时间</p><p style="margin:6px 0 0;color:#1849a9;font-size:14px;font-weight:700">${deletedLabel}</p></div>
         <div><p style="margin:0;color:#175cd3;font-size:12px;font-weight:700">恢复截止时间</p><p style="margin:6px 0 0;color:#1849a9;font-size:14px;font-weight:700">${deadlineLabel}</p></div>
       </div>
     </div>
     <p style="margin:20px 0 0;color:#667085;font-size:13px;line-height:1.7">在截止时间前提交恢复申请，管理员确认后会重新启用账户。超过恢复期后将无法通过此流程恢复。</p>`,
    '#175cd3',
  );
}
