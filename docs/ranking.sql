-- みんなのランキング用テーブル（Supabase の SQL Editor に貼って Run）
-- ブラウザからできるのは「読む」と「追加する」だけ。書き換え・削除はできない（消すときは Supabase の管理画面から）
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 12),
  mech       text not null check (mech in ('flood','orch','celes','exa','miss','p5')),
  job        text not null check (job in ('pld','drk','mnk','rpr','mch','blm','ast','sch')),
  slot       text check (slot is null or slot in ('MT','ST','D1','D2','D3','D4','H1','H2')),
  score      int  not null check (score between 0 and 120),
  dps        int  not null check (dps between 0 and 100000)
);
create index if not exists scores_rank on public.scores (mech, score desc, dps desc, created_at);

alter table public.scores enable row level security;
drop policy if exists "anyone can read" on public.scores;
drop policy if exists "anyone can add" on public.scores;
create policy "anyone can read" on public.scores for select to anon, authenticated using (true);
create policy "anyone can add"  on public.scores for insert to anon, authenticated with check (true);
revoke update, delete, truncate on public.scores from anon, authenticated;
grant select, insert on public.scores to anon, authenticated;
