import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scanSyncStorageInventory } from './audit-sync-storage-inventory.mjs';

const outputPath = resolve('docs/sync-v5-coverage-matrix-20261028.json');
const testedKeys = new Set([
  'jackyun_schedule_control_v1', 'jackyun_ielts_goal_v1', 'jackyun_ielts_writing_workspaces_v1',
  'jackyun_ielts_reading_library_v1', 'quizwise_current_questions', 'quizwise_history',
  'quizwise_selected_subject', 'caie_schedule_current', 'caie_progress_v2_1', 'studyguide_progress',
  'jackyun_goal_data', 'gt_v6', 'th2_plansplan-42', 'jackyun-ai-config', 'llm_key', 'ds_key',
  'ielts_${dynamic}', 'jackyun_traffic_${dynamic}|${dynamic}', 'jackyun_pomodoro_history_${dynamic}',
]);

function sourcePage(file) {
  const path = file.replaceAll('\\', '/');
  if (path.includes('/ielts') || /IELTS/i.test(path)) return 'IELTS';
  if (/quiz/i.test(path)) return 'QuizWise';
  if (/Goal|goal/i.test(path)) return 'Goals';
  if (/Studyplan|studyplan|study-guide/i.test(path)) return 'Study plan';
  if (/Timetable|timetable|schedule|Schedule|Control/i.test(path)) return 'Schedule / timetable';
  if (/MockPortal|AnswerSheet|exam|practice/i.test(path)) return 'Practice / exams';
  if (/Vocab|vocab|cue/i.test(path)) return 'CUE / vocabulary';
  if (/Pomodoro|timer|focus/i.test(path)) return 'Timers / focus';
  return 'Shared or unresolved module';
}

function unresolvedDisposition(row) {
  const files = row.source_files;
  const sole = files.length === 1 ? files[0] : '';
  if (sole === 'public/Goal.html') return {data_class:'fixed legacy migration selector',protocol:'v4 workspace key; finite set',cloud:'yes',scope:'workspace',record:'legacyGoals:base64url(one of gt_v5, gt_v4, gt_v3, goals)',migration:'Migrate only the fixed goal keys selected in the page; keep the original key and stable v5 record ID.',test:'Exercise each fixed selector and assert legacyGoals record round-trip.'};
  if (sole === 'public/Pomodoro.html') return {data_class:'monthly focus-session partition',protocol:'localStorage via v4; also v5 bootstrap candidate',cloud:'yes',scope:'workspace',record:'legacyTimer:base64url(jackyun_pomodoro_history_YYYY-MM)',migration:'Treat month as a bounded partition; retain session IDs and merge by ID, never replace the entire history across devices.',test:'Create sessions in two months and round-trip both partitions with stable session IDs.'};
  if (sole === 'public/Studyplan.html') return {data_class:'helper argument and prefix-filtered traffic keys',protocol:'v4 workspace; runtime keys are also inventoried at their construction sites',cloud:'yes for resolved caller keys',scope:'workspace',record:'legacyStudyPlan for fixed Studyplan keys; legacyLearning for jackyun_traffic_<subject>|<unit>',migration:'Do not migrate this parameter placeholder. Resolve through its call sites and prefix guard; preserve each concrete key as its own v5 workspace record.',test:'Instrument key names only while exercising Studyplan import, read, delete and restore; assert every observed key matches a concrete inventory row or the guarded traffic prefix.'};
  if (sole === 'src/lib/ai-tools.ts') return {data_class:'prefix-enumerated learning records',protocol:'v4 workspace projection',cloud:'yes for keys beginning jackyun_traffic_',scope:'workspace',record:'legacyLearning:base64url(runtime traffic key)',migration:'Read only the guarded jackyun_traffic_ namespace and migrate each concrete record independently.',test:'Seed two traffic keys, run the tool reader, and assert v5 records preserve both keys and hashes.'};
  if (sole === 'src/components/settings/quiz-language-section.tsx') return {data_class:'settings action parameter',protocol:'v4 workspace plus settings API',cloud:'yes',scope:'workspace',record:'legacyQuiz:base64url(quizwise_ui_lang | quizwise_answer_lang | quizwise_feedback_level)',migration:'Resolve the fixed localKey arguments at call sites; keep settings API and v5 workspace projection consistent until ownership is unified.',test:'Change each selector and assert the expected key and v5 record are updated.'};
  if (sole === 'src/lib/personal-site-storage.ts') return {data_class:'user-authored personal site definition record',protocol:'v5 workspace per-key record with v4-compatible local projection',cloud:'yes for UUID site IDs',scope:'workspace',record:'legacyPersonalSites:base64url(jackyun_personal_site_v1:<UUID>)',migration:'Preserve UUID IDs; migrate the local cache only when no workspace document exists; keep the explicit Supabase backup table separate until conflict-aware import.',test:'Run personal-site-storage.test.mts for local cache migration, update, durable deletion tombstone and stale-cache non-resurrection; then authenticate two devices against staging.'};
  if (files.some(file => file.includes('/sync-center-panel') || file.includes('/sync-conflict-review'))) return {data_class:'existing conflict/outbox record key',protocol:'v4 or v5 conflict metadata; not a new business key',cloud:'inherit the referenced operation',scope:'inherited',record:'inherited from conflict.recordId / operation.key',migration:'Resolve the key through its durable operation/conflict row; do not create a second record from the UI reference.',test:'Load a conflict for each supported domain and verify the linked record ID is unchanged.'};
  if (files.some(file => file.includes('/backup-center-panel') || file.includes('/backup/local.ts'))) return {data_class:'validated backup record key',protocol:'local backup or v4 workspace snapshot',cloud:'inherit the validated backup key',scope:'inherited',record:'legacyWorkspaceRecordId(validated record.key)',migration:'Only restore keys accepted by isBackupableLegacyKey and page ownership checks; never sync the backup envelope itself.',test:'Reject an unknown key and restore a known key without removing a newer local edit.'};
  if (files.some(file => file.includes('local-workspace-sync') || file.includes('legacy-frame') || file.includes('/sync/repository.ts') || file.includes('/ielts-dashboard') || file.includes('/writing-workbench') || file.includes('memory-cue-import-dialog') || file.includes('practice-timer-frame'))) return {data_class:'generic workspace storage dispatch',protocol:'inherits the concrete key protocol',cloud:'inherit concrete key classification',scope:'workspace when isSyncableStorageKey accepts key',record:'legacyWorkspaceRecordId(runtime key)',migration:'This is a facade/snapshot/import adapter, not a distinct key. Audit concrete keys at storage call sites and keep credential/control exclusions enforced before queuing.',test:'Instrument localStorage/workspaceStorage key names during page CRUD and compare with concrete rows; assert excluded keys never reach either outbox.'};
  return null;
}

