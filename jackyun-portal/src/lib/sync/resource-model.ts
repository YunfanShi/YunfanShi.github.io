import {isSyncableStorageKey} from '../local-workspace.ts';
import {isWritingProjectionKey,splitWritingCollection,writingCollectionForKey,writingItemKey,WRITING_COLLECTIONS} from './writing-resource-model.ts';

export const SYNC_V5_SCHEDULE_SCOPES = ['timetable','learning','cue','practice','timer','settings'] as const;
export const SYNC_V5_SCOPES = [...SYNC_V5_SCHEDULE_SCOPES,'workspace'] as const;
export const LEGACY_WORKSPACE_FIELDS = ['legacyTimetable','legacyLearning','legacyStudyPlan','legacyGoals','legacyCue','legacyIELTS','legacyQuiz','legacyExam','legacyPractice','legacyTimer','legacySettings','legacyMedia','legacyPersonalSites','writingEssays','writingErrorHistory','writingArchive'] as const;
export type SyncV5Scope = typeof SYNC_V5_SCOPES[number];
export type SyncV5ResourceTarget = {scope:SyncV5Scope;field:string};

export interface ScheduleResource {
  scope: SyncV5Scope;
  recordId: string;
  field: string;
  itemId: string;
  value: unknown;
  deleted?: boolean;
}

