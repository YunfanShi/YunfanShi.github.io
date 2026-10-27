export const workspaceStorage={getItem:()=>'{"local":true}'};
export const siteConfirm=async text=>window.confirm(text),sitePrompt=async()=>null;
export const LOCAL_SYNC_STATUS_EVENT='jackyun-local-sync-status';
export const useAuthMode=()=>({signedIn:true});
export const getLatestSyncStatus=()=>({state:'conflict',pending:0,conflicts:3,lastSyncedAt:null});
export const getConflicts=async()=>window.fixtureEmpty?[]:[{operationId:'legacy',key:'legacy-key',remoteRevision:2,remoteHash:'hash'}];
export const getV5Conflicts=async()=>window.fixtureEmpty?[]:['one','two'].map(id=>({operationId:id,scope:'cue',recordId:'cues:'+id,localValue:{id,local:true},remoteValue:{id,cloud:true},remoteRevision:2,remoteHash:'hash'}));
export const getOutbox=async()=>[],getOrCreateDeviceId=async()=>'fixture',getSetting=async key=>key==='activeUserId'?'fixture':[];
export const fetchSyncWithTimeout=async()=>Response.json({devices:[]});
export const BACKUP_PAGES=[],legacyBackupPage=()=>undefined;
export const listOfflineMutations=async()=>[],getLatestLaneStates=()=>[];
export const useLocalSaveState=()=>'saved',downloadLocalRecovery=()=>{};
export default function SyncConflictReview(){return null;}
