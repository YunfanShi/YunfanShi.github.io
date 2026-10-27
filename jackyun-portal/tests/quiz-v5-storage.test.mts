import assert from 'node:assert/strict';
import test from 'node:test';
import {IDBFactory} from 'fake-indexeddb';
import {getDocuments,getOutbox} from '../src/lib/sync/outbox.ts';
import {applyRepositoryRecord,initializeRepository,workspaceStorage} from '../src/lib/sync/repository.ts';
import {appendLocalQuizHistory,clearCurrentQuizProgress,clearCurrentSession,clearOfflineAnswers,getCurrentQuestions,getCurrentQuizProgress,getCurrentSession,getLocalQuizHistory,getOfflineAnswers,getQuizSettings,getSelectedSubject,queueOfflineAnswer,quizProgressMatchesQuestions,quizProgressQuestionIds,saveCurrentQuestions,saveCurrentQuizProgress,saveCurrentSession,saveQuizSettings,saveSelectedSubject} from '../src/lib/quiz/storage.ts';
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

async function seedLegacyOfflineAnswer(answer:{questionIndex:number;sessionId:string;answer:string;timestamp:string}){
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
    const tx=db.transaction('offline_answers','readwrite');tx.objectStore('offline_answers').add(answer);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

async function readLegacyOfflineAnswerCount(){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('quizwise',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{return await new Promise<number>((resolve,reject)=>{
    const tx=db.transaction('offline_answers','readonly'),request=tx.objectStore('offline_answers').count();
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
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

test('QuizWise tombstone blocks stale IndexedDB question cache resurrection',async()=>{
  const userId='quiz-owner-deleted-cache',key='quizwise_current_questions';
  await initializeRepository(userId);
  await seedQuizCache('current_questions',[{id:'stale-question',questionText:'must stay deleted'}]);
  await applyRepositoryRecord(key,null);
  assert.deepEqual(await getCurrentQuestions(),[]);
  assert.equal((await getDocuments()).find(row=>row.key===key)?.value,null);
  assert.ok(!(await getOutbox()).some(row=>row.key===key&&!row.deleted),'stale cache fallback must not enqueue a resurrection write');
});

test('QuizWise progress is restored only with the question set named by its stable IDs',()=>{
  const progress={sessionId:'session-a',startedAt:'2026-10-28T10:00:00.000Z',subjectName:'Math',currentIndex:0,
    questionIds:['question-a','question-b'],answers:[]};
  assert.equal(quizProgressMatchesQuestions(progress,[{id:'question-a',questionText:'a',type:'short_answer',options:null,correctAnswer:'a',explanation:''},
    {id:'question-b',questionText:'b',type:'short_answer',options:null,correctAnswer:'b',explanation:''}]),true);
  assert.equal(quizProgressMatchesQuestions(progress,[{id:'old-a',questionText:'old',type:'short_answer',options:null,correctAnswer:'old',explanation:''},
    {id:'old-b',questionText:'old',type:'short_answer',options:null,correctAnswer:'old',explanation:''}]),false);
  assert.equal(quizProgressMatchesQuestions({...progress,sessionId:null,questionIds:[]},[]),true);
  assert.equal(quizProgressMatchesQuestions({...progress,questionIds:['','question-b']},[
    {id:'',questionText:'a',type:'short_answer',options:null,correctAnswer:'a',explanation:''},
    {id:'question-b',questionText:'b',type:'short_answer',options:null,correctAnswer:'b',explanation:''}]),false);
  assert.deepEqual(quizProgressQuestionIds(['','']),[],'local-only quizzes must not persist placeholder IDs');
  assert.deepEqual(quizProgressQuestionIds(['question-a','question-b']),['question-a','question-b']);
});

test('all QuizWise local business keys map to stable v5 records and remain in the account outbox',async()=>{
  const userId='quiz-owner-all-keys';
  await initializeRepository(userId);
  const settings={show_answer_immediately:false,auto_submit_on_enter:false,default_subject_id:'subject-a',selected_subjects:['subject-a']};
  const session={id:'session-a',startedAt:'2026-10-27T08:00:00.000Z'};
  const history={id:'history-a',subject_name:'Mathematics',started_at:'2026-10-27T08:00:00.000Z',completed_at:'2026-10-27T08:01:00.000Z',total_questions:1,correct_count:1,accuracy:100,duration_seconds:60};
  await saveCurrentSession(session);
  await saveQuizSettings(settings);
  await appendLocalQuizHistory(history);
  await saveSelectedSubject('subject-a');
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

  await clearCurrentSession();
  assert.equal(getCurrentSession(),null);
  assert.ok((await getOutbox()).some(row=>row.key==='quizwise_current_session'&&row.deleted),
    'clearing the active session must wait for and queue its explicit workspace tombstone');
});

test('active QuizWise answers are restored from the durable v5 workspace row and explicit completion queues a tombstone',async()=>{
  const userId='quiz-owner-progress';
  await initializeRepository(userId);
  const progress={sessionId:'session-remote',startedAt:'2026-10-28T09:00:00.000Z',subjectName:'Mathematics',
    currentIndex:1,questionIds:['question-a','question-b'],answers:[
      {questionIndex:0,answer:'A',isCorrect:true},{questionIndex:1,answer:'working shown',isCorrect:null},
    ]};

  await saveCurrentQuizProgress(progress);
  assert.deepEqual(getCurrentQuizProgress(),progress);
  const recordId=legacyWorkspaceRecordId('quizwise_current_progress')!;
  assert.equal(legacyWorkspaceFieldForKey('quizwise_current_progress'),'legacyQuiz');
  assert.ok((await getDocuments()).some(row=>row.key==='quizwise_current_progress'&&row.value===JSON.stringify(progress)));
  assert.ok((await getOutbox()).some(row=>row.key==='quizwise_current_progress'&&row.id));

  await clearCurrentQuizProgress();
  assert.equal(getCurrentQuizProgress(),null);
  assert.ok((await getOutbox()).some(row=>row.key==='quizwise_current_progress'&&row.deleted),`explicit clear must queue a v5 tombstone for ${recordId}`);
});

test('QuizWise preference and history writers surface workspace durability failures',async()=>{
  await initializeRepository('quiz-owner-storage-failure');
  const originalFlush=workspaceStorage.flush.bind(workspaceStorage);
  workspaceStorage.flush=async()=>{throw new Error('injected IndexedDB transaction failure');};
  try{
    await assert.rejects(saveSelectedSubject('Chemistry'),/injected IndexedDB transaction failure/);
    await assert.rejects(appendLocalQuizHistory({id:'local-failure',subject_name:'Chemistry',started_at:'2026-10-28T09:00:00.000Z',
      completed_at:'2026-10-28T09:01:00.000Z',total_questions:1,correct_count:1,accuracy:100,duration_seconds:60}),
    /injected IndexedDB transaction failure/);
  }finally{workspaceStorage.flush=originalFlush;}
});

test('legacy offline answers migrate to one durable v5 queue before the old IndexedDB rows are cleared',async()=>{
  const userId='quiz-owner-offline-queue',legacy={questionIndex:2,sessionId:'session-offline',answer:'B',timestamp:'2026-10-28T09:20:00.000Z'};
  await initializeRepository(userId);
  await seedLegacyOfflineAnswer(legacy);

  assert.deepEqual(await getOfflineAnswers(),[legacy]);
  await workspaceStorage.flush();
  const key='quizwise_offline_answers';
  assert.equal(legacyWorkspaceFieldForKey(key),'legacyQuiz');
  assert.ok(legacyWorkspaceRecordId(key));
  assert.ok((await getDocuments()).some(row=>row.key===key));
  assert.ok((await getOutbox()).some(row=>row.key===key&&!row.deleted),'the v5 queue must remain pending until receipt confirmation');
  assert.equal(await readLegacyOfflineAnswerCount(),0);

  const next={questionIndex:3,sessionId:'session-offline',answer:'C',timestamp:'2026-10-28T09:21:00.000Z'};
  await queueOfflineAnswer(next);
  assert.deepEqual(await getOfflineAnswers(),[legacy,next]);
  assert.ok((await getOutbox()).some(row=>row.key===key&&!row.deleted),'new offline answers also wait for a v5 receipt');
});

test('offline answer migration retains the legacy queue when v5 IndexedDB persistence fails',async()=>{
  await initializeRepository('quiz-owner-offline-failure');
  await seedLegacyOfflineAnswer({questionIndex:0,sessionId:'session-kept',answer:'A',timestamp:'2026-10-28T09:30:00.000Z'});
  const originalFlush=workspaceStorage.flush.bind(workspaceStorage);
  workspaceStorage.flush=async()=>{throw new Error('injected v5 queue persistence failure');};
  try{
    await assert.rejects(getOfflineAnswers(),/injected v5 queue persistence failure/);
    assert.equal(await readLegacyOfflineAnswerCount(),1,'legacy source data must survive a failed migration');
  }finally{workspaceStorage.flush=originalFlush;}
  assert.equal((await getOfflineAnswers()).length,1);
  await clearOfflineAnswers();
  assert.deepEqual(await getOfflineAnswers(),[]);
  assert.ok((await getOutbox()).some(row=>row.key==='quizwise_offline_answers'&&row.deleted),'explicit clear is represented by a v5 tombstone');
});
