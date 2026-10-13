-- Protocol v2: authenticated, atomic conditional writes; immutable paged pull snapshots.
create sequence if not exists public.vana_revision_seq;
alter table public.documents add column if not exists revision bigint not null default nextval('public.vana_revision_seq');
alter table public.documents add column if not exists last_mutation_id uuid;
alter table public.documents add column if not exists is_purged boolean not null default false;

-- Early clients wrote JSONB strings. Refuse malformed legacy data rather than discard it.
update public.documents set content_json = (content_json #>> '{}')::jsonb
where jsonb_typeof(content_json) = 'string';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.documents'::regclass and conname='documents_content_object') then
    alter table public.documents add constraint documents_content_object
      check (jsonb_typeof(content_json) = 'object' and coalesce(content_json->>'type' = 'doc',false)
        and coalesce(jsonb_typeof(content_json->'content') = 'array',false));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.documents'::regclass and conname='documents_kind') then
    alter table public.documents add constraint documents_kind check (node_kind in ('document','folder'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.documents'::regclass and conname='documents_depth') then
    alter table public.documents add constraint documents_depth check (depth between 0 and 7);
  end if;
end $$;

-- Old direct upsert/PATCH clients must fail instead of bypassing revision checks.
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;
revoke insert, update, delete on public.documents from authenticated, anon;
grant select on public.documents to authenticated;

create or replace function public.vana_push_documents(changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  current_row public.documents%rowtype;
  conflicts jsonb := '[]'::jsonb;
  result_rows jsonb;
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 5000 then
    raise exception 'invalid changes';
  end if;
  -- Serialize tree mutations by account, including simultaneous requests on different nodes.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if (select count(*) from jsonb_array_elements(changes)) <>
     (select count(distinct value->>'id') from jsonb_array_elements(changes)) then
    raise exception 'duplicate document IDs';
  end if;
  for item in select value from jsonb_array_elements(changes) loop
    if jsonb_typeof(item) <> 'object' or item->>'id' is null or item->>'mutation_id' is null
      or coalesce(jsonb_typeof(item->'revision') <> 'number',true)
      or coalesce((item->>'revision')::bigint < 0,true) then raise exception 'missing mutation identity or revision'; end if;
    select * into current_row from public.documents where user_id = owner_id and id = (item->>'id')::uuid;
    if found then
      if current_row.last_mutation_id = (item->>'mutation_id')::uuid then continue; end if;
      if current_row.revision <> (item->>'revision')::bigint or current_row.is_purged then
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
      end if;
    elsif (item->>'revision')::bigint <> 0 then
      raise exception 'document with nonzero base revision is missing';
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object('accepted', false, 'documents', conflicts);
  end if;
  for item in select value from jsonb_array_elements(changes) loop
    if exists (select 1 from public.documents where user_id = owner_id and id = (item->>'id')::uuid
      and last_mutation_id = (item->>'mutation_id')::uuid) then continue; end if;
    if coalesce(jsonb_typeof(item->'content_json') <> 'object',true) or coalesce(item->'content_json'->>'type' <> 'doc',true)
      or coalesce(jsonb_typeof(item->'content_json'->'content') <> 'array',true) or octet_length((item->'content_json')::text) > 524288 then
      raise exception 'invalid document content';
    end if;
    if coalesce((item->>'is_purged')::boolean,false) and
      (item->>'status' <> 'trashed' or item->>'parent_id' is not null or item->>'title' <> ''
        or item->>'plain_text' <> '' or item->'content_json' <> '{"type":"doc","content":[]}'::jsonb) then
      raise exception 'purged documents must contain only a tombstone';
    end if;
    insert into public.documents(user_id,id,title,node_kind,parent_id,depth,content_json,plain_text,status,
      is_favorite,is_template,created_at,updated_at,archived_at,deleted_at,tags,revision,last_mutation_id,is_purged)
    values(owner_id,(item->>'id')::uuid,item->>'title',item->>'node_kind',nullif(item->>'parent_id','')::uuid,
      (item->>'depth')::int,item->'content_json',item->>'plain_text',item->>'status',
      (item->>'is_favorite')::boolean,(item->>'is_template')::boolean,(item->>'created_at')::timestamptz,
      clock_timestamp(),nullif(item->>'archived_at','')::timestamptz,nullif(item->>'deleted_at','')::timestamptz,
      array(select jsonb_array_elements_text(item->'tags')),nextval('public.vana_revision_seq'),
      (item->>'mutation_id')::uuid,coalesce((item->>'is_purged')::boolean,false))
    on conflict(user_id,id) do update set title=excluded.title,node_kind=excluded.node_kind,parent_id=excluded.parent_id,
      depth=excluded.depth,content_json=excluded.content_json,plain_text=excluded.plain_text,status=excluded.status,
      is_favorite=excluded.is_favorite,is_template=excluded.is_template,updated_at=excluded.updated_at,
      archived_at=excluded.archived_at,deleted_at=excluded.deleted_at,tags=excluded.tags,
      revision=excluded.revision,last_mutation_id=excluded.last_mutation_id,is_purged=excluded.is_purged;
  end loop;
  -- Valid parent, matching state/depth, bounded tree => cycles and orphans are impossible.
  if exists(select 1 from public.documents d left join public.documents p on p.user_id=d.user_id and p.id=d.parent_id
    where d.user_id=owner_id and not d.is_purged and
      ((d.parent_id is null and d.depth <> 0) or (d.parent_id is not null and
        (p.id is null or p.is_purged or p.node_kind <> 'folder' or d.depth <> p.depth+1 or d.status <> p.status)))) then
    raise exception 'invalid document hierarchy';
  end if;
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into result_rows from public.documents d
    where d.user_id=owner_id and d.id in (select (value->>'id')::uuid from jsonb_array_elements(changes));
  return jsonb_build_object('accepted', true, 'documents', result_rows);
end $$;
revoke all on function public.vana_push_documents(jsonb) from public;
grant execute on function public.vana_push_documents(jsonb) to authenticated;

create table if not exists public.vana_pull_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  documents jsonb not null
);
alter table public.vana_pull_snapshots enable row level security;
revoke all on public.vana_pull_snapshots from authenticated, anon;

create or replace function public.vana_open_pull_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); snapshot_id uuid; rows_json jsonb;
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 1));
  delete from public.vana_pull_snapshots where created_at < now()-interval '10 minutes';
  if (select count(*) from public.vana_pull_snapshots where user_id=owner_id) >= 4 then
    raise exception 'too many active sync snapshots; retry in ten minutes';
  end if;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb) into rows_json
    from public.documents d where user_id=owner_id;
  insert into public.vana_pull_snapshots(user_id,documents) values(owner_id,rows_json) returning id into snapshot_id;
  return jsonb_build_object('snapshot_id',snapshot_id,'total',jsonb_array_length(rows_json));
end $$;
create or replace function public.vana_pull_snapshot_page(snapshot_id uuid, page_offset integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rows_json jsonb;
begin
  if auth.uid() is null or page_offset < 0 then raise exception 'invalid request'; end if;
  select documents into rows_json from public.vana_pull_snapshots where id=snapshot_id and user_id=auth.uid()
    and created_at >= now()-interval '10 minutes';
  if not found then raise exception 'snapshot missing or expired'; end if;
  return (select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
    from jsonb_array_elements(rows_json) with ordinality as t(value,ord)
    where ord > page_offset and ord <= page_offset+500);
end $$;
create or replace function public.vana_close_pull_snapshot(snapshot_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.vana_pull_snapshots where id=snapshot_id and user_id=auth.uid();
$$;
revoke all on function public.vana_open_pull_snapshot() from public;
revoke all on function public.vana_pull_snapshot_page(uuid,integer) from public;
revoke all on function public.vana_close_pull_snapshot(uuid) from public;
grant execute on function public.vana_open_pull_snapshot(), public.vana_pull_snapshot_page(uuid,integer),
  public.vana_close_pull_snapshot(uuid) to authenticated;
