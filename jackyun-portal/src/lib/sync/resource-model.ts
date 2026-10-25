export const SYNC_V5_SCOPES = ['timetable','learning','cue','practice','timer','settings'] as const;
export type SyncV5Scope = typeof SYNC_V5_SCOPES[number];

export interface ScheduleResource {
  scope: SyncV5Scope;
  recordId: string;
  field: string;
  itemId: string;
  value: unknown;
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