function localOnlyDisposition(key) {
  if (/(?:^|[_:-])(?:api[_-]?)?key(?:$|[_:-])|(?:^|[_:-])(?:access[_-]?token|token|secret|pin)(?:$|[_:-])|^(?:llm_config|jack_ai_config|ai_config|jack_sk_[a-z0-9_-]+)$/i.test(key)) return {
    data_class: 'credential or privileged configuration',
    migration: 'Keep device-local and excluded from all v4/v5 queues; never include values in diagnostics or inventory output.',
    risk: 'Credential exposure or privilege escalation if synchronized.',
    test: 'In an isolated profile, exercise the owning settings flow with a synthetic marker only; assert the key is absent from snapshots, both outboxes, manifests, logs and exported diagnostics.',
  };
  if (/draft|unsaved_edit|savepoint|continue-/i.test(key)) return {
    data_class: 'user-authored draft or recovery buffer',
    migration: 'Currently device-local. Decide whether this is durable learning content; if yes, add an explicit domain resource and promote only through a tested user-data migration.',
    risk: 'Potential cross-device data gap; local-only status is not proof the draft is disposable.',
    test: 'Edit, reload and restore the draft in an isolated profile; verify it remains intact and absent from v4/v5 queues until its owner approves a domain mapping.',
  };
  if (/backup|restore|recovery/i.test(key)) return {
    data_class: 'local backup or recovery control',
    migration: 'Keep backup envelopes and restore workflow controls out of normal synchronization; restore validated business records through their owning resource.',
    risk: 'Do not mistake recovery metadata for canonical business state.',
    test: 'Restore one known backup and reject an unknown key; assert only validated business records enter their owner queue and the restore-control key stays local.',
  };
  if (/broadcast|deviceId|position|isInput|lease/i.test(key)) return {
    data_class: 'device coordination or transient playback state',
    migration: 'Keep device-specific coordination local; it is not account-level learning state.',
    risk: 'Cross-device replication could cause control loops or overwrite device-local state.',
    test: 'Exercise coordination and playback on two isolated tabs; assert state stays device-local and neither outbox receives the key.',
  };
  if (/browser-ai-(conversation-target|recent-choice)|seiue-course-review/i.test(key)) return {
    data_class: 'device-local privacy or integration preference',
    migration: 'Keep local: browser AI target can reveal a private endpoint choice, while SEIUE review toggles are explicitly documented as browser-local integration preferences.',
    risk: 'Replicating an integration choice could disclose private configuration or change third-party workflow across devices unexpectedly.',
    test: 'Change each local preference with synthetic values and assert it is not present in snapshots, v4/v5 outboxes, manifests or diagnostics.',
  };
  if (/debug|client_logs|muted|command|autoclose|hijack|guest_mode/i.test(key)) return {
    data_class: 'diagnostic, ephemeral command, or feature control',
    migration: 'Keep local and exclude from cloud payloads; diagnostics must not capture stored values or secrets.',
    risk: 'Transient controls/logs should not become replicated user records.',
    test: 'Exercise the diagnostic/control flow and assert values are excluded from both outboxes and no diagnostic event contains the stored value.',
  };
  if (/cache|novel_position|pomodoro_launch|schedule_output|settings_pending/i.test(key)) return {
    data_class: 'device-local cache, navigation, or pending UI state',
    migration: 'Keep local unless a separate domain-owned durable record is identified; actual learning progress must use its canonical resource/API.',
    risk: 'Possible mismatch between local convenience state and canonical learning progress.',
    test: 'Clear and rebuild the cache or navigation state; verify the canonical resource/API is unchanged and the key is absent from both outboxes.',
  };
  return {
    data_class: 'local-only; ownership review required',
    migration: 'Remain excluded until an owner classifies it as credential, control, cache, draft, or cloud-syncable business data.',
    risk: 'Do not infer sync eligibility from a localStorage call alone.',
    test: 'Observe only the key name in an isolated page workflow; assert it remains excluded from snapshots and both outboxes pending owner classification.',
  };
}

