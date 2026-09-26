create table public.site_articles (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 title text not null check (length(title) between 1 and 160),
 body text not null default '' check (length(body) <= 200000),
 visibility text not null default 'public' check (visibility in ('public', 'login')),
 published boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.site_share_links (
 id uuid primary key default gen_random_uuid(),
 code text unique not null check (code ~ '^j-[a-f0-9]{16}$'),
 name text not null check (length(name) between 1 and 160),
 url text not null check (url ~ '^https?://' and length(url) <= 4096),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.site_articles enable row level security;
alter table public.site_share_links enable row level security;
revoke all on public.site_articles, public.site_share_links from anon, authenticated;
grant select on public.site_articles to anon, authenticated;
grant all on public.site_articles, public.site_share_links to service_role;
create policy articles_public_read on public.site_articles for select to anon, authenticated using (published and visibility = 'public');
create policy articles_login_read on public.site_articles for select to authenticated using (published and visibility = 'login' and (select auth.uid()) is not null and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');
