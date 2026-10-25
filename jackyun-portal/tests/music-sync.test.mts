import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES } from '../src/lib/companion.ts';
function player(clock = performance) {
 const html = readFileSync(process.env.MUSIC_SYNC_SOURCE || new URL('../public/MusicPlayerSync.html', import.meta.url), 'utf8');
 const source = html.slice(html.indexOf('const IS_MASTER'), html.indexOf("STATE.audio.addEventListener('timeupdate'"));
 const elements = new Map(); const requests: string[] = []; const timeouts: number[] = [];
 const audio = { src: '', paused: false, seeking: false, playbackRate: 1, readyState: 4, getAttribute() { return this.src; }, removeAttribute() { this.src = ''; }, currentTime: 0, onended: null, load() {}, pause() {}, play: () => Promise.resolve() };
 elements.set('main-audio', audio);
 const storage = new Map([['mps_role', 'follower']]);
 const documentRoot = {dataset:{musicLayout: undefined}};
 const api = runInNewContext(source + '\n({STATE,Engine,handleIncomingBroadcast,startPolling,ClockSync,PlayerView,Library,Cali})', {
 localStorage: {getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string,v: string) => storage.set(k,v), removeItem() {}},
 document: {documentElement:documentRoot,getElementById: (id: string) => { if (!elements.has(id)) elements.set(id,{textContent:'',innerText:'',classList:{add(){}},setAttribute(){},querySelector:()=>({innerText:''})}); return elements.get(id); }},
 window: {addEventListener(){}}, console, performance: clock, AbortSignal,
 fetch: async (url: string) => {requests.push(url);return {ok:true,json:async()=>({broadcasts:[]})};},
 setInterval(){return 1;},clearInterval(){},setTimeout(_callback: (...args: unknown[]) => unknown, delay: number){timeouts.push(delay);},requestAnimationFrame(){return 1;},cancelAnimationFrame(){}
 });
 api.ClockSync.syncedAt = clock.now();
 api.ClockSync.anchorTime = Date.now();
 api.ClockSync.anchorTick = clock.now();
 const command = (action: string, stamp: number, targetTime=Date.now()+5000) => ({targetTime,timestamp:stamp,payload:{_type:'music',action,songUrl:action+'.mp3',eventTimestamp:stamp}});
 return {...api,audio,requests,command,elements,storage,documentRoot,timeouts};
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
 const p=player(); await p.handleIncomingBroadcast(p.command('play',1,Date.now()-4500)); await Promise.resolve();
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
 const url=new URL(p.requests[0],'https://example.com');assert.ok(p.ClockSync.getPreciseTime()-Number(url.searchParams.get('since'))>=15000);assert.ok(url.searchParams.get('self'));
});
test('sync is default and explicit player preference survives',()=>{
 assert.equal(DEFAULT_NAVIGATION_PREFERENCES.musicMode,'sync');assert.equal(coerceNavigationPreferences({}).musicMode,'sync');assert.equal(coerceNavigationPreferences({musicMode:'player'}).musicMode,'player');
});

test('calibration takes six samples and rejects slow offset outliers', async () => {
  const p = player();
  let calls = 0;
  const samples = [
    { offset: 100, rtt: 20 }, { offset: 102, rtt: 25 }, { offset: 101, rtt: 22 },
    { offset: 500, rtt: 900 }, { offset: -500, rtt: 800 }, { offset: 200, rtt: 700 },
  ];
  p.ClockSync.sample = async () => ({ ...samples[calls++], startedAt: 1000, startedTick: performance.now() });
  const result = await p.ClockSync.calibrate();
  assert.equal(calls, 6);
  assert.equal(result.valid, 6);
  assert.equal(result.rtt, 22);
  assert.equal(p.ClockSync.anchorTime, 1101);
});

test('fewer than four valid samples preserve the previous calibration', async () => {
  const p = player();
  const anchor = p.ClockSync.anchorTime;
  let calls = 0;
  p.ClockSync.sample = async () => {
    if (++calls > 3) throw new Error('Timeout');
    return { offset: 900, rtt: 10, startedAt: 1000, startedTick: 0 };
  };
  await assert.rejects(p.ClockSync.calibrate(), /至少需要 4 次/);
  assert.equal(calls, 6);
  assert.equal(p.ClockSync.anchorTime, anchor);
  assert.equal(p.ClockSync.pending, null);
});

test('exactly four valid samples suffice and concurrent callers share a batch', async () => {
  const p = player();
  let calls = 0;
  p.ClockSync.sample = async () => {
    if (++calls > 4) throw new Error('Timeout');
    return { offset: 100, rtt: 20, startedAt: Date.now(), startedTick: performance.now() };
  };
  const first = p.ClockSync.calibrate();
  assert.equal(first, p.ClockSync.calibrate());
  assert.equal((await first).valid, 4);
  assert.equal(calls, 6);
});

test('calibrated clock advances with monotonic elapsed time', () => {
  let tick = 10;
  const p = player({ now: () => tick } as Performance);
  const initial = p.ClockSync.getPreciseTime();
  tick += 2000;
  assert.equal(p.ClockSync.getPreciseTime() - initial, 2000);
});

test('server time endpoint is fresh and does not expose account data', async () => {
  const { GET } = await import('../src/app/api/music-clock/route.ts');
  const response = await GET();
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['receivedAt', 'sentAt']);
  assert.ok(body.sentAt >= body.receivedAt);
});