type ResourceField = { field:string; scope:SyncV5Scope; mode:'items'|'map'|'value'; idField?:string };
const fields:ResourceField[]=[
  {field:'timetable',scope:'timetable',mode:'value'},
  {field:'manualTasks',scope:'learning',mode:'items'},
  {field:'completions',scope:'learning',mode:'map'},
  {field:'cancellations',scope:'learning',mode:'map'},
  {field:'reviewProgress',scope:'learning',mode:'map'},
  {field:'learningRecords',scope:'learning',mode:'items'},
  {field:'learningCatalog',scope:'learning',mode:'items'},
  {field:'learningReminders',scope:'learning',mode:'items'},
  {field:'cues',scope:'cue',mode:'items'},
  {field:'cueReviews',scope:'cue',mode:'items'},
  {field:'cueGameAccount',scope:'cue',mode:'value'},
  {field:'cueCollectionUpdates',scope:'cue',mode:'items'},
  {field:'cueChangeHistory',scope:'cue',mode:'items'},
  {field:'cueSimilarityDecisions',scope:'cue',mode:'items'},
  {field:'cueMemos',scope:'cue',mode:'items',idField:'cueId'},
  {field:'cueAnswerCards',scope:'cue',mode:'items'},
  {field:'cueStudyDraft',scope:'cue',mode:'value'},
  {field:'cueStudyDrafts',scope:'cue',mode:'map'},
  {field:'timedPracticeRecords',scope:'practice',mode:'items'},
  {field:'examDiagnoses',scope:'practice',mode:'items'},
  {field:'practiceFrequencies',scope:'practice',mode:'items'},
  {field:'practiceSessions',scope:'timer',mode:'items'},
  {field:'practiceTimerConfig',scope:'timer',mode:'value'},
  {field:'settings',scope:'settings',mode:'value'},
  {field:'cueScheduleRevision',scope:'settings',mode:'value'},
  {field:'dailyLearningAdvice',scope:'settings',mode:'value'},
  {field:'studyReports',scope:'settings',mode:'items'},
  {field:'importedAt',scope:'settings',mode:'value'},
  {field:'schemaVersion',scope:'settings',mode:'value'},
];
const configured=new Set(fields.map(item=>item.field));
const SCHEDULE_STORAGE_KEY='jackyun_schedule_control_v1';
export function isEmptyScheduleCollection(field:string,value:unknown):boolean{
  const definition=fields.find(item=>item.field===field);
  if(definition?.mode==='items')return Array.isArray(value)&&value.length===0;
  if(definition?.mode==='map')return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0);
  return false;
}
function base64UrlEncode(value:string):string{
  const bytes=new TextEncoder().encode(value),binary=Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlDecode(value:string):string{
  const base64=value.replace(/-/g,'+').replace(/_/g,'/'),binary=atob(base64+'='.repeat((4-base64.length%4)%4));
  return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));
}
export function legacyWorkspaceFieldForKey(key:string):typeof LEGACY_WORKSPACE_FIELDS[number]|null{
  if(!isSyncableStorageKey(key)||key===SCHEDULE_STORAGE_KEY)return null;
  const projection=WRITING_COLLECTIONS.find(collection=>collection.legacyKey===key);if(projection)return projection.field;
  const writing=writingCollectionForKey(key);if(writing)return writing.field;
  if(/^jackyun_personal_site_v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))return 'legacyPersonalSites';
  if(/^(temp_|blocks_|check_|prog_)/i.test(key))return 'legacyStudyPlan';
  if(/^ielts_\d{4}-\d{2}-\d{2}$/i.test(key))return 'legacyStudyPlan';
  if(/^(jackyun_traffic_|jackyun_schedule_questions_v1$|jackyun-site-tasks:|warden_chat_v23$|jack_chat_history$)/i.test(key))return 'legacyLearning';
  if(/^jackyun_practice_recovery_/i.test(key))return 'legacyPractice';
  if(/^warden_sch_plan_/i.test(key))return 'legacyStudyPlan';
  if(/^(jackyun_hide_homepage_ai$|jackyun-ai-(pro-model|safety-mode|thinking-level|token-price|fab-position|active-conversation)$|jack_lang_chat$|warden_gacha_cfg$)/i.test(key))return 'legacySettings';
  if(/^warden_ai_daily_target$/i.test(key))return 'legacyGoals';
  if(/(music|song|bili|poem|relax|voice|water|v45|^w10_|^mps_)/i.test(key))return 'legacyMedia';
  if(/^(jack_timetable_plan|w3_|th2_|timetable)/i.test(key))return 'legacyTimetable';
  if(/ielts/i.test(key))return 'legacyIELTS';
  if(/(quizwise|^qw_)/i.test(key))return 'legacyQuiz';
  if(/(igcse|answer.?sheet|mock.?portal|control_history|exam)/i.test(key))return 'legacyExam';
  if(/(pomodoro|timer|countdown|^cd_v|gt_timers|^thc$|^ths$|focus)/i.test(key))return 'legacyTimer';
  if(/(studyguide|studyplan|^caie_)/i.test(key))return 'legacyStudyPlan';
  if(/(goal|fixed_blocks|daily_plan|warden_gt_|^gt_)/i.test(key))return 'legacyGoals';
  if(/control_events/i.test(key))return 'legacyLearning';
  if(/(cue|lexiflow|vocab|definition_cards|property_decks)/i.test(key))return 'legacyCue';
  if(/(learning|manualtasks|reviewprogress|jackyun-ai-workspace-chats|jackyun-ai-conversations)/i.test(key))return 'legacyLearning';
  if(/(settings|theme|language|sidebar|preference|profile|interface|display|font|nav|notification|tts|^ai_|^llm_|^warden_ai_(provider|custom)|^jackyun_workspace_idle|fullscreen|beta_active|personal_site_active)/i.test(key))return 'legacySettings';
  return null;
}
export function legacyWorkspaceRecordId(key:string):string|null{
  const field=legacyWorkspaceFieldForKey(key);return field?`${field}:${base64UrlEncode(key)}`:null;
}
export function legacyWorkspaceKeyFromRecordId(recordId:string):string|null{
  const colon=recordId.indexOf(':');if(colon<1)return null;
  const field=recordId.slice(0,colon),encoded=recordId.slice(colon+1);
  if(!(LEGACY_WORKSPACE_FIELDS as readonly string[]).includes(field)||!/^[A-Za-z0-9_-]{1,216}$/.test(encoded))return null;
  try{const key=base64UrlDecode(encoded);return legacyWorkspaceFieldForKey(key)===field&&legacyWorkspaceRecordId(key)===recordId?key:null;}catch{return null;}
}
function storageValue(raw:string):unknown{
  try{return JSON.parse(raw);}catch{return raw;}
}
export function workspaceValueToStorage(value:unknown):string|null{
  if(value===null)return null;
  return typeof value==='string'?value:JSON.stringify(value)??'null';
}
export function workspaceStorageToResources(rows:readonly {key:string;value:string|null;writingProjection?:boolean}[]):ScheduleResource[]{
  return rows.flatMap<ScheduleResource>(({key,value,writingProjection})=>{
    const collection=WRITING_COLLECTIONS.find(row=>row.legacyKey===key);
    if(writingProjection&&isWritingProjectionKey(key)){
      if(!collection||value===null)return [];
      const parsed=storageValue(value);
      return splitWritingCollection(collection,parsed).map(item=>{
        const itemRecordId=legacyWorkspaceRecordId(writingItemKey(collection,item.id));
        if(!itemRecordId)throw new Error('IELTS 写作资源键无效。');
        return {scope:'workspace' as const,field:collection.field,recordId:itemRecordId,itemId:item.id,value:item.value};
      });
    }
    if(writingCollectionForKey(key)||isWritingProjectionKey(key))return [];
    const recordId=legacyWorkspaceRecordId(key);if(!recordId)return [];
    return [{scope:'workspace',field:recordId.slice(0,recordId.indexOf(':')),recordId,itemId:recordId.slice(recordId.indexOf(':')+1),value:value===null?null:storageValue(value),deleted:value===null}];
  });
}
export function resourceScopeForRecordId(recordId:string):SyncV5Scope|null{
  const colon=recordId.indexOf(':');if(colon<1)return null;
  const field=recordId.slice(0,colon);
  if(legacyWorkspaceKeyFromRecordId(recordId))return 'workspace';
  if(field==='__root')return recordId==='__root:value'?'settings':null;
  return fields.find(item=>item.field===field)?.scope??null;
}
export function resourceFieldsForScope(scope:SyncV5Scope):string[]{
  if(scope==='workspace')return [...LEGACY_WORKSPACE_FIELDS];
  return [...new Set(fields.filter(item=>item.scope===scope).map(item=>item.field).concat(scope==='settings'?['__root']:[]))];
}
const record=(field:ResourceField,itemId:string,value:unknown):ScheduleResource=>({
  scope:field.scope,field:field.field,itemId,recordId:`${field.field}:${encodeURIComponent(itemId)}`,value,
});

