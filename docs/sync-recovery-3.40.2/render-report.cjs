const fs=require('node:fs');
const path=require('node:path');
const deps=process.env.JACKYUN_ARTIFACT_PACKAGES||'C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(deps,'playwright'));
const renderer=process.env.JACKYUN_DOCX_PREVIEW||require.resolve('docx-preview/dist/docx-preview.min.js',{paths:[deps]});
(async()=>{
 const out=path.join(__dirname,'docx-render');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {const page=await browser.newPage({viewport:{width:1080,height:1500}});await page.setContent('<html><body><div id="document"></div></body></html>');await page.addScriptTag({path:path.join(deps,'jszip/dist/jszip.min.js')});await page.addScriptTag({path:renderer});
 await page.evaluate(async bytes=>{await docx.renderAsync(new Uint8Array(bytes),document.getElementById('document'),null,{breakPages:true,ignoreLastRenderedPageBreak:false});await document.fonts.ready;},Array.from(fs.readFileSync(path.join(__dirname,'正式版同步账号核验恢复修复3.40.2.docx'))));
 const pages=page.locator('section.docx'),results=[];for(let i=0;i<await pages.count();i++){const p=pages.nth(i);results.push(await p.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,contentBottom:el.querySelector('article')?.getBoundingClientRect().bottom,pageBottom:el.getBoundingClientRect().bottom})));await p.screenshot({path:path.join(out,`page-${i+1}.png`)});}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({renderer:'docx-preview browser; packaged LibreOffice render unavailable because soffice.exe is not installed',pages:results},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
