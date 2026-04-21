create table if not exists public.document_assets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  document_id uuid,
  local_attachment_id text,
  kind text not null default 'file' check (kind in ('file', 'image')),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  storage_bucket text,
  storage_object_path text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed', 'deleted')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  uploaded_at timestamptz,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists document_assets_user_document_idx
  on public.document_assets (user_id, document_id, updated_at desc);

create index if not exists document_assets_user_attachment_idx
  on public.document_assets (user_id, local_attachment_id);

alter table public.document_assets enable row level security;

drop policy if exists "document_assets_select_own" on public.document_assets;
create policy "document_assets_select_own"
on public.document_assets
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "document_assets_insert_own" on public.document_assets;
create policy "document_assets_insert_own"
on public.document_assets
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "document_assets_update_own" on public.document_assets;
create policy "document_assets_update_own"
on public.document_assets
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "document_assets_delete_own" on public.document_assets;
create policy "document_assets_delete_own"
on public.document_assets
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