export function scheduleToResources(input:unknown):ScheduleResource[] {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Schedule 资源格式无效。');
  const state=input as Record<string,unknown>,resources:ScheduleResource[]=[];
  const unknown=Object.fromEntries(Object.entries(state).filter(([key])=>!configured.has(key)));
  resources.push({scope:'settings',field:'__root',itemId:'value',recordId:'__root:value',value:unknown});
  for(const definition of fields){
    if(!Object.hasOwn(state,definition.field))continue;
    const value=state[definition.field];
    if(definition.mode==='items'&&Array.isArray(value)){
      const ids=value.map((item,index)=>{
        const candidate=definition.idField?(item as Record<string,unknown>)?.[definition.idField]:(item as Record<string,unknown>)?.id;
        return typeof candidate==='string'&&candidate.length?candidate:`legacy-index-${index}`;
      });
      if(new Set(ids).size!==ids.length)throw new Error(`Schedule 资源 ${definition.field} 含重复 ID。`);
      resources.push(record(definition,'$order',ids));
      value.forEach((item,index)=>resources.push(record(definition,ids[index],item)));
    }else if(definition.mode==='map'&&value&&typeof value==='object'&&!Array.isArray(value)){
      const entries=Object.entries(value as Record<string,unknown>);
      resources.push(record(definition,'$keys',entries.map(([key])=>key)));
      for(const [key,item] of entries)resources.push(record(definition,key,item));
    }else resources.push(record(definition,'$value',value));
  }
  return resources;
}

export function resourcesToSchedule(resources:readonly ScheduleResource[]):Record<string,unknown> {
  const state:Record<string,unknown>={};
  const root=resources.find(item=>item.field==='__root'&&item.itemId==='value')?.value;
  if(root&&typeof root==='object'&&!Array.isArray(root))Object.assign(state,root);
  for(const definition of fields){
    const selected=resources.filter(item=>item.field===definition.field);
    if(!selected.length)continue;
    if(definition.mode==='items'){
      const order=selected.find(item=>item.itemId==='$order')?.value;
      const ids=Array.isArray(order)?order.filter((id):id is string=>typeof id==='string'):[];
      const byId=new Map(selected.filter(item=>item.itemId!=='$order').map(item=>[item.itemId,item.value]));
      state[definition.field]=ids.flatMap(id=>byId.has(id)?[byId.get(id)]:[]);
    }else if(definition.mode==='map'){
      const keys=selected.find(item=>item.itemId==='$keys')?.value;
      const allowed=Array.isArray(keys)?keys.filter((key):key is string=>typeof key==='string'):[];
      const byId=new Map(selected.filter(item=>item.itemId!=='$keys').map(item=>[item.itemId,item.value]));
      state[definition.field]=Object.fromEntries(allowed.filter(key=>byId.has(key)).map(key=>[key,byId.get(key)]));
    }else{
      const item=selected.find(entry=>entry.itemId==='$value');
      if(item)state[definition.field]=item.value;
    }
  }
  return state;
}

export function mergeScheduleResources(base:Record<string,unknown>,resources:readonly ScheduleResource[],touchedFields:readonly string[]=resources.map(item=>item.field)):Record<string,unknown> {
  const normalized=resourcesToSchedule(resources),touched=new Set(touchedFields),value={...base};
  for(const field of touched){
    if(field==='__root')continue;
    if(Object.hasOwn(normalized,field))value[field]=normalized[field];else delete value[field];
  }
  if(touched.has('__root')){
    for(const key of Object.keys(value))if(!configured.has(key))delete value[key];
    for(const [key,item] of Object.entries(normalized))if(!configured.has(key))value[key]=item;
  }
  return value;
}

export function resourceMap(resources:readonly ScheduleResource[]):Map<string,ScheduleResource> {
  return new Map(resources.map(item=>[`${item.scope}\0${item.recordId}`,item]));
}
