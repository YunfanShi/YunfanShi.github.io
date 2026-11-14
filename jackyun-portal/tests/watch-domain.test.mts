import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { digest, sameHash, seal, unseal, validateOperation } from '../src/lib/watch/policy.ts';
import { calendarDate, normalizeWatchSeiueTodos, readV5Schedule, timetableSnapshot, scheduleSnapshot, zonedEpoch } from '../src/lib/watch/snapshot.ts';
import { createEmptyScheduleState } from '../src/lib/learning/schedule-control.ts';

test('pair payload encryption authenticates its key and ciphertext',()=>{
  const payload={session:{accessToken:'test-only-token'}},encrypted=seal(payload,'test-only-key');
  assert.deepEqual(unseal(encrypted,'test-only-key'),payload);
  assert.equal(encrypted.includes('test-only-token'),false);
  assert.throws(()=>unseal(encrypted,'wrong-key'));
  const parts=encrypted.split('.');parts[1]=(parts[1][0]==='A'?'B':'A')+parts[1].slice(1);assert.throws(()=>unseal(parts.join('.'),'test-only-key'));
});
test('watch credential hash rejects missing and mismatching values',()=>{
  assert.equal(sameHash('secret',digest('secret')),true);assert.equal(sameHash('other',digest('secret')),false);assert.equal(sameHash('secret','invalid'),false);
});
test('operations whitelist target types and reject invalid task versions',()=>{
  const value={operationId:randomUUID(),kind:'task',targetId:randomUUID(),version:'2026-10-13T00:00:00Z',details:{completed:true}};
  assert.deepEqual(validateOperation(value),{completed:true});
  for(const patch of [{kind:'delete-account'},{operationId:'invalid'},{targetId:'invalid'},{version:'invalid'},{details:{completed:'true'}}])assert.throws(()=>validateOperation({...value,...patch}));
});
test('focus records exclude invalid or fabricated active duration',()=>{
  const now=Date.now(),value={operationId:randomUUID(),kind:'focus',details:{durationSeconds:60,plannedSeconds:1500,startedAt:now-60000,completedAt:now}};
  assert.doesNotThrow(()=>validateOperation(value));
  for(const details of [{...value.details,durationSeconds:59},{...value.details,completedAt:now+600000},{...value.details,startedAt:now},{...value.details,plannedSeconds:30}])assert.throws(()=>validateOperation({...value,details}));
});
test('calendar uses China midnight independently of server timezone',()=>{
  assert.equal(calendarDate(new Date('2026-10-12T16:00:00Z')),'2026-10-13');
  assert.equal(zonedEpoch('2026-10-13','09:00'),Date.parse('2026-10-13T01:00:00Z'));
  assert.equal(zonedEpoch('2026-07-01','09:00','America/New_York'),Date.parse('2026-07-01T13:00:00Z'));
});
test('Watch SEIUE agenda includes only pending tasks and preserves deadline and useful context',()=>{
  const items=normalizeWatchSeiueTodos([
    {id:'pending-1',kind:'assignment',title:'实验报告',status:'pending',deadline:'2026-10-14 23:59',courseName:'物理实验',assignmentType:'课程作业',creatorName:'老师甲',description:'上传 PDF'},
    {id:'done-1',kind:'assignment',title:'已完成任务',status:'completed',deadline:'2026-10-14 20:00'},
    {id:'unknown-1',kind:'election',title:'未知状态',status:'unknown',deadline:'2026-10-14 20:00'},
    {id:'no-deadline',kind:'election',title:'待选课程',status:'pending'},
  ],new Date('2026-10-14T04:00:00Z'));
  assert.equal(items.items.length,2);assert.equal(items.hasMore,false);
  assert.equal(items.items[0].deadlineLabel,'2026-10-14 23:59');
  assert.equal(items.items[0].dueAt,Date.parse('2026-10-14T15:59:00Z'));
  assert.match(items.items[0].detail,/物理实验/);assert.match(items.items[0].detail,/老师甲/);assert.match(items.items[0].detail,/上传 PDF/);
  assert.equal(items.items[1].deadlineLabel,'未提供截止时间');assert.equal(items.items[1].dueAt,0);
});
test('Watch SEIUE server integration is user-scoped, read-only and cache-safe',()=>{
  const snapshotSource=readFileSync(new URL('../src/lib/watch/snapshot.ts',import.meta.url),'utf8');
  const routeSource=readFileSync(new URL('../src/app/api/watch/v1/[...action]/route.ts',import.meta.url),'utf8');
  assert.match(snapshotSource,/\.eq\('user_id',userId\)\.eq\('provider','seiue'\)/);
  assert.match(snapshotSource,/external_account_secrets[\s\S]*?\.eq\('account_id',account\.id\)\.eq\('user_id',userId\)/);
  assert.match(snapshotSource,/credentials\.role!=='student'[\s\S]*?fetchSeiueSnapshot/);
  assert.match(snapshotSource,/external\.todos\.filter\(todo=>todo\.status==='pending'\)/);
  assert.match(routeSource,/Cache-Control':'private, no-store/);
  assert.match(snapshotSource,/const agenda=normalizeWatchSeiueTodos/);
  assert.match(snapshotSource,/result\.seiueAgenda=agenda\.items/);
  assert.doesNotMatch(snapshotSource,/result\.seiueAgenda\s*=\s*credentials/);
});
test('Watch schedule snapshot reads authenticated V5 resources and never falls back to legacy sync',()=>{
  const snapshotSource=readFileSync(new URL('../src/lib/watch/snapshot.ts',import.meta.url),'utf8');
  assert.match(snapshotSource,/api\/sync\/v5\/manifest/);
  assert.match(snapshotSource,/api\/sync\/v5\/records/);
  assert.match(snapshotSource,/syncProtocol:5/);
  assert.match(snapshotSource,/SYNC_V5_SCHEDULE_SCOPES\.every/);
  assert.match(snapshotSource,/resourcesToSchedule\(rows\.filter/);
  assert.doesNotMatch(snapshotSource,/legacy_sync_data|createAzureRecordClient/);
});
test('Watch V5 resource reader assembles authoritative schedule and rejects unavailable V5',async()=>{
  const prior=process.env.AZURE_SYNC_API_URL;process.env.AZURE_SYNC_API_URL='https://jackyun-sync-9d26b2cc.azurewebsites.net';
  try {
    const requests:string[]=[];let active=0,maxActive=0;
    const fetchImpl:typeof fetch=async(input,init)=>{
      active++;maxActive=Math.max(maxActive,active);
      try {
      const url=new URL(String(input));requests.push(url.pathname+url.search);
      if(url.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['timetable','learning','cue','practice','timer','settings']});
      if(url.pathname.endsWith('/manifest')){
        await new Promise(resolve=>setTimeout(resolve,5));
        const scope=url.searchParams.get('scope'),field=url.searchParams.get('field');
        const rows=scope==='timetable'&&field==='timetable'?[{scope,recordId:'timetable:$value',revision:1,contentHash:'a'.repeat(64),deleted:false,updatedAt:'2026-10-31T00:00:00Z'}]:[];
        return Response.json({syncProtocol:5,records:rows,head:1,next:null});
      }
      if(url.pathname.endsWith('/records'))return Response.json({syncProtocol:5,records:[{scope:'timetable',field:'timetable',recordId:'timetable:$value',itemId:'$value',revision:1,deleted:false,value:{version:1,name:'V5',courses:[]}}]});
      throw Error('unexpected V5 path');
      } finally { active--; }
    };
    const value=await readV5Schedule('test-watch-token',fetchImpl);
    assert.deepEqual(value.timetable,{version:1,name:'V5',courses:[]});
    assert.ok(requests.some(path=>path.startsWith('/api/sync/v5/manifest')));
    const requestedFields=requests.filter(path=>path.includes('/manifest?')).map(path=>new URL(path,'https://example.test').searchParams.get('field'));
    assert.deepEqual(new Set(requestedFields),new Set(['timetable','manualTasks','completions','cancellations','reviewProgress','learningRecords','learningCatalog','cues','cueReviews','cueCollectionUpdates','cueStudyDraft','cueStudyDrafts','settings','schemaVersion']));
    assert.ok(maxActive>1&&maxActive<=4,`expected bounded parallel reads, observed ${maxActive}`);
    await assert.rejects(()=>readV5Schedule('test-watch-token',async()=>Response.json({syncProtocol:4,capabilities:{v5:false},scopes:[]})),/V5 schedule scopes unavailable/);
  } finally { if(prior===undefined)delete process.env.AZURE_SYNC_API_URL;else process.env.AZURE_SYNC_API_URL=prior; }
});
test('empty synchronized schedule is a valid empty result',()=>{
  const summary=scheduleSnapshot(createEmptyScheduleState(),new Date('2026-10-13T00:00:00Z'));
  assert.equal(summary.lessons.length,0);assert.equal(summary.cue.due,0);
  assert.throws(()=>scheduleSnapshot({schemaVersion:900,cues:[]}));
});
test('date overrides including a removed lesson match existing timetable rules',()=>{
  const state=createEmptyScheduleState();state.timetable={version:1,name:'test',courses:[{id:'math',name:'Math',color:'#123456',review:false,sessions:[{day:2,start:'09:00',end:'10:00'}]}],dateOverrides:[{date:'2026-10-13',sessions:[]},{date:'2026-10-14',sessions:[{courseId:'math',start:'11:00',end:'12:00',location:'A'}]}]};
  const result=scheduleSnapshot(state,new Date('2026-10-13T00:00:00Z'));
  assert.equal(result.lessons.some(item=>item.id.startsWith('2026-10-13')),false);
  const replaced=result.lessons.find(item=>item.id.startsWith('2026-10-14'))!;
  assert.equal(replaced.startsAt,Date.parse('2026-10-14T03:00:00Z'));assert.equal(replaced.location,'A');
});
test('CUE reviewed after UTC midnight remains learned in its account day',()=>{
  const state=createEmptyScheduleState();state.cues=[{id:'a',subjectId:'s',subjectName:'Math',unit:'U',subsection:'',prompt:'P',answer:'A',type:'general',status:'stable',streak:1,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T16:10:00Z',lastReviewedAt:'2026-10-12T16:20:00Z',nextReviewDate:'2026-10-14'}] as typeof state.cues;
  const result=scheduleSnapshot(state,new Date('2026-10-12T16:30:00Z'));
  assert.equal(result.cue.learned,1);assert.equal(result.cue.due,0);
  state.cues[0].updatedAt='2026-10-12T16:25:00Z';assert.equal(scheduleSnapshot(state,new Date('2026-10-12T16:30:00Z')).cue.due,1);
});

test('watch home reads only timetable and retains cached modules on missing or failed data',async()=>{
  const previous=process.env.AZURE_SYNC_API_URL; process.env.AZURE_SYNC_API_URL='https://jackyun-sync-9d26b2cc.azurewebsites.net';
  try {
    const paths:string[]=[]; const timetable={version:1,name:'Test',courses:[{id:'math',name:'Math',color:'#123456',review:false,sessions:[{day:6,start:'09:00',end:'10:00'}]}]};
    const fake:typeof fetch=async input=>{const u=new URL(String(input));paths.push(u.pathname+u.search);
      if(u.pathname==='/api/sync/v5')return Response.json({syncProtocol:5,capabilities:{v5:true},scopes:['timetable','learning','cue','practice','timer','settings']});
      if(u.pathname.endsWith('/manifest'))return Response.json({syncProtocol:5,records:[{scope:'timetable',recordId:'timetable:$value'}],head:1,next:null});
      if(u.pathname.endsWith('/records'))return Response.json({syncProtocol:5,records:[{scope:'timetable',field:'timetable',recordId:'timetable:$value',itemId:'$value',value:timetable}]});
      throw Error('unexpected'); };
    const result=await timetableSnapshot('token',new Date('2026-11-14T00:00:00Z'),fake);
    assert.equal((result.modules as Record<string,string>).timetable,'ready');assert.equal((result.modules as Record<string,string>).tasks,'error'); assert.ok((result.lessons as Array<{title:string}>).some(item=>item.title==='Math'));
    assert.deepEqual(paths.filter(p=>p.includes('/manifest')).map(p=>new URL(p,'https://example.com').searchParams.get('field')),['timetable']);
    const failed=await timetableSnapshot('token',new Date(),async()=>{throw Error('offline')});
    assert.equal((failed.modules as Record<string,string>).timetable,'error');assert.equal(failed.lessons,undefined);
  } finally { if(previous===undefined)delete process.env.AZURE_SYNC_API_URL;else process.env.AZURE_SYNC_API_URL=previous; }
});
