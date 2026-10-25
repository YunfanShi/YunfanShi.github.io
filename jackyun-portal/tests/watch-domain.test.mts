import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { digest, sameHash, seal, unseal, validateOperation } from '../src/lib/watch/policy.ts';
import { calendarDate, normalizeWatchSeiueCalendar, normalizeWatchSeiueLessons, normalizeWatchSeiueTodos, scheduleSnapshot, zonedEpoch } from '../src/lib/watch/snapshot.ts';
import type { SeiueCalendarEvent, SeiueLesson } from '../src/lib/integrations/seiue.ts';
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
test('Watch SEIUE schedule maps adjustments, China time, and calendar source without credentials',()=>{
  const lesson:SeiueLesson={id:'class-1',title:'数学',subject:'数学',date:'2026-10-20',start:'09:00',end:'09:45',location:'A栋',teacher:'老师甲',adjustment:'调课',description:'备注'};
  const mapped=normalizeWatchSeiueLessons([lesson]);
  assert.deepEqual(mapped[0],{id:'seiue:class-1',title:'数学',subject:'数学',date:'2026-10-20',start:'09:00',end:'09:45',startsAt:Date.parse('2026-10-20T01:00:00Z'),endsAt:Date.parse('2026-10-20T01:45:00Z'),location:'A栋',teacher:'老师甲',adjustment:'调课',description:'备注',source:'seiue'});
  const calendar=normalizeWatchSeiueCalendar([
    {id:'holiday',title:'校庆',date:'2026-10-20',description:'放假'} as SeiueCalendarEvent,
    {id:'old',title:'过期事件',date:'2026-10-01'} as SeiueCalendarEvent,
  ],new Date('2026-10-19T04:00:00Z'));
  assert.deepEqual(calendar,[{id:'seiue:holiday',title:'校庆',date:'2026-10-20',endDate:'2026-10-20',description:'放假',source:'seiue'}]);
  assert.equal(JSON.stringify([...mapped,...calendar]).includes('token'),false);
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
  assert.match(snapshotSource,/result\.seiueLessons=normalizeWatchSeiueLessons/);
  assert.match(snapshotSource,/result\.seiueCalendar=normalizeWatchSeiueCalendar/);
  assert.match(snapshotSource,/result\.seiueConnected=true/);
  assert.doesNotMatch(snapshotSource,/result\.seiueAgenda\s*=\s*credentials/);
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
