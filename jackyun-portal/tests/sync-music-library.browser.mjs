import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-sandbox']});
let cloud={revision:null,playlists:[]};const errors=[];
async function device(legacy=[]){
 const context=await browser.newContext();await context.addInitScript(data=>localStorage.setItem('v45_songs',JSON.stringify(data)),legacy);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname!=='music.test')return route.abort();
  if(url.pathname==='/api/sync-music-library'){
   if(req.method()==='GET')return route.fulfill({json:{owner:'same-user',...cloud}});
   const body=req.postDataJSON();if(body.revision!==cloud.revision)return route.fulfill({status:409,json:{conflict:true}});
   cloud={revision:randomUUID(),playlists:body.playlists};return route.fulfill({json:{revision:cloud.revision}});
  }
  if(url.pathname==='/api/music-clock')return route.fulfill({json:{receivedAt:Date.now(),sentAt:Date.now()}});
  if(url.pathname.startsWith('/api/answer-sheet-sync'))return route.fulfill({json:{broadcasts:[],ok:true}});
  const p=url.pathname==='/'?'MusicPlayerSync.html':url.pathname.slice(1);
  try{return route.fulfill({body:readFileSync('public/'+p),contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://music.test/');return {context,page};
}
try{
 const a=await device([{id:'123',name:'旧歌曲'}]);await a.page.getByText('歌单已同步').waitFor();
 await a.page.locator('#create-playlist summary').click();await a.page.locator('#playlist-name').fill('学习歌单');await a.page.locator('#playlist-description-input').fill('安静学习');await a.page.getByRole('button',{name:'创建歌单',exact:true}).click();
 await a.page.locator('#add-song summary').click();await a.page.locator('#inp-id').fill('456');await a.page.locator('#inp-name').fill('新歌曲');await a.page.getByRole('button',{name:'加入歌单'}).click();
 await a.page.waitForFunction(()=>document.querySelector('#playlist-sync-status').textContent==='歌单已同步');
 assert.ok(cloud.playlists.some(p=>p.name==='学习歌单'&&p.songs.some(s=>s.name==='新歌曲')));assert.ok(cloud.playlists.some(p=>p.songs.some(s=>s.name==='旧歌曲')));
 const b=await device();await b.page.getByText('歌单已同步').waitFor();const select=b.page.locator('#playlist-select');const options=await select.locator('option').allTextContents();assert.ok(options.includes('学习歌单'));await select.selectOption({label:'学习歌单'});
 await b.page.locator('#sync-settings summary').click();await b.page.locator('#role-follower').click();assert.equal(await b.page.locator('#roleBadge').innerText(),'本机：跟随设备 ▾');assert.match(await b.page.locator('#follower-list').innerText(),/新歌曲/);
 assert.deepEqual(errors,[]);console.log('PASS: local migration, create, song add, cloud transfer and follower display');await a.context.close();await b.context.close();
}finally{await browser.close()}