const indexedDbSourceOwnership = {
  'src/lib/offline/workspace.ts#outbox': {data_class:'durable offline business mutations',protocol:'/api/offline/workspace; separate from sync v4/v5 outboxes',cloud:true,mapping:'workspace learning/cue resources; migration not implemented',migration:'Must be atomically mapped to v5 operations with stable IDs and receipt recovery before cutover.',test:'Test uncertain HTTP response, retry, receipt, and crash recovery during explicit migration.'},
  'src/lib/sync/outbox.ts#outbox': {data_class:'v4 durable workspace operation queue',protocol:'v4',cloud:false,mapping:null,migration:'Preserve operation IDs and unknown submission state; migrate only after v5 receipt/compatibility reconciliation.',test:'Upgrade with pending and response-lost v4 operations; prove v5 receipt resolution and crash recovery.'},
  'src/lib/sync/outbox.ts#settings': {data_class:'local sync account/device settings',protocol:'local sync metadata',cloud:false,mapping:null,migration:'Keep account binding and sync preferences local; do not upload tokens or device descriptors.',test:'Account partition and logout tests.'},
};

const indexedDbOwnership = {
  'igcse_music_db': {data_class:'music track cache',protocol:'device-local IndexedDB',cloud:false,mapping:null,migration:'Keep local; track metadata is a rebuildable media cache, not user learning state.',test:'Verify offline playback works after cache fill and no sync request is emitted.'},
  'tracks': {data_class:'music track cache store',protocol:'device-local IndexedDB',cloud:false,mapping:null,migration:'Keep local with igcse_music_db; do not upload cached media metadata.',test:'Verify store callers only manage cache entries.'},
  'jackyun-page-backups-v1': {data_class:'local recovery history',protocol:'device-local IndexedDB',cloud:false,mapping:null,migration:'Retain as local safety copies; cloud backup versions use the existing backup service, not v5 workspace records.',test:'Restore an existing local backup and verify no v5 operation is created by merely reading it.'},
  'versions': {data_class:'local recovery history store',protocol:'device-local IndexedDB',cloud:false,mapping:null,migration:'Keep with jackyun-page-backups-v1; it is not normal replicated state.',test:'Exercise local backup save/restore and confirm transaction remains local.'},
  'jackyun_novel_library': {data_class:'downloaded book and chapter cache',protocol:'local IndexedDB; reading progress is managed by reader_books service',cloud:false,mapping:'reader_books (progress only; independent API)',migration:'Keep downloaded content local. Do not copy book/chapter bodies into v5; continue syncing progress through its existing authenticated service.',test:'Verify progress is read/written by reader_books and downloaded content remains cache-only.'},
  'books': {data_class:'downloaded book cache store',protocol:'local IndexedDB; progress uses reader_books API',cloud:false,mapping:null,migration:'Cache-only; no v5 migration.',test:'Cache purge/re-download must not alter cloud progress.'},
  'chapters': {data_class:'downloaded chapter cache store',protocol:'local IndexedDB; progress uses reader_books API',cloud:false,mapping:null,migration:'Cache-only; no v5 migration.',test:'Cache purge/re-download must not alter cloud progress.'},
  'jackyun-offline-workspace': {data_class:'cached task/review/reading snapshots plus durable business outbox',protocol:'/api/offline/workspace (separate authenticated API; not yet v5)',cloud:true,mapping:'workspace learning/cue resources; exact resource schema and receipt migration remain P1/P2 work',migration:'Preserve snapshots and pending operation IDs. Before cutover, map each operation to a stable v5 resource and obtain receipt or explicit migration acknowledgement; never discard this outbox.',test:'Enumerate active snapshot/outbox callers, then verify create/update/delete, retries and receipts against v5 before removing the legacy route.'},
  'snapshots': {data_class:'cached server snapshots',protocol:'/api/offline/workspace read path',cloud:false,mapping:null,migration:'Cache only; preserve user-bound invalidation and do not upload snapshots as records.',test:'Clear cache and refetch without data loss.'},
  'outbox': {data_class:'durable offline business mutations',protocol:'/api/offline/workspace; separate from sync v4/v5 outboxes',cloud:true,mapping:'workspace learning/cue resources; migration not implemented',migration:'Must be atomically mapped to v5 operations with stable IDs and receipt recovery before cutover.',test:'Test uncertain HTTP response, retry, receipt, and crash recovery during explicit migration.'},
  'settings': {data_class:'offline workspace cache metadata',protocol:'local cache metadata',cloud:false,mapping:null,migration:'Keep only user binding and cache metadata locally; do not treat as account setting records.',test:'Verify account switch clears/binds cached snapshots without cross-user exposure.'},
  'jackyun-personal-sites': {data_class:'user-authored personal site cache and migration source',protocol:'local IndexedDB cache projected to v5 workspace per-site records; explicit legacy /api/personal-sites backup remains separate',cloud:true,mapping:'workspace/legacyPersonalSites; stable UUID record IDs under jackyun_personal_site_v1:',migration:'Import local definitions to the account workspace after repository initialization; keep IndexedDB as cache; let a committed v5 tombstone suppress stale cache rows. Existing Supabase personal_sites rows are not imported by this adapter.',test:'Local IndexedDB migration, v5 outbox persistence, update, tombstone and stale-cache non-resurrection; separately validate old cloud backup ownership before retirement.'},
  'sites': {data_class:'user-authored personal site local cache store',protocol:'local IndexedDB cache projected to v5 workspace records',cloud:true,mapping:'workspace/legacyPersonalSites; one stable per-site record',migration:'Preserve IDs; UUID IDs map to versioned workspace keys. Non-UUID legacy IDs remain local until explicitly migrated.',test:'Local migration plus record update/delete and tombstone readback; multi-device CRUD remains staging acceptance.'},
  'quizwise': {data_class:'QuizWise local cache and fallback',protocol:'IndexedDB cache mirrored to quizwise_* workspace keys',cloud:false,mapping:'quizwise_* keys map to legacyQuiz v5 records',migration:'Keep cache local; migrate canonical local records from concrete quizwise_* keys once per stable key. Confirm quiz_data is not the only copy before clearing.',test:'Compare indexedDB/localStorage keys and canonical payload hash after re-open and v5 bootstrap.'},
  'quiz_data': {data_class:'QuizWise local cache/fallback store',protocol:'IndexedDB cache mirrored to quizwise_* keys',cloud:false,mapping:'legacyQuiz records originate from workspace key adapter',migration:'Do not upload duplicate cache rows; prove whether each record has a corresponding workspace key before treating it as covered.',test:'tests/quiz-v5-storage.test.mts verifies fallback current_questions migrates to a stable legacyQuiz workspace record, preserves the legacy outbox operation, and updates the local mirror. Authenticated server history remains a separate owner.'},
  'offline_answers': {data_class:'stale/unreferenced store declaration',protocol:'no active callers found beyond schema declaration',cloud:false,mapping:null,migration:'Do not migrate absent records; verify no versioned old page still reads it before eventual cleanup.',test:'Repository-wide caller scan plus browser IDB inspection in an isolated profile.'},
  'null': {data_class:'sync protocol local database',protocol:'IndexedDB metadata and outboxes',cloud:false,mapping:'not business payload; see store-level rows',migration:'Keep client-specific metadata local; migrate old outbox operations only through receipt-aware coordinator.',test:'v4/v5 operation migration, cursor atomicity, account partition and recovery tests.'},
  'metadata': {data_class:'v4 sync metadata',protocol:'v4',cloud:false,mapping:null,migration:'Protocol state only; preserve until all legacy operations are resolved.',test:'Existing v4 checkpoint and metadata migration tests.'},
  'conflicts': {data_class:'v4 conflict metadata',protocol:'v4',cloud:false,mapping:null,migration:'Preserve local and remote values during protocol transition.',test:'Conflict preservation and resolution tests.'},
  'documents': {data_class:'local durable workspace projection',protocol:'v4 document store plus v5 projection',cloud:true,mapping:'workspace records derived from exact key',migration:'Single-writer coordinator must atomically align document, v5 records, cursor and outbox state.',test:'Atomic transaction failure and concurrent local edit tests.'},
  'leases': {data_class:'sync lease coordination',protocol:'local coordination metadata',cloud:false,mapping:null,migration:'Keep local; never upload lease tokens.',test:'Multi-tab lease loss and retry tests.'},
  'v5Resources': {data_class:'v5 local resource cache',protocol:'v5',cloud:false,mapping:'scope + stable recordId',migration:'Cache is reconstructible from manifest; persist with cursor atomically.',test:'Hash-checked page commit and cursor transaction tests.'},
  'v5Cursors': {data_class:'v5 sync cursor metadata',protocol:'v5',cloud:false,mapping:null,migration:'Local metadata only; never advance outside atomic page commit.',test:'Cursor commit failure leaves prior cursor unchanged.'},
  'v5FieldCursors': {data_class:'v5 field cursor metadata',protocol:'v5',cloud:false,mapping:null,migration:'Local metadata only; scoped per field.',test:'Field baseline and incremental cursor recovery.'},
  'v5Outbox': {data_class:'v5 durable operation queue',protocol:'v5',cloud:false,mapping:null,migration:'Preserve operation ID until receipt/ack; do not duplicate legacy mutation while status is unknown.',test:'Receipt recovery after lost response and migration crash.'},
  'v5Conflicts': {data_class:'v5 conflict metadata',protocol:'v5',cloud:false,mapping:null,migration:'Retain both sides until explicit resolution.',test:'Local/remote resolution and durable restart.'},
};

