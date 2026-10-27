import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {getDocuments,getOutbox} from '../src/lib/sync/outbox.ts';
import {initializeRepository,workspaceStorage} from '../src/lib/sync/repository.ts';
import {appendLocalQuizHistory,getCurrentQuestions,getCurrentSession,getLocalQuizHistory,getQuizSettings,getSelectedSubject,saveCurrentQuestions,saveCurrentSession,saveQuizSettings,saveSelectedSubject} from '../src/lib/quiz/storage.ts';
import {legacyWorkspaceFieldForKey,legacyWorkspaceRecordId} from '../src/lib/sync/resource-model.ts';

class StorageMock {
  private values=new Map<string,string>();
  get length(){return this.values.size;}
  key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,String(value));}
  removeItem(key:string){this.values.delete(key);}
}

Object.assign(globalThis,{
  indexedDB:new IDBFactory(),
  window:{localStorage:new StorageMock(),dispatchEvent(){return true;},addEventListener(){},removeEventListener(){}},
});

async function seedQuizCache(key:string,value:unknown){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('quizwise',1);
    request.onupgradeneeded=()=>{
      const target=request.result;
      if(!target.objectStoreNames.contains('quiz_data'))target.createObjectStore('quiz_data',{keyPath:'key'});
      if(!target.objectStoreNames.contains('offline_answers'))target.createObjectStore('offline_answers',{keyPath:'id',autoIncrement:true});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('quiz_data','readwrite');tx.objectStore('quiz_data').put({key,value});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

test('QuizWise IndexedDB fallback restores into its durable legacyQuiz workspace record',async()=>{
  const userId='quiz-owner-a',key='quizwise_current_questions';
  const original=[{id:'question-1',question:'local cached question',answer:'A'}];
  await seedQuizCache('current_questions',original);
  await initializeRepository(userId);

  assert.equal(workspaceStorage.getItem(key),null);
  assert.deepEqual(await getCurrentQuestions(),original);
  await workspaceStorage.flush();
  const recordId=legacyWorkspaceRecordId(key)!;
  assert.equal(legacyWorkspaceFieldForKey(key),'legacyQuiz');
  assert.equal((await getDocuments()).find(row=>row.key===key)?.value,JSON.stringify(original));
  assert.ok((await getOutbox()).some(row=>row.key===key),'the restored business key must remain durable until its sync receipt is confirmed');

  const changed=[...original,{id:'question-2',question:'new local question',answer:'B'}];
  await saveCurrentQuestions(changed);
  await workspaceStorage.flush();
  assert.equal(legacyWorkspaceRecordId(key),recordId,'the v5 record identity is independent of the value');
  assert.equal((await getDocuments()).find(row=>row.key===key)?.value,JSON.stringify(changed));

  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('quizwise',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{const cached=await new Promise<{value:unknown}|undefined>((resolve,reject)=>{
    const tx=db.transaction('quiz_data','readonly'),request=tx.objectStore('quiz_data').get('current_questions');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });assert.deepEqual(cached?.value,changed);}finally{db.close();}
});

test('all QuizWise local business keys map to stable v5 records and remain in the account outbox',async()=>{
  const userId='quiz-owner-all-keys';
  await initializeRepository(userId);
  const settings={show_answer_immediately:false,auto_submit_on_enter:false,default_subject_id:'subject-a',selected_subjects:['subject-a']};
  const session={id:'session-a',startedAt:'2026-10-27T08:00:00.000Z'};
  const history={id:'history-a',subject_name:'Mathematics',started_at:'2026-10-27T08:00:00.000Z',completed_at:'2026-10-27T08:01:00.000Z',total_questions:1,correct_count:1,accuracy:100,duration_seconds:60};
  saveCurrentSession(session);
  saveQuizSettings(settings);
  appendLocalQuizHistory(history);
  saveSelectedSubject('subject-a');
  await workspaceStorage.flush();

  assert.deepEqual(getCurrentSession(),session);
  assert.deepEqual(getQuizSettings(),settings);
  assert.equal(getSelectedSubject(),'subject-a');
  assert.deepEqual(getLocalQuizHistory()[0],{...history,user_id:'local',subject_id:null});

  const keys=['quizwise_current_session','quizwise_quiz_settings','quizwise_history','quizwise_selected_subject'];
  const documents=await getDocuments();
  const outbox=await getOutbox();
  for(const key of keys){
    const recordId=legacyWorkspaceRecordId(key);
    assert.ok(recordId,`${key} needs a stable v5 record ID`);
    assert.equal(legacyWorkspaceFieldForKey(key),'legacyQuiz');
    assert.ok(documents.some(row=>row.key===key),`${key} must be present in the durable account workspace`);
    assert.ok(outbox.some(row=>row.key===key),`${key} must stay queued until the remote receipt is confirmed`);
  }
});
