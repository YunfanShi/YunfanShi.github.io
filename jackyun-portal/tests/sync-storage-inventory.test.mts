import test from 'node:test';
import assert from 'node:assert/strict';
import { scanSyncStorageInventory } from '../scripts/audit-sync-storage-inventory.mjs';
import { buildCoverageMatrix } from '../scripts/build-sync-v5-coverage-matrix.mjs';
import { legacyWorkspaceRecordId } from '../src/lib/sync/resource-model.ts';

test('source storage inventory maps core learning keys and excludes credential aliases', async () => {
  const inventory = await scanSyncStorageInventory();
  const keyRows = key => inventory.rows.filter(row => row.key === key);
  const ownerFor = key => keyRows(key).map(row => row.owner);

  assert.ok(inventory.sourceFiles > 500, 'scan must include portal and legacy page sources');
  assert.ok(inventory.callSites > 500, 'scan must include direct storage reads and writes');
  assert.ok(ownerFor('jackyun_schedule_control_v1').includes('v5-schedule'));
  assert.ok(ownerFor('jackyun_ielts_goal_v1').includes('v5-workspace'));
  assert.ok(ownerFor('quizwise_current_questions').includes('v5-workspace'));
  assert.ok(ownerFor('caie_schedule_current').includes('v5-workspace'));
  assert.ok(ownerFor('th2_plans').includes('v5-workspace'));
  assert.ok(ownerFor('LexiFlowPro_Merged_V2').includes('v5-workspace'));
  assert.ok(inventory.rows.some(row => row.key === 'jackyun_pomodoro_history_${dynamic}' && row.field === 'legacyTimer'));

  const indexedDb = inventory.indexedDbCalls.map(row => `${row.kind}:${row.name}`);
  for (const database of ['quizwise', 'jackyun-offline-workspace', 'jackyun_novel_library', 'jackyun-personal-sites', 'jackyun-page-backups-v1']) {
    assert.ok(indexedDb.includes(`database:${database}`), `${database} must be present in the storage inventory`);
  }
  for (const store of ['offline_answers', 'outbox', 'books', 'chapters', 'sites', 'versions']) {
    assert.ok(indexedDb.includes(`store:${store}`), `${store} must be present in the IndexedDB inventory`);
  }

  for (const key of ['ai_key', 'warden_key', 'warden_ai_key', 'llm_config', 'jack_ai_config', 'jack_sk_ds', 'jack_sk_qw', 'ai_config', 'llm_key', 'deepseek_api_key']) {
    assert.equal(keyRows(key).some(row => row.syncable), false, `${key} must never be admitted to v5 workspace bootstrap`);
  }
  assert.ok(inventory.rows.some(row => row.owner === 'unresolved'), 'dynamic keys must remain visible as audit work, not be silently labeled covered');

  const syncableWorkspacePatterns = inventory.rows.filter(row => row.syncable && row.key !== 'jackyun_schedule_control_v1');
  for (const row of syncableWorkspacePatterns) {
    const sampleKey = row.key.replaceAll('${dynamic}', 'sample');
    assert.ok(legacyWorkspaceRecordId(sampleKey), `${row.key} must resolve to a real v5 workspace record`);
  }
});

