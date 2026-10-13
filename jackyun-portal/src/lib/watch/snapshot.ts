import { cueDashboard } from '../learning/cue-dashboard.ts';
import { readScheduleState, SCHEDULE_STORAGE_KEY } from '../learning/workspace-reader.ts';
import { sessionsForDate } from '../learning/schedule-control.ts';
import { createAzureRecordClient } from '../sync/azure-records.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

export function calendarDate(at: Date, timezone='Asia/Shanghai') {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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
    for(const session of sessionsForDate(state.timetable,day))lessons.push({id:`${key}:${session.course.id}:${session.start}`,title:session.course.name,
      startsAt:zonedEpoch(key,session.start,timezone),endsAt:zonedEpoch(key,session.end,timezone),location:session.location??'',teacher:session.teacher??''});
  }
  return {lessons,cue:{due:summary.due,learned:summary.learned,weak:summary.weak,subjects:summary.subjects}};
}
export async function snapshot(supabase:SupabaseClient,userId:string,token:string,now=new Date()) {
  const result:Record<string,unknown>={apiVersion:1,timezone:'Asia/Shanghai',generatedAt:now.toISOString()};
  const modules:Record<string,string>={};result.modules=modules;
  async function load(name:string,action:()=>Promise<void>){try{await action();modules[name]='ready';}catch{modules[name]='error';}}
  await Promise.all([
    (async()=>{
      try {
        let value:unknown;
        if(process.env.AZURE_SYNC_API_URL) {
          const record=await createAzureRecordClient({endpoint:process.env.AZURE_SYNC_API_URL,token}).read(SCHEDULE_STORAGE_KEY);
          value=record&&!record.deleted?record.value:null;
        } else {
          const {data,error}=await supabase.from('legacy_sync_data').select('storage_value,deleted_at').eq('user_id',userId).eq('storage_key',SCHEDULE_STORAGE_KEY).maybeSingle();
          if(error)throw Error('Schedule unavailable');value=data&&!data.deleted_at?data.storage_value:null;
        }
        if(value==null){modules.timetable='not_synced';modules.cue='not_synced';return;}
        Object.assign(result,scheduleSnapshot(value,now));modules.timetable='ready';modules.cue='ready';
      }catch{modules.timetable='error';modules.cue='error';}
    })(),
    load('tasks',async()=>{
      const {data,error}=await supabase.from('study_tasks').select('id,title,completed,due_date,scheduled_at,priority,updated_at').eq('user_id',userId).order('completed').order('priority').order('due_date',{nullsFirst:false}).limit(500);
      if(error)throw error;result.tasks=(data??[]).map(task=>({id:task.id,title:task.title,completed:task.completed,version:task.updated_at,
        dueLabel:task.due_date??'无截止时间',dueAt:task.due_date?zonedEpoch(task.due_date,'20:00'):0,priority:['最高','较高','普通','较低','最低'][Math.max(0,Math.min(4,Number(task.priority??3)-1))]}));
    }),
    load('countdowns',async()=>{const {data,error}=await supabase.from('countdowns').select('id,title,target_date').eq('user_id',userId).order('target_date').limit(200);if(error)throw error;result.countdowns=(data??[]).map(item=>({id:item.id,title:item.title,targetAt:Date.parse(item.target_date)}));}),
    load('notifications',async()=>{
      const {data,error}=await supabase.rpc('notification_snapshot',{include_history:true,page_offset:0});if(error)throw error;
      result.unreadCount=data?.unreadCount??0;result.notificationHasMore=Boolean(data?.hasMore);
      result.notifications=(data?.items??[]).map((item:Record<string,unknown>)=>({id:item.id,title:item.title,read:item.is_read,version:item.updated_at,text:String(item.content??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').slice(0,12000)}));
    }),
  ]);
  return result;
}
