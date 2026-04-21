create extension if not exists "pgcrypto";

create table if not exists public.documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  title text not null default 'Untitled',
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph","content":[]}]}',
  plain_text text not null default '',
  status text not null default 'active' check (status in ('active', 'archived', 'trashed')),
  is_favorite boolean not null default false,
  is_template boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  deleted_at timestamptz,
  tags text[] not null default '{}',
  primary key (user_id, id)
);

create index if not exists documents_user_updated_idx
  on public.documents (user_id, updated_at desc);

create index if not exists documents_user_status_idx
  on public.documents (user_id, status);

create index if not exists documents_tags_gin_idx
  on public.documents using gin (tags);

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
on public.documents
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
