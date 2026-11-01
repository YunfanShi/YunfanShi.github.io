import { cueDashboard } from '../learning/cue-dashboard.ts';
import { readScheduleState } from '../learning/workspace-reader.ts';
import { sessionsForDate, tasksForDate } from '../learning/schedule-control.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from '../secret-crypto.ts';
import { safeSeiueSite, type SeiueTodo } from '../integrations/seiue.ts';
import { resourcesToSchedule, SYNC_V5_SCHEDULE_SCOPES } from '../sync/resource-model.ts';

export function calendarDate(at: Date, timezone='Asia/Shanghai') {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function watchText(value:unknown,max:number) {
  const text=String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').trim();
  return text.length>max?`${text.slice(0,max-1)}…`:text;
}
export function zonedEpoch(date:string,time:string,timezone='Asia/Shanghai') {
  const desired=Date.parse(`${date}T${time}:00Z`);let result=desired;
  for(let i=0;i<3;i++) {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(result));
    const part=(name:string)=>parts.find(p=>p.type===name)!.value;
    const actual=Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`);
    const delta=desired-actual;if(!delta)break;result+=delta;
  }
  return result;
}
function localCalendarInstant(at:string,timezone:string) {
  const instant=new Date(at);if(!Number.isFinite(instant.getTime()))throw Error('Invalid date');
  const day=calendarDate(instant,timezone);
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(instant);
  return `${day}T${clock}.${String(instant.getMilliseconds()).padStart(3,'0')}`;
}
export function scheduleSnapshot(value:unknown,now=new Date(),timezone='Asia/Shanghai') {
  const today=calendarDate(now,timezone),localNow=new Date(`${today}T12:00:00`);
  const state=readScheduleState({getItem:()=>typeof value==='string'?value:JSON.stringify(value)},localNow);
  // Shared rules interpret local calendar dates. Adapt instants to the account calendar without changing persisted content.
  const cueState={...state,cues:state.cues.map(cue=>({...cue,updatedAt:localCalendarInstant(cue.updatedAt,timezone),...(cue.lastReviewedAt?{lastReviewedAt:localCalendarInstant(cue.lastReviewedAt,timezone)}:{})}))};
  const summary=cueDashboard(cueState,today);
  const begin=new Date(localNow);begin.setDate(begin.getDate()-((begin.getDay()+6)%7));
  const end=new Date(localNow);end.setDate(end.getDate()+8);
  const lessons=[];
  for(const day=new Date(begin);day<end;day.setDate(day.getDate()+1)) {
    const key=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    for(const session of sessionsForDate(state.timetable,day))lessons.push({id:`${key}:${session.course.id}:${session.start}`,title:watchText(session.course.name,120),
      startsAt:zonedEpoch(key,session.start,timezone),endsAt:zonedEpoch(key,session.end,timezone),location:watchText(session.location,120),teacher:watchText(session.teacher,120)});
  }
  const agenda=[];
  for(let offset=0;offset<7;offset++) {
    const day=new Date(localNow);day.setDate(day.getDate()+offset);
    const shownDate=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    for(const task of tasksForDate(state,day)) agenda.push({id:`${shownDate}:${task.key}`,title:watchText(task.title,240),date:shownDate,sourceDate:task.date,start:task.start??'',minutes:task.durationMinutes,subject:watchText(task.subjectName,120),detail:watchText(task.detail,1200)});
  }
  return {lessons,agenda:agenda.slice(0,300),agendaHasMore:agenda.length>300,learningRecords:state.learningRecords.slice(0,30).map(record=>({id:record.id,title:watchText(record.taskTitle,240),subject:watchText(record.subjectName,120),completedAt:record.completedAt,status:record.status})),cue:{due:summary.due,learned:summary.learned,weak:summary.weak,subjects:summary.subjects}};
}

const watchScheduleFields:Record<string,string[]>={
  timetable:['timetable'],
  learning:['manualTasks','completions','cancellations','reviewProgress','learningRecords','learningCatalog'],
  cue:['cues','cueReviews','cueCollectionUpdates','cueStudyDraft','cueStudyDrafts'],
  settings:['settings','schemaVersion'],
};
async function mapConcurrent<T,R>(items:T[],limit:number,action:(item:T,index:number)=>Promise<R>):Promise<R[]> {
  const output=new Array<R>(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){const index=next++;if(index>=items.length)return;output[index]=await action(items[index],index);}
  }));
  return output;
}
export async function readV5Schedule(token:string,fetchImpl:typeof fetch=fetch):Promise<Record<string,unknown>> {
  const endpoint=process.env.AZURE_SYNC_API_URL;
  if(!endpoint)throw Error('V5 sync backend unavailable');
  const base=new URL(endpoint);
  if(base.protocol!=='https:'||!/^jackyun-sync-9d26b2cc(?:-[a-z0-9]+)?\.(?:[a-z0-9-]+\.)?azurewebsites\.net$/.test(base.hostname)||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('V5 sync backend configuration invalid');
  const request=async(path:string)=>{
    const response=await fetchImpl(new URL(path,base),{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw Error(`V5 request failed (${response.status})`);
    const value=await response.json() as Record<string,unknown>;
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('V5 response invalid');
    return value;
  };
  const capability=await request('/api/sync/v5');
  const capabilities=capability.capabilities as Record<string,unknown>|undefined;
  const scopes=Array.isArray(capability.scopes)?capability.scopes:[];
  if(capability.syncProtocol!==5||capabilities?.v5!==true||!SYNC_V5_SCHEDULE_SCOPES.every(scope=>scopes.includes(scope)))throw Error('V5 schedule scopes unavailable');
  const targets=Object.entries(watchScheduleFields).flatMap(([scope,fields])=>fields.map(field=>({scope,field})));
  const manifests=await mapConcurrent(targets,4,async({scope,field})=>{
    let after='',head:number|undefined;
    const descriptors:Array<Record<string,unknown>>=[];
    for(let page=0;page<100;page++){
      const manifest=await request(`/api/sync/v5/manifest?scope=${encodeURIComponent(scope)}&field=${encodeURIComponent(field)}&after=${encodeURIComponent(after)}`);
      if(manifest.syncProtocol!==5||!Array.isArray(manifest.records)||manifest.records.length>100||!Number.isSafeInteger(manifest.head))throw Error('V5 manifest invalid');
      head??=Number(manifest.head);if(Number(manifest.head)!==head)throw Error('V5 manifest changed during read');
      const pageRecords=manifest.records as Array<Record<string,unknown>>;
      if(pageRecords.some(row=>row.scope!==scope||typeof row.recordId!=='string'||!row.recordId.startsWith(`${field}:`)))throw Error('V5 manifest scope invalid');
      descriptors.push(...pageRecords);
      const next=manifest.next;
      if(next===null)break;
      if(typeof next!=='string'||!pageRecords.length||next!==pageRecords.at(-1)?.recordId||next<=after)throw Error('V5 manifest cursor invalid');
      after=next;
      if(page===99)throw Error('V5 manifest page limit exceeded');
    }
    return {scope,descriptors};
  });
  const chunks=manifests.flatMap(({scope,descriptors})=>Array.from({length:Math.ceil(descriptors.length/50)},(_,index)=>({scope,descriptors:descriptors.slice(index*50,index*50+50)})));
  const rows=(await mapConcurrent(chunks,4,async({scope,descriptors})=>{
    const ids=descriptors.map(row=>`id=${encodeURIComponent(String(row.recordId))}`).join('&');
    const records=await request(`/api/sync/v5/records?scope=${encodeURIComponent(scope)}&${ids}`);
    if(records.syncProtocol!==5||!Array.isArray(records.records))throw Error('V5 records invalid');
    const returned=records.records as Array<Record<string,unknown>>;
    if(returned.length!==descriptors.length||returned.some(row=>row.scope!==scope||!descriptors.some(item=>item.recordId===row.recordId)))throw Error('V5 records incomplete');
    return returned;
  })).flat();
  return resourcesToSchedule(rows.filter(row=>row.deleted!==true) as never);
}
export async function snapshot(supabase:SupabaseClient,userId:string,token:string,now=new Date()) {
  const result:Record<string,unknown>={apiVersion:5,syncProtocol:5,timezone:'Asia/Shanghai',generatedAt:now.toISOString()};
  const modules:Record<string,string>={};result.modules=modules;
  let didaTasks: Array<{id:string;title:string;completed:boolean;version:string;date:string;start:string;minutes:number;subject:string;detail:string;source:string}> = [];
  async function load(name:string,action:()=>Promise<void>){try{await action();if(modules[name]!=='partial')modules[name]='ready';}catch{modules[name]='error';}}
  await Promise.all([
    load('seiue',async()=>{
      result.seiueAgenda=[];
      const {data:accounts,error:accountError}=await supabase.from('external_accounts').select('id,settings,status').eq('user_id',userId).eq('provider','seiue').order('created_at',{ascending:false}).limit(10);
      if(accountError)throw accountError;
      const account=(accounts??[]).find(item=>item.status==='active')??accounts?.[0]??null;
      if(!account)return;
      const settings=account.settings&&typeof account.settings==='object'?account.settings as Record<string,unknown>:{};
      const expiresAt=typeof settings.tokenExpiresAt==='string'?settings.tokenExpiresAt:'';
      if(!expiresAt||Date.parse(expiresAt)<=now.getTime()) {
        const {error:deleteError}=await supabase.from('external_account_secrets').delete().eq('account_id',account.id).eq('user_id',userId);
        if(deleteError)throw Error('SEIUE expired credential cleanup failed');
        const {error:updateError}=await supabase.from('external_accounts').update({status:'error',updated_at:now.toISOString()}).eq('id',account.id).eq('user_id',userId).eq('provider','seiue');
        if(updateError)throw Error('SEIUE expired account update failed');
        throw Error('SEIUE authorization expired');
      }
      if(account.status!=='active')throw Error('SEIUE account needs reconnection');
      const {data:secret,error:secretError}=await supabase.from('external_account_secrets').select('encrypted_access_token').eq('account_id',account.id).eq('user_id',userId).maybeSingle();
      if(secretError||!secret?.encrypted_access_token)throw Error('SEIUE authorization unavailable');
      const credentials=JSON.parse(decryptSecret(secret.encrypted_access_token)) as import('../integrations/seiue-server.ts').SeiueCredentials;
      if(credentials.role!=='student'||credentials.expiresAt!==expiresAt||credentials.token.length<16||credentials.token.length>4000||!/^[-A-Za-z0-9_]{1,200}$/.test(credentials.reflectionId)||!/^[-A-Za-z0-9_]{1,200}$/.test(credentials.schoolId)||!safeSeiueSite(credentials.schoolSite))throw Error('SEIUE authorization invalid');
      const {fetchSeiueSnapshot}=await import('../integrations/seiue-server.ts');
      let external;
      try { external=await fetchSeiueSnapshot(credentials,calendarDate(now)); }
      catch(error) {
        const status=error&&typeof error==='object'&&'status' in error?(error as {status?:unknown}).status:null;
        if(status===401||status===403) {
          const {error:deleteError}=status===401?await supabase.from('external_account_secrets').delete().eq('account_id',account.id).eq('user_id',userId):{error:null};
          const {error:updateError}=await supabase.from('external_accounts').update({status:'error',updated_at:now.toISOString()}).eq('id',account.id).eq('user_id',userId).eq('provider','seiue');
          if(deleteError||updateError)throw Error('SEIUE authorization status update failed');
        }
        throw error;
      }
      const agenda=normalizeWatchSeiueTodos(external.todos.filter(todo=>todo.status==='pending'),now);
      result.seiueAgenda=agenda.items;result.seiueAgendaHasMore=agenda.hasMore;
    }),
    load('dida',async()=>{
      const { watchDidaSnapshot } = await import('./dida-tasks');
      const remote = await watchDidaSnapshot(supabase,userId,calendarDate(now));
      didaTasks=remote.tasks; result.didaHasMore=remote.hasMore;
      if(remote.failed)modules.dida='partial';
    }),
    (async()=>{
      try {
        const value=await readV5Schedule(token);
        if(!Object.keys(value).length){for(const name of ['timetable','cue','agenda','learning'])modules[name]='not_synced';return;}
        Object.assign(result,scheduleSnapshot(value,now));for(const name of ['timetable','cue','agenda','learning'])modules[name]='ready';
      }catch{for(const name of ['timetable','cue','agenda','learning'])modules[name]='error';}
    })(),
    load('tasks',async()=>{
      const {data,error}=await supabase.from('study_tasks').select('id,plan_id,title,completed,due_date,scheduled_at,priority,updated_at').eq('user_id',userId).order('completed').order('priority').order('due_date',{nullsFirst:false}).limit(500);
      if(error)throw error;result.tasks=(data??[]).map(task=>({id:task.id,planId:task.plan_id,title:watchText(task.title,240),completed:task.completed,version:task.updated_at,
        dueLabel:task.due_date??'无截止时间',dueAt:task.due_date?zonedEpoch(task.due_date,'20:00'):0,priority:['最高','较高','普通','较低','最低'][Math.max(0,Math.min(4,Number(task.priority??3)-1))]}));
    }),
    load('countdowns',async()=>{const {data,error}=await supabase.from('countdowns').select('id,title,target_date').eq('user_id',userId).order('target_date').limit(200);if(error)throw error;result.countdowns=(data??[]).map(item=>({id:item.id,title:watchText(item.title,240),targetAt:Date.parse(item.target_date)}));}),
    load('plans',async()=>{
      const {data,error}=await supabase.from('study_plans').select('id,title,description,start_date,end_date').eq('user_id',userId).order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      result.plans=(data??[]).map(plan=>({...plan,title:watchText(plan.title,240),description:watchText(plan.description,2000)}));
    }),
    load('activity',async()=>{
      const since=new Date(now.getTime()-6*86400000),today=calendarDate(now);
      const {data,error}=await supabase.from('companion_activity_daily').select('activity_date,hostname,active_seconds').eq('user_id',userId).gte('activity_date',calendarDate(since)).lte('activity_date',today).limit(5001);
      if(error)throw error;
      const rows=data??[],domains=new Map<string,number>();let todaySeconds=0,weekSeconds=0;
      for(const row of rows.slice(0,5000)){const seconds=Math.max(0,Number(row.active_seconds)||0);weekSeconds+=seconds;if(row.activity_date===today)todaySeconds+=seconds;domains.set(row.hostname,(domains.get(row.hostname)??0)+seconds);}
      result.activity={todaySeconds,weekSeconds,partial:rows.length>5000,domains:[...domains].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,seconds])=>({name,seconds}))};
    }),
    load('notifications',async()=>{
      const {data,error}=await supabase.rpc('notification_snapshot',{include_history:true,page_offset:0});if(error)throw error;
      result.unreadCount=data?.unreadCount??0;result.notificationHasMore=Boolean(data?.hasMore);
      result.notifications=(data?.items??[]).map((item:Record<string,unknown>)=>({id:item.id,title:watchText(item.title,240),read:item.is_read,version:item.updated_at,text:watchText(item.content,2000)}));
    }),
  ]);
  return mergeWatchDidaTasks(result,modules,didaTasks,now);
}

export function normalizeWatchSeiueTodos(todos:SeiueTodo[],now:Date) {
  const today=calendarDate(now);
  const endDate=new Date(`${today}T12:00:00+08:00`);endDate.setUTCDate(endDate.getUTCDate()+14);
  const end=calendarDate(endDate);
  const candidates=todos.filter(todo=>todo.status==='pending').map(todo=>{
    const parsed=todo.deadline?parseSeiueDeadline(todo.deadline):null;
    const dueDate=parsed?.date??today;
    const detail=watchText([todo.kind==='assignment'?(todo.assignmentType??'作业/资料'):'选课截止',todo.courseName,todo.creatorName?`布置人：${todo.creatorName}`:null,parsed?`截止：${todo.deadline}`:'未提供截止时间',todo.description].filter(Boolean).join('\n'),1200);
    return {id:`seiue:${todo.id}`,title:watchText(todo.title,240),date:dueDate<today?today:dueDate,sourceDate:dueDate,start:parsed?.time??'',minutes:0,subject:watchText(todo.courseName??'SEIUE',120),detail,source:'seiue',status:'pending',deadlineLabel:todo.deadline??'未提供截止时间',dueAt:parsed?zonedEpoch(parsed.date,parsed.time):0};
  }).filter(todo=>!todo.dueAt||todo.sourceDate<=end).sort((a,b)=>(a.dueAt||Number.MAX_SAFE_INTEGER)-(b.dueAt||Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
  return {items:candidates.slice(0,200),hasMore:candidates.length>200};
}
function parseSeiueDeadline(value:string):{date:string;time:string}|null {
  const match=/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if(!match||!Number.isFinite(Date.parse(`${match[1]}T${match[2]}:${match[3]}:00+08:00`)))return null;
  const date=new Date(`${match[1]}T12:00:00+08:00`);
  if(date.toISOString().slice(0,10)!==match[1]||Number(match[2])>23||Number(match[3])>59)return null;
  return {date:match[1],time:`${match[2]}:${match[3]}`};
}
export function mergeWatchDidaTasks(result:Record<string,unknown>, modules:Record<string,string>, didaTasks:Array<{id:string;title:string;completed:boolean;version:string;date:string;start:string;minutes:number;subject:string;detail:string;source:string}>, now=new Date()) {
  const localTasks=Array.isArray(result.tasks)?result.tasks:[];
  result.tasks=[...localTasks,...didaTasks];
  if(modules.tasks!=='ready' && didaTasks.length)modules.tasks='ready';
  const agenda=Array.isArray(result.agenda)?result.agenda:[];
  const today=calendarDate(now), end=calendarDate(new Date(now.getTime()+6*86400000));
  const externalAgenda=didaTasks.filter(task=>!task.completed&&task.date<=end).map(task=>({...task,date:task.date<today?today:task.date,sourceDate:task.date}));
  const merged=[...agenda,...externalAgenda].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start??'').localeCompare(String(b.start??'')));
  result.agenda=merged.slice(0,300);result.agendaHasMore=Boolean(result.agendaHasMore)||merged.length>300;
  if(modules.agenda!=='ready' && externalAgenda.length)modules.agenda='ready';
  return result;
}
