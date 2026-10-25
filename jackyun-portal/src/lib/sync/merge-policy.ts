import {threeWayMerge,type MergePolicy} from './merge.ts';

/** These are display/edit metadata in the known Schedule schema, never learning
 * outcomes, deletion flags, timers, counters, answers or scheduling decisions.
 * Wall clocks may combine metadata; they never decide whose content wins.
 */
export function workspaceMergePolicy(key:string):MergePolicy|undefined {
  // Only registered settings stamps use the server value; preference content
  // and arbitrary timestamp-looking text retain the ordinary conflict rules.
  if(/^jackyun_settings_[a-z0-9_]+__updated_at$/.test(key))return (_base,local,remote,path)=>{
    if(path!=='$'||![local,remote].every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))))return;
    return {value:remote};
  };
  if(key!=='jackyun_schedule_control_v1')return undefined;
  return (base,local,remote,path)=>{
    if(!/^\$\.(?:cues|cueMemos|manualTasks|learningRecords)\[[^\]]+\]\.updatedAt$/.test(path))return;
    const dates=[base,local,remote];
    if(!dates.every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))))return;
    if(Date.parse(String(local))<Date.parse(String(base)) || Date.parse(String(remote))<Date.parse(String(base)))return;
    return {value:Date.parse(String(local))>=Date.parse(String(remote))?local:remote};
  };
}
export function mergeWorkspaceValues(key:string,base:unknown,local:unknown,remote:unknown,path='$') {
  return threeWayMerge(base,local,remote,path,workspaceMergePolicy(key));
}
