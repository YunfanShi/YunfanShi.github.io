BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security = off;
SELECT jsonb_build_object(
  'format', 'jackyun-storage-inventory-v1',
  'project', 'gdcwwlnzylrzrqhaaljq',
  'capturedAt', current_timestamp,
  'buckets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public) ORDER BY id) FROM storage.buckets), '[]'::jsonb),
  'objects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'bucket', bucket_id, 'path', name, 'owner', owner_id,
    'size', (metadata->>'size')::bigint, 'metadata', metadata,
    'updatedAt', updated_at
  ) ORDER BY bucket_id, name) FROM storage.objects), '[]'::jsonb)
) AS inventory;
COMMIT;
