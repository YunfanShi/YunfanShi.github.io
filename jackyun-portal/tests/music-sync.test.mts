import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } from '../src/lib/companion.ts';
function player() {
 const html = readFileSync(process.env.MUSIC_SYNC_SOURCE || new URL('../public/MusicPlayerSync.html', import.meta.url), 'utf8');
 const source = html.slice(html.indexOf('const IS_MASTER'), html.indexOf('\nLibrary.render();\nUI.updateStats();'));
 const elements = new Map(); const requests: string[] = [];
 const audio = { src: '', readyState: 1, getAttribute() { return this.src; }, removeAttribute() { this.src = ''; }, currentTime: 0, onended: null, load() {}, pause() {}, play: () => Promise.resolve() };
 elements.set('main-audio', audio);
 const storage = new Map([['mps_role', 'follower']]);
 const api = runInNewContext(source + '\n({STATE,Engine,handleIncomingBroadcast,startPolling})', {
 localStorage: {getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string,v: string) => storage.set(k,v), removeItem() {}},
 document: {getElementById: (id: string) => { if (!elements.has(id)) elements.set(id,{textContent:'',innerText:'',classList:{add(){}},querySelector:()=>({innerText:''})}); return elements.get(id); }},
 window: {addEventListener(){}}, console,
 fetch: async (url: string) => {requests.push(url);return {ok:true,json:async()=>({broadcasts:[]})};},
 setInterval(){return 1;},clearInterval(){},setTimeout(){},requestAnimationFrame(){return 1;},cancelAnimationFrame(){}
 });
 const command = (action: string, stamp: number, targetTime=Date.now()+5000) => ({targetTime,timestamp:stamp,payload:{_type:'music',action,songUrl:action+'.mp3',eventTimestamp:stamp}});
 return {...api,audio,requests,command,elements};
}
test('follower follows new songs while armed and playing, rejects older commands', async()=>{
 const p=player(); await p.handleIncomingBroadcast(p.command('play',1));
 assert.ok(Number(p.elements.get('timer').innerText)>0);
 await p.handleIncomingBroadcast(p.command('next',2)); assert.equal(p.audio.src,'next.mp3');
 p.STATE.status='PLAYING'; await p.handleIncomingBroadcast(p.command('prev',3)); assert.equal(p.audio.src,'prev.mp3');
 await p.handleIncomingBroadcast(p.command('stop',2)); assert.equal(p.STATE.status,'ARMED');
});
test('follower reset and incoming stop never broadcast a stop back',async()=>{
 const p=player(); p.Engine.reset(); await p.handleIncomingBroadcast(p.command('stop',1)); assert.equal(p.requests.length,0);
});
test('late playback catches up to the shared timeline',async()=>{
 const p=player(); await p.handleIncomingBroadcast(p.command('play',1,Date.now()-4000)); await Promise.resolve();
 assert.equal(p.STATE.status,'PLAYING'); assert.ok(p.audio.currentTime>=4);
});
test('autoplay rejection remains visible and user can retry',async()=>{
 const p=player(); p.audio.play=()=>Promise.reject(new Error('NotAllowedError'));
 await p.handleIncomingBroadcast(p.command('play',1,Date.now()-100)); await new Promise(r=>setImmediate(r));
 assert.equal(p.STATE.status,'BLOCKED'); assert.match(p.elements.get('followerAudioHint').textContent,/点击/);
 p.audio.play=()=>Promise.resolve(); p.Engine.enableFollowerAudio(); await Promise.resolve(); assert.equal(p.STATE.status,'PLAYING');
});
test('poll immediately uses overlapping delivery window and self filter',()=>{
 const p=player();p.startPolling();assert.equal(p.requests.length,1);
 const url=new URL(p.requests[0],'https://example.com');assert.ok(Date.now()-Number(url.searchParams.get('since'))>=15000);assert.ok(url.searchParams.get('self'));
});
test('sync is default and explicit player preference survives',()=>{
 assert.equal(DEFAULT_NAVIGATION_PREFERENCES.musicMode,'sync');assert.equal(coerceNavigationPreferences({}).musicMode,'sync');assert.equal(coerceNavigationPreferences({musicMode:'player'}).musicMode,'player');
});
