-- Read-only migration dependency catalog. NOT a pg_dump or complete backup.
-- Definitions may include sensitive application literals: keep output private.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
WITH relations AS MATERIALIZED (
  SELECT c.*, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'jackyun_private') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
), routines AS MATERIALIZED (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'jackyun_private') AND p.prokind IN ('f', 'p')
)
SELECT jsonb_build_object(
  'format', 'jackyun-application-schema-catalog-v1',
  'scope', jsonb_build_array('public', 'jackyun_private'), 'capturedAt', current_timestamp,
  'serverVersion', current_setting('server_version'),
  'extensions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', e.extname, 'version', e.extversion, 'schema', n.nspname
  ) ORDER BY e.extname), '[]'::jsonb) FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace),
  'relations', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', format('%I.%I', r.nspname, r.relname), 'kind', r.relkind,
    'owner', pg_get_userbyid(r.relowner), 'acl', r.relacl,
    'rls', r.relrowsecurity, 'forceRls', r.relforcerowsecurity,
    'partitionChild', r.relispartition, 'options', r.reloptions,
    'partitionKey', CASE WHEN r.relkind = 'p' THEN pg_get_partkeydef(r.oid) END,
    'partitionBound', CASE WHEN r.relispartition THEN pg_get_expr(r.relpartbound, r.oid) END,
    'parents', (SELECT COALESCE(jsonb_agg(i.inhparent::regclass::text ORDER BY i.inhseqno), '[]'::jsonb) FROM pg_inherits i WHERE i.inhrelid = r.oid),
    'viewDefinition', CASE WHEN r.relkind IN ('v', 'm') THEN pg_get_viewdef(r.oid, false) END,
    'columns', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
      'default', pg_get_expr(d.adbin, d.adrelid), 'acl', a.attacl,
      'collation', CASE WHEN a.attcollation <> 0 THEN a.attcollation::regcollation::text END
    ) ORDER BY a.attnum), '[]'::jsonb) FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped)
  ) ORDER BY r.relname), '[]'::jsonb) FROM relations r),
  'constraints', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', c.conrelid::regclass::text, 'name', c.conname, 'type', c.contype,
    'definition', pg_get_constraintdef(c.oid, false), 'validated', c.convalidated,
    'deferred', c.condeferred, 'deferrable', c.condeferrable,
    'referencedTable', CASE WHEN c.confrelid <> 0 THEN c.confrelid::regclass::text END
  ) ORDER BY c.conrelid::regclass::text, c.conname), '[]'::jsonb)
    FROM pg_constraint c WHERE c.conrelid IN (SELECT oid FROM relations)),
  'indexes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', i.indrelid::regclass::text, 'name', i.indexrelid::regclass::text,
    'definition', pg_get_indexdef(i.indexrelid), 'valid', i.indisvalid, 'ready', i.indisready
  ) ORDER BY i.indexrelid::regclass::text), '[]'::jsonb)
    FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM relations)),
  'routines', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text, 'definition', pg_get_functiondef(p.oid),
    'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl,
    'securityDefiner', p.prosecdef, 'config', p.proconfig
  ) ORDER BY p.oid::regprocedure::text), '[]'::jsonb) FROM routines p),
  'triggers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', t.tgrelid::regclass::text, 'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_get_triggerdef(t.oid, false), 'function', t.tgfoid::regprocedure::text
  ) ORDER BY t.tgrelid::regclass::text, t.tgname), '[]'::jsonb)
    FROM pg_trigger t WHERE NOT t.tgisinternal AND (
      t.tgrelid IN (SELECT oid FROM relations) OR t.tgfoid IN (SELECT oid FROM routines))),
  'policies', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', p.polrelid::regclass::text, 'name', p.polname,
    'command', p.polcmd, 'permissive', p.polpermissive,
    'roles', (SELECT jsonb_agg(CASE WHEN id = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(id) END ORDER BY id) FROM unnest(p.polroles) id),
    'using', pg_get_expr(p.polqual, p.polrelid), 'withCheck', pg_get_expr(p.polwithcheck, p.polrelid)
  ) ORDER BY p.polrelid::regclass::text, p.polname), '[]'::jsonb)
    FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM relations)),
  'sequences', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sequencename), '[]'::jsonb)
    FROM pg_sequences s WHERE s.schemaname IN ('public', 'jackyun_private')),
  'types', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', format('%I.%I', n.nspname, t.typname), 'kind', t.typtype,
    'base', CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) END,
    'notNull', t.typnotnull, 'default', t.typdefault,
    'enumLabels', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid),
    'domainConstraints', (SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'definition', pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid = t.oid)
  ) ORDER BY t.typname), '[]'::jsonb) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('public', 'jackyun_private') AND t.typtype IN ('e', 'd')),
  'defaultPrivileges', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', n.nspname, 'type', d.defaclobjtype, 'acl', d.defaclacl
  ) ORDER BY d.defaclrole, d.defaclobjtype), '[]'::jsonb) FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE d.defaclnamespace = 0 OR n.nspname IN ('public', 'jackyun_private')),
  'catalogDependencies', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'object', pg_describe_object(d.classid, d.objid, d.objsubid),
    'dependsOn', pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid), 'type', d.deptype
  ) ORDER BY d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid, d.refobjsubid), '[]'::jsonb)
    FROM pg_depend d WHERE
      (d.classid = 'pg_class'::regclass AND d.objid IN (SELECT oid FROM relations)) OR
      (d.classid = 'pg_proc'::regclass AND d.objid IN (SELECT oid FROM routines)) OR
      (d.classid = 'pg_constraint'::regclass AND d.objid IN (SELECT oid FROM pg_constraint WHERE conrelid IN (SELECT oid FROM relations))) OR
      (d.classid = 'pg_policy'::regclass AND d.objid IN (SELECT oid FROM pg_policy WHERE polrelid IN (SELECT oid FROM relations))))
) AS catalog;
COMMIT;
