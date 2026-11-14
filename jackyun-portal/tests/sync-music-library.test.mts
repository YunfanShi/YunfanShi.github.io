import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
const html=readFileSync(new URL('../public/MusicPlayerSync.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const PlaylistLibrary = {'),html.indexOf('const Library = {'));
const copy=(x:unknown)=>JSON.parse(JSON.stringify(x));
function harness(options:{fetch?:(...args:any[])=>Promise<any>;legacy?:any[];saved?:any}={}){
 const storage=new Map<string,string>();if(options.saved)storage.set('sync_music_playlists_v1',JSON.stringify(options.saved));
 const elements=new Map<string,any>();
 const elem=(id:string)=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',open:false,replaceChildren(){},appendChild(){}});return elements.get(id)};
 const STATE={songs:options.legacy??[],curIdx:0,status:'IDLE'};let tasks:Array<()=>void>=[];
 const env={STATE,Library:{render(){}},Engine:{reset(){}},crypto:{randomUUID},JSON,Map,Set,console,
 localStorage:{get length(){return storage.size},key:(i:number)=>[...storage.keys()][i]??null,getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
 document:{getElementById:elem,createElement:()=>({value:'',textContent:''}),addEventListener(){},hidden:false},window:{addEventListener(){}},
 setInterval(){},setTimeout(fn:()=>void){tasks.push(fn);return tasks.length},clearTimeout(){},
 fetch:options.fetch??(async()=>({status:401,ok:false,json:async()=>({})})),JackyunDialog:{alert(){}}};
 const obj=runInNewContext(source+'\nPlaylistLibrary',env);obj.draftId=randomUUID();return {obj,STATE,storage,elements,runTasks(){const f=tasks;tasks=[];f.forEach(x=>x())}};
}
const playlist=(name:string,songs:any[]=[])=>({id:'shared',name,description:'',songs});
test('legacy songs migrate into a local playlist without overwriting the old key',()=>{
 const h=harness({legacy:[{id:123,name:'Old'}]});h.obj.init();
 assert.deepEqual(copy(h.STATE.songs),[{id:'123',name:'Old'}]);assert.equal(h.obj.data.playlists[0].name,'我的歌单');
 assert.ok(h.storage.has('sync_music_playlists_v1'));
});
test('independent same playlist edits preserve the remote and local variants',()=>{
 const h=harness(),base=playlist('original'),local=playlist('local'),remote=playlist('remote');
 const merged=copy(h.obj.merge([local],[remote],[base]));
 assert.equal(merged.length,2);assert.equal(merged[0].name,'remote');assert.match(merged[1].name,/本机副本/);assert.notEqual(merged[1].id,'shared');
});
test('offline edits survive refresh with acknowledged base',()=>{
 const saved={owner:'owner-a',activeId:'shared',playlists:[playlist('edited offline')],base:[playlist('original')]};
 const h=harness({saved});h.obj.init();
 const restored=JSON.parse(h.storage.get('sync_music_playlists_v1:owner-a')!);
 assert.equal(restored.playlists[0].name,'edited offline');assert.equal(restored.base[0].name,'original');
});
test('editing during a cloud write preserves latest local state for next sync',async()=>{
 let resolvePut:(v:any)=>void=()=>{},sent:any;const started=new Promise<void>(resolve=>{resolvePut=resolve as any});
 let announce:()=>void=()=>{};const writing=new Promise<void>(r=>announce=r);
 const saved={owner:'owner-a',activeId:'shared',playlists:[playlist('first')],base:[]};
 const h=harness({saved,fetch:async(_url,opts)=>{
  if(!opts?.method)return {ok:true,status:200,json:async()=>({owner:'owner-a',revision:null,playlists:[]})};
  sent=JSON.parse(opts.body);announce();await started;return {ok:true,status:200,json:async()=>({revision:'rev'})};
 }});
 h.obj.data=copy(saved);const work=h.obj.sync();await writing;
 h.obj.data.playlists[0].name='second';h.obj.pending=true;h.obj.persist();resolvePut();await work;
 assert.equal(sent.playlists[0].name,'first');assert.equal(h.obj.data.playlists[0].name,'second');assert.equal(h.obj.data.base[0].name,'first');
 assert.equal(JSON.parse(h.storage.get('sync_music_playlists_v1')!).playlists[0].name,'second');
});
test('account switch retains the previous account copy and does not upload it to the new account',async()=>{
 const saved={owner:'owner-a',activeId:'shared',playlists:[playlist('private-a')],base:[]};let uploaded:any;
 const h=harness({saved,fetch:async(_url,opts)=>{if(!opts?.method)return {ok:true,status:200,json:async()=>({owner:'owner-b',revision:null,playlists:[]})};uploaded=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({revision:'rev'})}}});
 h.obj.data=copy(saved);await h.obj.sync();assert.equal(uploaded.owner,'owner-b');assert.ok(!JSON.stringify(uploaded).includes('private-a'));assert.ok(h.storage.has('sync_music_playlists_v1:owner-a'));
});

test('signed out initialization does not expose or upload an account playlist',async()=>{
 const saved={owner:'owner-a',activeId:'shared',playlists:[playlist('private-a')],base:[]};
 const h=harness({saved});h.obj.init();await Promise.resolve();
 assert.ok(!JSON.stringify(h.STATE.songs).includes('private-a'));assert.equal(h.obj.data.owner,null);assert.ok(h.storage.has('sync_music_playlists_v1:owner-a'));
});
test('another tab draft is recovered without removing a newer draft revision',()=>{
 const h=harness(),base=playlist('base'),local=playlist('tab-one'),other=playlist('tab-two');
 h.obj.data={owner:'owner-a',activeId:'shared',playlists:[local],base:[base]};
 const key='sync_music_playlists_v1:draft:other',raw=JSON.stringify({owner:'owner-a',playlists:[other],base:[base]});h.storage.set(key,raw);
 h.obj.recover('owner-a');assert.equal(h.obj.data.playlists.length,2);
 h.storage.set(key,raw+' ');h.obj.acknowledgeDrafts();assert.ok(h.storage.has(key));
});

test('a new empty device adopts an existing cloud library without creating a duplicate playlist',async()=>{
 const remote=playlist('cloud',[{id:'42',name:'Track'}]);let writes=0;const h=harness({fetch:async(_url,opts)=>{if(opts?.method){writes++;return {ok:true,status:200,json:async()=>({revision:'new'})}}return {ok:true,status:200,json:async()=>({owner:'owner-a',revision:'existing',playlists:[remote]})}}});
 const empty={id:'new-device',name:'我的歌单',description:'',songs:[]};h.obj.data={owner:null,activeId:empty.id,playlists:[empty],base:[],pristine:true};await h.obj.sync();
 assert.equal(writes,0);assert.deepEqual(copy(h.obj.data.playlists),[remote]);
});

test('deletion of an unchanged playlist survives a three way merge',()=>{
 const h=harness(),base=playlist('original');
 assert.equal(h.obj.merge([], [base], [base]).length,0);
 assert.equal(h.obj.merge([base], [], [base]).length,0);
});
test('deletion concurrent with an edit preserves the edited playlist',()=>{
 const h=harness(),base=playlist('original'),changed=playlist('edited');
 assert.equal(h.obj.merge([], [changed], [base])[0].name,'edited');
 assert.equal(h.obj.merge([changed], [], [base])[0].name,'edited');
});