const businessApiOwnership = [
  {owner:'offline workspace mutations',client_storage:'jackyun-offline-workspace snapshots/outbox',api:'/api/offline/workspace GET/POST receipt',server_owner:'study_plans, study_tasks, review_items, review_attempts, review snapshot services and reader bootstrap; apply_offline_mutation RPC and offline_mutation_receipts',protocol:'authenticated Supabase API with operationId/request SHA-256 receipt; not v5',should_v5:true,operation_contract:[
    {kind:'task.create',identity:'operationId is also study_tasks.id',effects:'insert one owner-scoped task; retry returns the same operation receipt'},
    {kind:'task.toggle',identity:'payload.taskId',effects:'update completed/completed_at/updated_at for the owner task'},
    {kind:'task.delete',identity:'payload.taskId',effects:'delete the owner task'},
    {kind:'plan.delete',identity:'payload.planId',effects:'delete all owner tasks in the plan, then delete the owner plan in the same RPC transaction'},
    {kind:'review.archive',identity:'payload.reviewItemId',effects:'mark the owner review item archived'},
    {kind:'review.attempt',identity:'operationId is review_attempts.id; target is payload.reviewItemId',effects:'insert immutable attempt and update review interval/ease/streak/next-review state transactionally'},
  ],proposed_v5_mapping:'workspace scope, stable task/review/reading record IDs; v5 writes must preserve RPC validation and business side effects',migration:'Do not retire the RPC or clear the durable outbox until every mutation kind has an equivalent v5 transaction/projection and receipt recovery path. Reconcile pending operations by the same operationId and confirm via the existing receipt before translating or dropping them.',test:'Authenticated create/update/delete, duplicate operation, lost response, receipt lookup, account isolation, plus compatibility of review/reading side effects.'},
  {owner:'personal site definitions',client_storage:'account-scoped workspace per-site documents; unowned legacy IndexedDB cache retained for guest recovery only',api:'/api/personal-sites GET is an authenticated-owner migration source; old POST/DELETE remain for old clients pending server cutover',server_owner:'candidate studio edits and imported source copies enter workspace legacyPersonalSites; old Supabase table is retained until a verified ownership freeze/cutover',protocol:'candidate studio no longer dual-writes the backup API; owner-checked source import uses atomic insert-if-missing document plus durable intent, then normal v4-to-v5 authority/receipt handoff',should_v5:true,proposed_v5_mapping:'workspace scope, field legacyPersonalSites, stable ID derived from jackyun_personal_site_v1:<UUID>; differing source versions get deterministic separate UUIDs',migration:'Do not claim unowned cache for signed-in accounts, overwrite local edits or resurrect tombstones. Preserve differing backup copies. Do not delete source rows or declare final authority cutover before old-client writes are frozen and import receipt/hash coverage is reconciled.',test:'Local account-switch, idempotent copy, tombstone and injected outbox-save rollback tests pass. Isolated desktop/mobile-width browser cases preserve local saves with unavailable source and send zero legacy mutation requests. Restricted staging client/SQL handoff tests cover frozen submission, lost response and failed receipt persistence; real authenticated browser/device and source write-freeze/cutover remain pending.'},
  {owner:'IELTS Writing workspaces',client_storage:'legacy arrays remain the editor compatibility projection; active v5 state uses writingEssays, writingErrorHistory and writingArchive stable item records',api:'Editor no longer calls the whole-document GET/PUT; v5 page subscription owns cloud exchange while local arrays remain the editing surface',server_owner:'candidate Azure migrates legacy_sync_data arrays to per-item workspace records and maintains the v4 projection in the same transaction',protocol:'v5 client handoff atomically reconciles local arrays, queued legacy edits and per-item resources; frozen submissions/conflicts defer activation; cursors commit with data and projection',should_v5:true,proposed_v5_mapping:'workspace writingEssays/writingErrorHistory/writingArchive with stable essay identity, bounded hex addresses and server-only baseline markers; preferences and recovery snapshots stay local or explicit',migration:'Server bootstrap and projection are staged. Preserve local drafts and frozen old operations; retain writing workspaces when archiving until verified readback and deletion receipts can be proven. Do not treat missing Supabase data as a successful empty migration.',test:'Local IndexedDB tests cover stable fan-out, frozen queue deferral, remote projection and cursor atomic rollback, and post-conflict edits. Restricted staging currently covers server compatibility; authenticated browser/device and real user write/readback remain pending.'},
  {owner:'QuizWise cloud quiz history',client_storage:'quizwise IndexedDB quiz_data fallback/cache plus quiz_sessions/quiz_questions tables',api:'src/actions/quiz.ts authenticated server actions',server_owner:'quiz_subjects, quiz_sessions, quiz_questions, quiz_settings; review-item side effects on session completion',protocol:'direct authenticated Supabase CRUD with RLS; not v5/offline mutation outbox',should_v5:true,proposed_v5_mapping:'new quiz scope: session:<UUID>, question:<UUID>, subject:<UUID>, settings:<user>; preserve completion-to-review behavior',migration:'Separate cached question bank from canonical attempts. Route v5 mutations through transactional server projection so review effects and RLS remain correct.',test:'Start/answer/complete/delete, receipt retry, no duplicate review items, stable IDs, question/session ownership and RLS.'},
  {owner:'Focus sessions and Pomodoro tasks',client_storage:'timer and task workspace state plus focus_sessions/focus_tasks rows',api:'/api/focus-sessions POST; legacy actions/pomodoro.ts direct insert; companion sync can also upsert sessions',server_owner:'focus_sessions, focus_tasks, study_tasks',protocol:'authenticated Supabase service; primary route uses client_operation_id uniqueness, creates/validates focus_tasks before saving; legacy direct insert lacks that receipt key; not v5',should_v5:true,proposed_v5_mapping:'timer scope per stable session ID with taskId/studyTaskId, start/end, duration, planned duration and outcome; preserve focus task linkage as a separately versioned task record',migration:'Keep current service authoritative until v5 writes reproduce user/task ownership checks, focus_tasks creation, duration validation, and operation-id idempotency. Inventory and deduplicate legacy source=pomodoro rows before switching writes.',test:'Repeat the same operation ID, simulate lost response, verify one session and one focus-task link, enforce owner/task association and duration limits, then check cross-device timer history.'},
  {owner:'novel shelf and reading progress',client_storage:'jackyun_novel_library content cache; progress in reader_books rows',api:'direct authenticated Supabase CRUD in novel-workbench; reader bootstrap API',server_owner:'reader_books rows keyed by user_id + book_id; novel/book bodies are catalog/cache',protocol:'direct authenticated CRUD with RLS; not v5',should_v5:true,proposed_v5_mapping:'new reader scope per stable book_id, separating user shelf/progress metadata from downloaded book/chapter cache',migration:'Keep content cache device-local; move only canonical user progress/shelf state and preserve book storage references.',test:'Two-device shelf/progress update, deletion/tombstone, content cache purge independence and cross-user RLS.'},
];

