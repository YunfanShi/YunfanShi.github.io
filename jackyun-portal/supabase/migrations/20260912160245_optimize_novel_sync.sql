-- Store catalog content once and keep only shelf state plus reading metadata per user.
ALTER TABLE public.reader_books
  ADD COLUMN content_source text NOT NULL DEFAULT 'local'
    CHECK (content_source IN ('local', 'store')),
  ADD COLUMN on_shelf boolean NOT NULL DEFAULT true,
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN content_hash DROP NOT NULL;

UPDATE public.reader_books
SET content_source = 'store'
WHERE metadata->>'source' = 'store'
   OR book_id LIKE 'catalog-%';

DO $$
DECLARE
  storage_constraint text;
BEGIN
  SELECT conname
  INTO storage_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.reader_books'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%storage_path%'
  LIMIT 1;

  IF storage_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reader_books DROP CONSTRAINT %I', storage_constraint);
  END IF;
END
$$;

ALTER TABLE public.reader_books
  ADD CONSTRAINT reader_books_storage_path_by_source_check
  CHECK (
    (
      content_source = 'local'
      AND storage_path = 'users/' || user_id::text || '/' || book_id || '.json'
      AND content_hash IS NOT NULL
    )
    OR
    (
      content_source = 'store'
      AND (
        storage_path IS NULL
        OR storage_path = 'users/' || user_id::text || '/' || book_id || '.json'
      )
    )
  );

CREATE INDEX reader_books_user_shelf_updated_idx
  ON public.reader_books (user_id, updated_at DESC)
  WHERE on_shelf;
