ALTER TABLE public.novel_catalog
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '未分类' CHECK (char_length(category) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.novel_catalog
  ADD CONSTRAINT novel_catalog_tags_length CHECK (cardinality(tags) <= 20);

CREATE INDEX IF NOT EXISTS novel_catalog_category_idx ON public.novel_catalog(category);
CREATE INDEX IF NOT EXISTS novel_catalog_tags_gin_idx ON public.novel_catalog USING gin(tags);