test('machine-readable coverage matrix preserves unresolved and independent IndexedDB risks', async () => {
  const matrix = buildCoverageMatrix(await scanSyncStorageInventory());
  const fields = ['key_or_pattern','page_or_module','storage','current_protocol','should_cloud_sync','v5_scope','v5_record_id','migration','test_status','unresolved_risk'];
  for (const field of fields) assert.ok(Object.hasOwn(matrix.inventory_rows[0], field), `matrix row must include ${field}`);
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === 'jackyun_traffic_${dynamic}|${dynamic}' && row.v5_scope === 'workspace' && row.v5_record_id.startsWith('legacyLearning:')));
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === 'ielts_${dynamic}' && row.v5_record_id.startsWith('legacyStudyPlan:')));
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === 'quizwise_${dynamic}' && row.v5_scope === 'workspace'));
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === 'jackyun_pomodoro_history_${dynamic}' && row.v5_record_id.startsWith('legacyTimer:')));
  for (const pattern of ['ielts_${dynamic}','jackyun_traffic_${dynamic}|${dynamic}','jackyun_pomodoro_history_${dynamic}']) {
    const row = matrix.inventory_rows.find(item => item.key_or_pattern === pattern);
    assert.match(row.test_status, /authenticated browser\/runtime sampling.*pending/i, `${pattern} template regression must not imply runtime acceptance`);
  }
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === '? key' && row.page_or_module.includes('Study plan') && row.v5_record_id.includes('jackyun_traffic_')));
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === '? key' && row.page_or_module.includes('Goals') && row.v5_record_id.includes('gt_v5')));
  assert.ok(matrix.inventory_rows.some(row => row.key_or_pattern === 'jackyun:notification-broadcast:v1:${dynamic}:lease' && row.should_cloud_sync === false), 'notification coordination leases must remain device-local');
  const rowFor = key => matrix.inventory_rows.find(row => row.key_or_pattern === key);
  assert.match(rowFor('llm_key').data_class, /credential/i);
  assert.match(rowFor('jack_ai_config').data_class, /credential/i);
  assert.match(rowFor('jack_sk_ds').data_class, /credential/i);
  assert.match(rowFor('studyguide_exam_plan_draft_v1').data_class, /draft/i);
  assert.match(rowFor('jackyun_chunk_recovery:${dynamic}').data_class, /backup or recovery/i);
  assert.match(rowFor('sync_position').data_class, /coordination/i);
  assert.match(rowFor('jackyun_client_logs').data_class, /diagnostic/i);
  assert.match(rowFor('jackyun-browser-ai-conversation-target').data_class, /privacy/i);
  assert.match(rowFor('jackyun:seiue-course-review:v1:${dynamic}').data_class, /privacy/i);
  assert.ok(matrix.inventory_rows.every(row => typeof row.runtime_sampling_or_test_method === 'string' && row.runtime_sampling_or_test_method.length > 20));
  const restoreKey = matrix.inventory_rows.find(row => row.key_or_pattern === '? pendingRestore.key');
  assert.equal(restoreKey.should_cloud_sync, false);
  assert.match(restoreKey.data_class, /backup or recovery/i);
  assert.match(restoreKey.runtime_sampling_or_test_method, /restore-control key stays local/i);
  assert.doesNotMatch(restoreKey.runtime_sampling_or_test_method, /authenticated v5 create\/read\/update\/delete/i);
  const credentialRows = ['ai_key', 'warden_key', 'warden_ai_key', 'llm_key', 'deepseek_api_key', 'llm_config', 'jack_ai_config', 'jack_sk_ds'].map(rowFor).filter(Boolean);
  assert.ok(credentialRows.length >= 4);
  for (const row of credentialRows) assert.match(row.data_class, /credential/i, `${row.key_or_pattern} must remain excluded as a credential`);
  assert.equal(matrix.inventory_rows.filter(row => String(row.current_protocol).startsWith('unresolved')).length, 0, 'every static key pattern has an explicit source disposition; runtime sampling remains a separate gate');
  assert.ok(matrix.indexeddb_call_sites.some(row => row.database_or_store === 'offline_answers' && row.v5_mapping?.includes('quizwise_offline_answers') && row.should_cloud_sync === true));
  assert.ok(matrix.indexeddb_call_sites.some(row => row.source_file === 'src/lib/offline/workspace.ts' && row.database_or_store === 'outbox' && row.should_cloud_sync === true && row.migration.includes('atomically')));
  assert.ok(matrix.indexeddb_call_sites.some(row => row.source_file === 'src/lib/sync/outbox.ts' && row.database_or_store === 'outbox' && row.protocol === undefined && row.current_protocol === 'v4'));
  assert.ok(matrix.indexeddb_call_sites.some(row => row.database_or_store === 'jackyun-personal-sites' && row.should_cloud_sync === true && row.v5_mapping?.includes('legacyPersonalSites')));
  const quizFallback = matrix.indexeddb_call_sites.find(row => row.database_or_store === 'quiz_data');
  assert.match(quizFallback.test_status, /tests\/quiz-v5-storage\.test\.mts/);
  assert.match(quizFallback.test_status, /authenticated server history.*pending/);
  assert.ok(matrix.inventory_rows.some(row => row.source_files.includes('src/lib/personal-site-storage.ts') && row.current_protocol.includes('v5 workspace') && row.v5_scope === 'workspace' && row.v5_record_id.includes('legacyPersonalSites')));
  const offlineOwner = matrix.business_api_owners.find(row => row.owner === 'offline workspace mutations');
  assert.ok(offlineOwner.protocol.includes('not v5') && offlineOwner.test.includes('lost response'));
  assert.deepEqual(offlineOwner.operation_contract.map(item => item.kind), ['task.create','task.toggle','task.delete','plan.delete','review.archive','review.attempt']);
  assert.match(offlineOwner.operation_contract.find(item => item.kind === 'task.create').identity, /operationId/);
  assert.match(offlineOwner.operation_contract.find(item => item.kind === 'plan.delete').effects, /delete all owner tasks.*same RPC transaction/);
  assert.match(offlineOwner.operation_contract.find(item => item.kind === 'review.attempt').effects, /immutable attempt.*transactionally/);
  const personalSites=matrix.business_api_owners.find(row=>row.owner==='personal site definitions');
  assert.match(personalSites.protocol,/no longer dual-writes/);
  assert.match(personalSites.api,/old POST\/DELETE remain/);
  assert.match(personalSites.migration,/old-client writes are frozen/);
  assert.match(personalSites.migration,/receipt\/hash coverage/);
  const writingOwner = matrix.business_api_owners.find(row => row.owner === 'IELTS Writing workspaces');
  assert.ok(writingOwner);
  assert.match(writingOwner.protocol, /per-item resources/);
  assert.match(writingOwner.api, /no longer calls the whole-document GET\/PUT/);
  assert.match(writingOwner.proposed_v5_mapping, /stable essay identity/);
  assert.match(writingOwner.migration, /retain writing workspaces when archiving/);
  assert.ok(matrix.business_api_owners.some(row => row.owner === 'QuizWise cloud quiz history' && row.test.includes('duplicate review items')));
  const focusOwner = matrix.business_api_owners.find(row => row.owner === 'Focus sessions and Pomodoro tasks');
  assert.ok(focusOwner.protocol.includes('client_operation_id uniqueness') && focusOwner.protocol.includes('not v5'));
  assert.match(focusOwner.migration, /deduplicate legacy source=pomodoro/i);
  assert.match(focusOwner.test, /lost response.*one session/i);
  assert.ok(matrix.business_api_owners.some(row => row.owner === 'novel shelf and reading progress' && row.migration.includes('device-local')));
});
