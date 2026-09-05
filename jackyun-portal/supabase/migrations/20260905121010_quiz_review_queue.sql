create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_question_id uuid references public.quiz_questions(id) on delete set null,
  subject text not null default '未分类',
  question_text text not null,
  question_type text not null,
  options jsonb,
  correct_answer text not null,
  last_user_answer text,
  explanation text,
  knowledge_point text,
  error_type text not null default 'unknown'
    check (error_type in ('concept', 'calculation', 'reading', 'careless', 'expression', 'unknown')),
  status text not null default 'active'
    check (status in ('active', 'mastered', 'archived')),
  next_review_at timestamptz not null default now(),
  interval_days integer not null default 1 check (interval_days between 1 and 3650),
  ease_factor numeric(3,2) not null default 2.50 check (ease_factor between 1.30 and 3.00),
  streak integer not null default 0 check (streak between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, quiz_question_id)
);

create table public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_item_id uuid not null references public.review_items(id) on delete cascade,
  answer text,
  is_correct boolean not null,
  quality smallint not null check (quality between 0 and 5),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 21600),
  attempted_at timestamptz not null default now()
);

create index review_items_user_due_idx
  on public.review_items(user_id, status, next_review_at);
create index review_items_user_subject_idx
  on public.review_items(user_id, subject, status);
create index review_attempts_item_date_idx
  on public.review_attempts(review_item_id, attempted_at desc);

alter table public.review_items enable row level security;
alter table public.review_attempts enable row level security;

create policy "Users manage own review items" on public.review_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      quiz_question_id is null
      or exists (
        select 1
        from public.quiz_questions
        join public.quiz_sessions on quiz_sessions.id = quiz_questions.session_id
        where quiz_questions.id = review_items.quiz_question_id
          and quiz_sessions.user_id = (select auth.uid())
      )
    )
  );

create policy "Users manage own review attempts" on public.review_attempts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.review_items
      where review_items.id = review_attempts.review_item_id
        and review_items.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on table public.review_items to authenticated;
grant select, insert, update, delete on table public.review_attempts to authenticated;
