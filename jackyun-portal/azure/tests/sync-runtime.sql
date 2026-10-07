-- Requires azure/sync-runtime.sql and at least two existing restored auth users.
-- All fixture writes and the temporary verification grant roll back.
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
SET LOCAL plpgsql.check_asserts = on;
DO $guard$ BEGIN
  IF current_database() !~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only an isolated JackYun migration database is allowed';
  END IF;
END $guard$;
CREATE FUNCTION public.azure_sync_default_privilege_probe()
RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE TEMP TABLE azure_sync_test_context ON COMMIT DROP AS
SELECT ARRAY(SELECT id FROM auth.users ORDER BY id LIMIT 2) AS users,
  gen_random_uuid() AS device, gen_random_uuid() AS operation,
  'azure_verify_' || gen_random_uuid()::text AS key,
  'jackyun_private.backup_dirty_pages'::regclass::oid AS private_backup_relation;
GRANT SELECT ON azure_sync_test_context TO jackyun_sync_runtime;
SET LOCAL ROLE jackyun_sync_runtime;
DO $test$
DECLARE
  ctx record;
  first_result jsonb;
  retry_result jsonb;
  next_result jsonb;
  tombstone jsonb;
  parts integer;
  reconstructed text;
  large_value jsonb := jsonb_build_object('text', repeat('学习📚', 150000));
  caught boolean;
