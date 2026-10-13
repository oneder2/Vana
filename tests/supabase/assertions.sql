\set ON_ERROR_STOP on
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
create function pg_temp.doc(id uuid, revision bigint, title text, parent uuid default null, depth int default 0, kind text default 'document')
returns jsonb language sql as $$ select jsonb_build_object('id',id,'mutation_id',gen_random_uuid(),'revision',revision,
  'title',title,'node_kind',kind,'parent_id',parent,'depth',depth,'content_json','{"type":"doc","content":[]}'::jsonb,
  'plain_text',title,'status','active','is_favorite',false,'is_template',false,'created_at',now(),
  'archived_at',null,'deleted_at',null,'tags','[]'::jsonb,'is_purged',false); $$;

do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r bigint; payload jsonb; result jsonb; snap jsonb; total int; caught bool;
begin
  payload:=pg_temp.doc(a,0,'original');
  result:=public.vana_push_documents(jsonb_build_array(payload));
  assert (result->>'accepted')::boolean;
  r:=(result->'documents'->0->>'revision')::bigint;
  -- Retry after lost acknowledgement is idempotent.
  result:=public.vana_push_documents(jsonb_build_array(payload));
  assert (result->'documents'->0->>'revision')::bigint=r;
  result:=public.vana_push_documents(jsonb_build_array(pg_temp.doc(a,0,'stale'),pg_temp.doc(b,0,'new')));
  assert not (result->>'accepted')::boolean;
  assert not exists(select from public.documents where id=b);
  assert (select title from public.documents where id=a)='original';
  -- Missing revision cannot bypass CAS.
  caught:=false;
  begin perform public.vana_push_documents(jsonb_build_array(pg_temp.doc(a,r,'bad')-'revision'));
  exception when others then caught:=true; end;
  assert caught;
  caught:=false;
  begin perform public.vana_push_documents(jsonb_build_array(jsonb_set(pg_temp.doc(a,r,'bad'),'{content_json}','{"content":[]}'::jsonb)));
  exception when others then caught:=true; end;
  assert caught;
  -- Invalid subtree changes roll back the whole batch.
  caught:=false;
  begin perform public.vana_push_documents(jsonb_build_array(pg_temp.doc(a,r,'partly changed'),pg_temp.doc(b,0,'orphan',gen_random_uuid(),1)));
  exception when others then caught:=true; end;
  assert caught; assert (select title from public.documents where id=a)='original';
  -- More than the PostgREST default cap, using fixed snapshots.
  insert into public.documents(user_id,id,title) select auth.uid(),gen_random_uuid(),'row '||n from generate_series(1,1200) n;
  snap:=public.vana_open_pull_snapshot();total:=(snap->>'total')::int; assert total=1201;
  assert jsonb_array_length(public.vana_pull_snapshot_page((snap->>'snapshot_id')::uuid,0))=500;
  update public.documents set title='changed during pagination',revision=nextval('public.vana_revision_seq') where id=a;
  assert jsonb_array_length(public.vana_pull_snapshot_page((snap->>'snapshot_id')::uuid,500))=500;
  assert jsonb_array_length(public.vana_pull_snapshot_page((snap->>'snapshot_id')::uuid,1000))=201;
  assert (select value->>'title' from public.vana_pull_snapshots s,jsonb_array_elements(s.documents) where s.id=(snap->>'snapshot_id')::uuid and value->>'id'=a::text)='original';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  caught:=false;
  begin perform public.vana_pull_snapshot_page((snap->>'snapshot_id')::uuid,0); exception when others then caught:=true; end;
  assert caught;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  perform public.vana_close_pull_snapshot((snap->>'snapshot_id')::uuid);
  assert not exists(select from public.vana_pull_snapshots where id=(snap->>'snapshot_id')::uuid);
end $$;

set role authenticated;
do $$
declare caught bool:=false;
begin
  assert (select count(*) from public.documents)=1201;
  begin update public.documents set title='unsafe old client'; exception when insufficient_privilege then caught:=true; end;
  assert caught;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin assert (select count(*) from public.documents)=0; end $$;
reset role;
select 'PASS: conditional writes, idempotency, atomic rollback, literal JSON, snapshot pagination, account boundaries and RLS' as result;
