alter table if exists public.documents
  add column if not exists node_kind text not null default 'document';

alter table if exists public.documents
  add column if not exists parent_id uuid;

alter table if exists public.documents
  add column if not exists depth integer not null default 0;

update public.documents
set node_kind = 'document'
where node_kind is null or node_kind = '';

update public.documents
set depth = 0
where depth is null;

create index if not exists documents_user_parent_idx
  on public.documents (user_id, parent_id);

create index if not exists documents_user_depth_idx
  on public.documents (user_id, depth);
