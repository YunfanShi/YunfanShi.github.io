begin;
insert into public.site_articles (slug,title,body,visibility,published) values
('verification-public-20260926','Verification public','# Hello','public',true),
('verification-login-20260926','Verification private','PRIVATE BODY','login',true),
('verification-draft-20260926','Verification draft','DRAFT BODY','public',false);
set local role anon;
do $$ begin
 if (select count(*) from public.site_articles where slug like 'verification-%-20260926') <> 1 then raise exception 'Anonymous visibility failed'; end if;
 if has_table_privilege('anon','public.site_articles','INSERT') or has_table_privilege('anon','public.site_share_links','SELECT') then raise exception 'Anonymous grants failed'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
do $$ begin
 if (select count(*) from public.site_articles where slug like 'verification-%-20260926') <> 2 then raise exception 'Signed-in visibility failed'; end if;
 if has_table_privilege('authenticated','public.site_articles','UPDATE') then raise exception 'User write grants failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.site_articles where slug like 'verification-%-20260926') <> 1 then raise exception 'Anonymous account visibility failed'; end if;
end $$;
reset role;
rollback;