export function buildCoverageMatrix(inventory) {
  const grouped = new Map();
  for (const row of inventory.rows) {
    const id = `${row.receiver}\u0000${row.key}\u0000${row.owner === 'unresolved' ? row.file : ''}`;
    let item = grouped.get(id);
    if (!item) {
      const localOnly = row.owner === 'local-only-or-control' || row.receiver.includes('sessionStorage');
      const unresolved = row.owner === 'unresolved';
      const localOnlyInfo = localOnly ? localOnlyDisposition(row.key) : null;
      const workspace = row.owner === 'v5-workspace' || row.owner === 'v5-workspace-pattern';
      const schedule = row.owner === 'v5-schedule';
      const unresolvedInfo = unresolved ? unresolvedDisposition({source_files:[row.file]}) : null;
      item = {
        key_or_pattern: row.key,
        storage: row.receiver.includes('sessionStorage') ? 'sessionStorage' : row.receiver.includes('workspaceStorage') ? 'workspaceStorage (localStorage projection)' : 'localStorage',
        data_class: unresolvedInfo?.data_class ?? (localOnly ? localOnlyInfo.data_class : 'workspace business key'),
        current_protocol: localOnly ? 'local-only' : unresolved ? unresolvedInfo?.protocol ?? 'unresolved; concrete runtime key must be classified' : 'legacy v2/v4; v5 candidate may also bootstrap or sync',
        should_cloud_sync: localOnly ? false : unresolved ? unresolvedInfo?.cloud ?? 'review' : true,
        v5_scope: workspace ? 'workspace' : schedule ? 'Schedule scopes from resource model' : unresolved ? unresolvedInfo?.scope ?? null : null,
        v5_record_id: workspace ? `${row.field}:base64url(runtime key)` : schedule ? 'Schedule field-specific stable recordId' : unresolved ? unresolvedInfo?.record ?? null : null,
        migration: localOnly ? localOnlyInfo.migration : unresolved ? unresolvedInfo?.migration ?? 'Resolve the wrapper/key owner and add runtime sampling before migration.' : schedule ? 'Convert Schedule projection into field records; preserve revision/hash/tombstone.' : 'Bootstrap the exact legacy key with owner, revision, SHA-256 and tombstone; reconcile pending legacy outbox before v5 authority.',
        test_status: testedKeys.has(row.key) ? row.key.includes('${dynamic}') ? 'dynamic key template covered by model regression; authenticated browser/runtime sampling and business round-trip remain pending' : 'named key covered by inventory/resource-model regression' : unresolvedInfo ? 'source owner classified; browser/runtime key sampling and business round-trip remain pending' : unresolved ? 'unresolved; no proof of v5 mapping' : 'inventory classification only; business round-trip not proven',
        unresolved_risk: localOnly ? localOnlyInfo.risk : unresolvedInfo ? 'Runtime keys must match the documented caller, prefix guard or durable operation; this source-level classification is not production sample proof.' : unresolved ? 'Key identity and sensitivity are not statically known; must not be globally migrated.' : 'Key-level mapping does not split nested arrays/records; inspect value schema and credential content.',
        runtime_sampling_or_test_method: localOnly ? localOnlyInfo.test : unresolved ? unresolvedInfo?.test ?? 'Instrument authenticated test profile storage key names only; map each observed key to an explicit domain or exclusion.' : row.key.includes('dynamic')
          ? 'In an authenticated, isolated test profile, instrument Storage.prototype.getItem/setItem/removeItem to record key names only (never values); exercise create/read/update/delete on the named page, compare observed keys against this row, then assert v5 manifest/receipt/hash/tombstone behavior.'
          : 'Run the page-specific resource-model round-trip and authenticated v5 create/read/update/delete test; confirm the migration manifest contains the same stable record ID.',
        source_files: new Set(),
        operations: new Set(),
        call_sites: 0,
        page_or_module: new Set(),
      };
      grouped.set(id, item);
    }
    item.source_files.add(row.file);
    item.operations.add(row.operation);
    item.page_or_module.add(sourcePage(row.file));
    item.call_sites++;
  }
  const rows = [...grouped.values()].map(item => ({
    ...item,
    source_files: [...item.source_files].sort(),
    operations: [...item.operations].sort(),
    page_or_module: [...item.page_or_module].sort(),
  })).sort((a,b)=>a.key_or_pattern.localeCompare(b.key_or_pattern));
  const indexeddb = inventory.indexedDbCalls.map(row => {
    const ownership = indexedDbSourceOwnership[`${row.file}#${row.name}`] ?? indexedDbOwnership[row.name] ?? indexedDbOwnership[row.name?.split(':')[0]];
    return {
      database_or_store: row.name,
      kind: row.kind,
      source_file: row.file,
      line: row.line,
      data_class: ownership?.data_class ?? 'unclassified IndexedDB call site',
      current_protocol: ownership?.protocol ?? 'trace adapter/API owner',
      should_cloud_sync: ownership?.cloud ?? 'review by data ownership',
      v5_mapping: ownership?.mapping ?? null,
      migration: ownership?.migration ?? 'Classify as user-authored data, cache, local recovery, device state or separate API-owned state; then document adapter or explicit exclusion.',
      test_status: ownership?.test?.includes('tests/quiz-v5-storage.test.mts') ? 'local fallback migration and mirror behavior covered by tests/quiz-v5-storage.test.mts; authenticated server history and profile census remain pending' : ownership ? 'source ownership classified; behavior-specific acceptance required as noted' : 'name inventoried; owner unresolved',
      unresolved_risk: ownership?.cloud ? 'Syncable business state is not yet proven to use v5 end-to-end.' : ownership ? 'Ensure local cache/recovery data remains available and is not mistaken for canonical state.' : 'Do not infer cloud-sync eligibility from IndexedDB presence alone.',
      runtime_sampling_or_test_method: ownership?.test ?? 'Instrument IDB transactions in an isolated account and record database/store/key path names only; exercise CRUD and inspect the owning API/receipt path without exporting user values.',
    };
  });
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_files_scanned: inventory.sourceFiles,
    storage_call_sites: inventory.callSites,
    inventory_rows: rows,
    indexeddb_call_sites: indexeddb,
    business_api_owners: businessApiOwnership,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/build-sync-v5-coverage-matrix.mjs')) {
  const inventory = await scanSyncStorageInventory();
  const matrix = buildCoverageMatrix(inventory);
  await writeFile(outputPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath} with ${matrix.inventory_rows.length} local-storage patterns and ${matrix.indexeddb_call_sites.length} IndexedDB call sites.`);
}
