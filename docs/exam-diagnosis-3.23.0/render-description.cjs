const fs=require('node:fs'),path=require('node:path');
const deps='C:/Users/syf26/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(deps,'playwright'));
(async()=>{
 const out=path.join(__dirname,'docx-render');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:1600}});await page.setContent('<html><body><div id="document"></div></body></html>');
  await page.addScriptTag({path:path.join(deps,'jszip/dist/jszip.min.js')});
  await page.addScriptTag({path:'C:/Users/syf26/AppData/Local/Temp/jackyun-studyguide-20261013/docx-preview/package/dist/docx-preview.min.js'});
  await page.evaluate(async bytes=>{await docx.renderAsync(new Uint8Array(bytes),document.getElementById('document'),null,{breakPages:true,ignoreLastRenderedPageBreak:false});await document.fonts.ready;},Array.from(fs.readFileSync(path.join(__dirname,'JackYun-3.23.0-Exam-Diagnosis-20261015.docx'))));
  const pages=page.locator('section.docx'),results=[];
  for(let i=0;i<await pages.count();i++) {const p=pages.nth(i);results.push(await p.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,contentBottom:el.querySelector('article')?.getBoundingClientRect().bottom,pageBottom:el.getBoundingClientRect().bottom})));await p.screenshot({path:path.join(out,`page-${i+1}.png`)});}
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({renderer:'docx-preview fallback; render_docx.py failed because soffice.exe is unavailable',pages:results},null,2));console.log(JSON.stringify(results));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
