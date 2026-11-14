import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let cloud={revision:null,playlists:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>localStorage.setItem('v45_songs',JSON.stringify([{id:'123',name:'Alpha'},{id:'456',name:'Beta'}])));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='music.test')return route.abort();
  if(url.pathname==='/api/sync-music-library'){
   if(req.method()==='GET')return route.fulfill({json:{owner:'test',...cloud}});
   const body=req.postDataJSON();if(body.revision!==cloud.revision)return route.fulfill({status:409,json:{conflict:true}});
   cloud={revision:crypto.randomUUID(),playlists:body.playlists};return route.fulfill({json:{revision:cloud.revision}});
  }
  if(url.pathname==='/api/music-clock')return route.fulfill({json:{receivedAt:Date.now(),sentAt:Date.now()}});
  if(url.pathname.startsWith('/api/answer-sheet-sync'))return route.fulfill({json:{broadcasts:[],ok:true}});
  const path=url.pathname==='/'?'MusicPlayerSync.html':url.pathname.slice(1);
  try{return route.fulfill({body:readFileSync('public/'+path),contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://music.test/');await page.getByText('歌单已同步').waitFor();
 await page.locator('#edit-playlist summary').click();await page.locator('#edit-playlist-name').fill('新的名字');await page.locator('#edit-playlist-description').fill('新介绍');await page.getByRole('button',{name:'保存歌单'}).click();await page.waitForFunction(()=>document.querySelector('#playlist-sync-status').textContent==='歌单已同步');
 assert.equal(cloud.playlists[0].name,'新的名字');assert.equal(cloud.playlists[0].description,'新介绍');
 await page.locator('#song-search').fill('Beta');assert.equal(await page.locator('#list-el .item').count(),1);await page.locator('#song-search').fill('');
 await page.getByRole('button',{name:'下移歌曲'}).first().click();assert.match(await page.locator('#list-el .item-title').first().innerText(),/Beta/);
 await page.reload();await page.getByText('歌单已同步').waitFor();assert.equal(await page.locator('#playlist-select option').first().innerText(),'新的名字');assert.match(await page.locator('#list-el .item-title').first().innerText(),/Beta/);
 await page.locator('#create-playlist summary').click();await page.locator('#playlist-name').fill('目标歌单');await page.getByRole('button',{name:'创建歌单',exact:true}).click();
 await page.locator('#playlist-select').selectOption({label:'新的名字'});await page.getByRole('button',{name:'复制歌曲到其他歌单'}).first().click();
 await page.getByLabel('目标歌单编号').fill('1');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#playlist-sync-status').textContent==='歌单已同步');assert.equal(cloud.playlists.find(p=>p.name==='目标歌单').songs[0].name,'Beta');
 await page.locator('#playlist-select').selectOption({label:'目标歌单'});await page.locator('#edit-playlist summary').click();await page.getByRole('button',{name:'删除歌单'}).click();await page.getByRole('button',{name:'确认继续'}).click();
 await page.waitForFunction(()=>document.querySelector('#playlist-sync-status').textContent==='歌单已同步');assert.equal(cloud.playlists.some(p=>p.name==='目标歌单'),false);
 await page.reload();await page.getByText('歌单已同步').waitFor();assert.equal((await page.locator('#playlist-select option').allTextContents()).includes('目标歌单'),false);
 assert.deepEqual(errors,[]);console.log('PASS mobile rename, search, reorder, copy, deletion, sync, refresh');await context.close();
} finally {await browser.close()}