test('master calibrates before sending a timestamped play command with preparation time', async () => {
  const p = player();
  p.storage.set('mps_role', 'master');
  p.STATE.songs = [{ id: '123', name: 'Track' }];
  let calibrated = false;
  p.ClockSync.forceSync = async () => { calibrated = true; return true; };
  await p.Engine.start();
  assert.ok(calibrated);
  assert.equal(p.STATE.status, 'ARMED');
  assert.ok(p.STATE.targetTime - p.ClockSync.getPreciseTime() > 11900);
  assert.ok(p.requests.includes('/api/answer-sheet-sync'));
});

test('follower waits for calibration and can retry the command if its first calibration fails', async () => {
  const p = player();
  p.ClockSync.syncedAt = null;
  p.ClockSync.ensureFresh = async () => false;
  const command = p.command('play', 1);
  await p.handleIncomingBroadcast(command);
  assert.equal(p.STATE.status, 'IDLE');
  p.ClockSync.ensureFresh = async () => true;
  await p.handleIncomingBroadcast(command);
  assert.equal(p.STATE.status, 'ARMED');
});

test('master also catches up if audio starts after the shared target time', async () => {
  const p = player();
  p.storage.set('mps_role', 'master');
  p.STATE.status = 'ARMED';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 4000;
  p.Engine.loop();
  await Promise.resolve();
  assert.equal(p.STATE.status, 'PLAYING');
  assert.ok(p.audio.currentTime >= 4);
});

test('player progress displays actual audio time and duration', () => {
  const p = player();
  p.audio.currentTime = 65;
  p.audio.duration = 130;
  p.PlayerView.progress();
  assert.equal(p.elements.get('track-progress').value, 50);
  assert.equal(p.elements.get('elapsed-time').textContent, '1:05');
  assert.equal(p.elements.get('duration-time').textContent, '2:10');
});

test('playlist escapes imported names and IDs rather than inserting markup', () => {
  const p = player();
  p.STATE.songs = [{ name: '<img src=x onerror=alert(1)>', id: '<script>' }];
  p.Library.render();
  const html = p.elements.get('list-el').innerHTML;
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|<script>/);
});

test('follower player button resumes the last song on its shared timeline', async () => {
  const p = player();
  await p.handleIncomingBroadcast(p.command('play', 1, Date.now() - 4500));
  await Promise.resolve();
  p.Engine.toggleSystem();
  assert.equal(p.STATE.status, 'IDLE');
  p.Engine.toggleSystem();
  await Promise.resolve();
  assert.equal(p.STATE.status, 'PLAYING');
  assert.ok(p.audio.currentTime >= 4);
});

test('layout defaults to record and rejects unknown stored values', () => {
  const p = player();
  assert.equal(p.documentRoot.dataset.musicLayout, 'record');
  assert.equal(p.elements.get('music-layout').value, 'record');
  p.PlayerView.setLayout('unknown');
  assert.equal(p.documentRoot.dataset.musicLayout, 'record');
});

test('changing layout persists locally without resetting playback or sending commands', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.audio.currentTime = 65;
  p.PlayerView.setLayout('classic');
  assert.equal(p.documentRoot.dataset.musicLayout, 'classic');
  assert.equal(p.storage.get('mps_layout'), 'classic');
  assert.equal(p.STATE.status, 'PLAYING');
  assert.equal(p.audio.currentTime, 65);
  assert.equal(p.requests.length, 0);
  p.PlayerView.setLayout('record');
  assert.equal(p.storage.get('mps_layout'), 'record');
});

test('a slightly lagging device catches up gradually without another seek', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 1000;
  p.audio.currentTime = 0.9;
  p.Engine.correctDrift();
  assert.equal(p.audio.currentTime, 0.9);
  assert.ok(p.audio.playbackRate > 1 && p.audio.playbackRate <= 1.03);
});

test('a device ahead slows down, while a stalled device seeks to the timeline', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 1000;
  p.audio.currentTime = 1.1;
  p.Engine.correctDrift();
  assert.ok(p.audio.playbackRate < 1 && p.audio.playbackRate >= 0.97);
  p.audio.currentTime = 0;
  p.Engine.correctDrift();
  assert.ok(p.audio.currentTime >= 1);
  assert.equal(p.audio.playbackRate, 1);
});

test('device output compensation updates playback immediately and remains local', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 1000;
  p.audio.currentTime = 1;
  p.Engine.adjustManual(-100);
  assert.equal(p.STATE.manualOffset, -100);
  assert.ok(p.audio.currentTime >= 1.1);
  assert.equal(p.requests.length, 0);
  assert.equal(p.storage.get('v45_manual'), -100);
});

test('drift correction waits through an active seek or buffer starvation', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 10000;
  p.audio.currentTime = 2;
  p.audio.seeking = true;
  p.Engine.correctDrift();
  assert.equal(p.audio.currentTime, 2);
  p.audio.seeking = false;
  p.audio.readyState = 1;
  p.Engine.correctDrift();
  assert.equal(p.audio.currentTime, 2);
});

test('tracking restores normal speed when aligned and is removed on reset', () => {
  const p = player();
  p.STATE.status = 'PLAYING';
  p.STATE.targetTime = p.ClockSync.getPreciseTime() - 1000;
  p.audio.currentTime = 1;
  p.audio.playbackRate = 1.02;
  p.Engine.correctDrift();
  assert.equal(p.audio.playbackRate, 1);
  p.Engine.startTracking();
  assert.notEqual(p.Engine.driftTimer, null);
  p.Engine.reset(false);
  assert.equal(p.Engine.driftTimer, null);
  assert.equal(p.audio.playbackRate, 1);
});

test('negative output compensation keeps the calibration metronome scheduled in the future', () => {
  const p = player();
  p.ClockSync.getPreciseTime = () => 1950;
  p.STATE.manualOffset = -100;
  p.Cali.isRunning = true;
  p.Cali.loop();
  assert.equal(p.timeouts[0], 950);
});
