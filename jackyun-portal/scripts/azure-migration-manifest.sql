-- Run with psql -X -q -A -t -v ON_ERROR_STOP=1 -f this-file.sql.
-- Requires SELECT and RLS bypass on ALL public and jackyun_private tables.
-- This is a read-only verification manifest, NOT a backup or migration.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
SET LOCAL row_security = off;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';

WITH tables AS MATERIALIZED (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'jackyun_private') AND c.relkind IN ('r', 'p') AND NOT c.relispartition
), snapshots AS MATERIALIZED (
  SELECT t.*, query_to_xml(format(
    'SELECT count(*)::text AS rows, md5(coalesce(string_agg(h, '''' ORDER BY h COLLATE "C"), '''')) AS fingerprint FROM (SELECT md5(to_jsonb(r)::text) AS h FROM %I.%I r) hashes',
    schema_name, table_name), false, false, '') AS result
  FROM tables t
)
SELECT jsonb_build_object(
  'format', 'jackyun-application-manifest-v2',
  'captured_at', transaction_timestamp(),
  'database', current_database(),
  'scope', jsonb_build_array('public', 'jackyun_private'),
  'algorithm', 'md5-sorted-row-jsonb-v1',
  'tables', coalesce(jsonb_agg(jsonb_build_object(
    'name', schema_name || '.' || table_name,
    'rows', (xpath('/table/row/rows/text()', result))[1]::text,
    'fingerprint', (xpath('/table/row/fingerprint/text()', result))[1]::text,
    'columns', (SELECT jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'nullable', NOT a.attnotnull) ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid = snapshots.oid AND a.attnum > 0 AND NOT a.attisdropped)
  ) ORDER BY schema_name, table_name), '[]'::jsonb)
) FROM snapshots;
COMMIT;