BEGIN
  SELECT * INTO ctx FROM azure_sync_test_context;
  ASSERT cardinality(ctx.users) = 2, 'Two restored users are required';
  ASSERT current_user = 'jackyun_sync_runtime', 'Use the ordinary runtime role';
  ASSERT NOT (SELECT rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb
    FROM pg_roles WHERE rolname = current_user), 'Runtime privileges must stay bounded';
  ASSERT NOT pg_has_role(current_user, 'authenticated', 'SET'), 'Cannot switch to compatibility role';
  ASSERT NOT has_schema_privilege(current_user, 'public', 'CREATE'), 'No schema creation';
  ASSERT NOT has_function_privilege(current_user, 'public.azure_sync_default_privilege_probe()', 'EXECUTE'), 'New functions are not executable by default';
  ASSERT NOT has_table_privilege(current_user, 'auth.users', 'SELECT'), 'No auth credential reads';
  ASSERT NOT has_table_privilege(current_user, 'public.profiles', 'UPDATE'), 'No profile privilege changes';
  ASSERT NOT has_schema_privilege(current_user, 'jackyun_private', 'USAGE'), 'No private schema access';
  ASSERT NOT has_table_privilege(current_user, ctx.private_backup_relation, 'SELECT'), 'No private backup reads';
  ASSERT NOT has_function_privilege(current_user, 'public.admin_set_beta_invitation(uuid,boolean)', 'EXECUTE'), 'No admin RPC';
  ASSERT NOT has_function_privilege('anon', 'public.list_web_sync_records(timestamptz,text)', 'EXECUTE'), 'No anonymous RPC';
  ASSERT NOT has_function_privilege('authenticated', 'public.list_web_sync_records(timestamptz,text)', 'EXECUTE'), 'No blanket compatibility grant';

  PERFORM set_config('request.jwt.claim.sub',ctx.users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ctx.users[1],'role','authenticated')::text,true);
  INSERT INTO public.web_sync_devices(id,user_id,name,platform)
    VALUES(ctx.device,ctx.users[1],'Azure migration verification','web');
  first_result := public.apply_web_sync_operation(ctx.operation,ctx.device,ctx.key,0,NULL,NULL,
    '{"verified":1}',repeat('a',64),false,now());
  ASSERT first_result->>'status' = 'applied' AND first_result->>'revision' = '1', 'Initial write';
  retry_result := public.apply_web_sync_operation(ctx.operation,ctx.device,ctx.key,0,NULL,NULL,
    '{"verified":1}',repeat('a',64),false,now());
  ASSERT retry_result = first_result, 'Operation retry returns the original result';
  ASSERT (SELECT count(*) FROM public.sync_operations WHERE id=ctx.operation)=1, 'No duplicated operation';
  next_result := public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,1,repeat('a',64),
    '{"verified":1}','{"verified":2}',repeat('b',64),false,now());
  ASSERT next_result->>'revision' = '2', 'Matching revision update';
  next_result := public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,0,repeat('a',64),
    NULL,'{"stale":true}',repeat('c',64),false,now()-interval '1 day');
  ASSERT next_result->>'status' = 'remote' AND next_result->>'revision' = '2', 'Older offline edit cannot overwrite';

  caught := false;
  BEGIN
    INSERT INTO public.legacy_sync_data(user_id,storage_key,storage_value)
      VALUES(ctx.users[2],ctx.key,'{"cross_user":true}');
  EXCEPTION WHEN insufficient_privilege THEN caught := true; END;
  ASSERT caught, 'Cross-user insert must fail';
  caught := false;
  BEGIN
    UPDATE public.legacy_sync_data SET user_id=ctx.users[2]
      WHERE user_id=ctx.users[1] AND storage_key=ctx.key;
  EXCEPTION WHEN insufficient_privilege THEN caught := true; END;
  ASSERT caught, 'Cannot reassign ownership';

  PERFORM set_config('request.jwt.claim.sub',ctx.users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ctx.users[2],'role','authenticated')::text,true);
  ASSERT NOT EXISTS(SELECT FROM public.legacy_sync_data WHERE storage_key=ctx.key), 'Second user cannot read first user';
  ASSERT NOT EXISTS(SELECT FROM public.sync_operations WHERE id=ctx.operation), 'Operation history stays isolated';
  caught := false;
  BEGIN
    PERFORM public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,0,NULL,NULL,
      '{"cross_device":true}',repeat('d',64),false,now());
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Invalid or revoked device' THEN caught := true; ELSE RAISE; END IF;
  END;
  ASSERT caught, 'Second user cannot submit using another user device';

  PERFORM set_config('request.jwt.claim.sub',ctx.users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ctx.users[1],'role','authenticated')::text,true);
  next_result := public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,2,repeat('b',64),
    '{"verified":2}',large_value,repeat('e',64),false,now());
  ASSERT next_result->>'revision' = '3', 'Large write uses same version rules';
  ASSERT (SELECT large AND storage_value IS NULL FROM public.list_web_sync_records(NULL,ctx.key)), 'Large value withheld from list';
  parts := (public.get_web_sync_record_part(ctx.key,3,0)->>'count')::integer;
  ASSERT parts>20, 'Large fixture spans many parts';
  SELECT convert_from(string_agg(decode(public.get_web_sync_record_part(ctx.key,3,n)->>'data','base64'),
    ''::bytea ORDER BY n),'UTF8') INTO reconstructed FROM generate_series(0,parts-1) n;
  ASSERT reconstructed::jsonb = large_value, 'Unicode survives all chunk boundaries';
  ASSERT public.get_web_sync_record_part(ctx.key,2,0)->>'error' = 'REVISION_CHANGED', 'Stale chunk revision rejected';
  ASSERT public.get_web_sync_record_part(ctx.key,3,parts)->>'error' = 'INVALID_PART', 'Out-of-range chunk rejected';
  tombstone := public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,3,repeat('e',64),
    large_value,NULL,repeat('f',64),true,now());
  ASSERT tombstone->>'revision' = '4', 'Delete increments version';
  ASSERT (SELECT deleted_at IS NOT NULL AND storage_value IS NULL
    FROM public.list_web_sync_records(NULL,ctx.key)), 'Deletion marker stays visible';
  next_result := public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,0,NULL,NULL,
    '{"revive":true}',repeat('1',64),false,now()-interval '1 day');
  ASSERT next_result->>'status' = 'remote' AND (next_result->>'remoteDeleted')::boolean, 'Stale edit cannot revive deleted data';
  UPDATE public.web_sync_devices SET revoked_at=now() WHERE id=ctx.device;
  caught := false;
  BEGIN
    PERFORM public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,4,repeat('f',64),
      NULL,'{}',repeat('2',64),false,now());
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Invalid or revoked device' THEN caught := true; ELSE RAISE; END IF;
  END;
  ASSERT caught, 'Revoked device cannot write';
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  ASSERT NOT EXISTS(SELECT FROM public.list_web_sync_records(NULL,ctx.key)), 'Missing identity cannot list';
  ASSERT public.get_web_sync_record_part(ctx.key,4,0)->>'error' = 'UNAUTHORIZED', 'Missing identity cannot read chunks';
  caught := false;
  BEGIN
    PERFORM public.apply_web_sync_operation(gen_random_uuid(),ctx.device,ctx.key,4,repeat('f',64),
      NULL,'{}',repeat('3',64),false,now());
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Unauthorized' THEN caught := true; ELSE RAISE; END IF;
  END;
  ASSERT caught, 'Missing identity cannot write';
END $test$;
SELECT jsonb_build_object('syncRuntimeChecksPassed',true,'role',current_user,
  'fixturesRolledBack',true,'productionCutover',false);
ROLLBACK;
