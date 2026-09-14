-- Reader catalog synchronization, reusable tags, and managed chapters.

ALTER TABLE public.novel_catalog
  ADD COLUMN IF NOT EXISTS content_revision integer NOT NULL DEFAULT 1 CHECK (content_revision > 0),
  ADD COLUMN IF NOT EXISTS chapters_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cover_updated_at timestamptz;

UPDATE public.novel_catalog
SET cover_updated_at = updated_at
WHERE cover_path IS NOT NULL AND cover_updated_at IS NULL;

CREATE TABLE public.novel_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  normalized_name text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name)
);

CREATE TABLE public.novel_catalog_tags (
  novel_id uuid NOT NULL REFERENCES public.novel_catalog(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.novel_tags(id) ON DELETE CASCADE,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 19),
  PRIMARY KEY (novel_id, tag_id),
  UNIQUE (novel_id, sort_order)
);
CREATE INDEX novel_catalog_tags_tag_idx ON public.novel_catalog_tags(tag_id, novel_id);

CREATE OR REPLACE FUNCTION public.remove_deleted_novel_tag_from_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.novel_catalog AS catalog
  SET tags = COALESCE((
        SELECT array_agg(input.value ORDER BY input.ordinality)
        FROM unnest(catalog.tags) WITH ORDINALITY AS input(value, ordinality)
        WHERE lower(btrim(input.value)) <> OLD.normalized_name
      ), ARRAY[]::text[]),
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM unnest(catalog.tags) AS value
    WHERE lower(btrim(value)) = OLD.normalized_name
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER remove_deleted_novel_tag_from_catalog
AFTER DELETE ON public.novel_tags
FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_novel_tag_from_catalog();

INSERT INTO public.novel_tags(name)
SELECT DISTINCT btrim(tag)
FROM public.novel_catalog, unnest(tags) AS tag
WHERE btrim(tag) <> ''
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO public.novel_catalog_tags(novel_id, tag_id, sort_order)
SELECT catalog.id, tag_row.id, tag_value.ordinality - 1
FROM public.novel_catalog AS catalog
CROSS JOIN LATERAL unnest(catalog.tags) WITH ORDINALITY AS tag_value(name, ordinality)
JOIN public.novel_tags AS tag_row ON tag_row.normalized_name = lower(btrim(tag_value.name))
WHERE tag_value.ordinality <= 20
ON CONFLICT DO NOTHING;

CREATE TABLE public.novel_catalog_chapters (
  novel_id uuid NOT NULL REFERENCES public.novel_catalog(id) ON DELETE CASCADE,
  chapter_index integer NOT NULL CHECK (chapter_index >= 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content text NOT NULL,
  character_count integer NOT NULL CHECK (character_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (novel_id, chapter_index)
);

ALTER TABLE public.novel_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novel_catalog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novel_catalog_chapters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.novel_tags, public.novel_catalog_tags, public.novel_catalog_chapters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_novel_catalog_tags(p_novel_id uuid, p_tags text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tags text[];
BEGIN
  SELECT COALESCE(array_agg(value ORDER BY first_position), ARRAY[]::text[])
  INTO v_tags
  FROM (
    SELECT first_position, value
    FROM (
      SELECT DISTINCT ON (lower(btrim(value))) ordinality AS first_position, btrim(value) AS value
      FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) WITH ORDINALITY AS input(value, ordinality)
      WHERE btrim(value) <> '' AND char_length(btrim(value)) <= 40
      ORDER BY lower(btrim(value)), ordinality
    ) AS deduplicated
    ORDER BY first_position
    LIMIT 20
  ) AS normalized;

  INSERT INTO public.novel_tags(name)
  SELECT value FROM unnest(v_tags) AS value
  ON CONFLICT (normalized_name) DO NOTHING;

  DELETE FROM public.novel_catalog_tags WHERE novel_id = p_novel_id;
  INSERT INTO public.novel_catalog_tags(novel_id, tag_id, sort_order)
  SELECT p_novel_id, tag_row.id, input.ordinality - 1
  FROM unnest(v_tags) WITH ORDINALITY AS input(value, ordinality)
  JOIN public.novel_tags AS tag_row ON tag_row.normalized_name = lower(btrim(input.value));

  UPDATE public.novel_catalog SET tags = v_tags, updated_at = now() WHERE id = p_novel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOVEL_NOT_FOUND'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_novel_catalog_chapters(p_novel_id uuid, p_chapters jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_revision integer;
BEGIN
  IF jsonb_typeof(p_chapters) <> 'array' THEN RAISE EXCEPTION 'INVALID_CHAPTERS'; END IF;
  v_count := jsonb_array_length(p_chapters);
  IF v_count < 1 OR v_count > 5000 THEN RAISE EXCEPTION 'INVALID_CHAPTER_COUNT'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_chapters) AS chapter
    WHERE char_length(btrim(COALESCE(chapter->>'title', ''))) NOT BETWEEN 1 AND 200
       OR chapter->>'content' IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_CHAPTER';
  END IF;

  DELETE FROM public.novel_catalog_chapters WHERE novel_id = p_novel_id;
  INSERT INTO public.novel_catalog_chapters(novel_id, chapter_index, title, content, character_count)
  SELECT
    p_novel_id,
    item.ordinality - 1,
    btrim(item.chapter->>'title'),
    item.chapter->>'content',
    char_length(item.chapter->>'content')
  FROM jsonb_array_elements(p_chapters) WITH ORDINALITY AS item(chapter, ordinality);

  UPDATE public.novel_catalog
  SET chapters_ready = true,
      content_revision = content_revision + 1,
      content_updated_at = now(),
      updated_at = now()
  WHERE id = p_novel_id
  RETURNING content_revision INTO v_revision;
  IF v_revision IS NULL THEN RAISE EXCEPTION 'NOVEL_NOT_FOUND'; END IF;
  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_novel_catalog_tags(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_novel_catalog_chapters(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_deleted_novel_tag_from_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_novel_catalog_tags(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_novel_catalog_chapters(uuid, jsonb) TO service_role;
