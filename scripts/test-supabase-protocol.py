#!/usr/bin/env python3
"""Run actual migrations and protocol regressions in an isolated disposable PostgreSQL."""
import pathlib, subprocess, time, uuid, concurrent.futures, json
root = pathlib.Path(__file__).resolve().parent.parent
name = 'vana-protocol-' + uuid.uuid4().hex[:12]
def sql(content):
    result = subprocess.run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
                          input=content, text=True, capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.strip()
try:
    subprocess.run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=local-test','postgres:16'],check=True,capture_output=True)
    for attempt in range(60):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode == 0: break
        time.sleep(0.5)
    sql((root/'tests/supabase/protocol.sql').read_text())
    for filename in ['202604180001_init_documents.sql','202604210001_align_documents_hierarchy.sql','202610120001_revision_sync.sql']:
        sql((root/'supabase/migrations'/filename).read_text())
    # Retrying after a failed SQL-editor run must not duplicate constraints or objects.
    sql((root/'supabase/migrations/202610120001_revision_sync.sql').read_text())
    print(sql((root/'tests/supabase/assertions.sql').read_text()))
    # Two independent DB sessions racing from the same revision: exactly one can win.
    doc_id=str(uuid.uuid4()); user='00000000-0000-0000-0000-000000000001'
    revision=int(sql(f"insert into public.documents(user_id,id) values ('{user}','{doc_id}') returning revision;").splitlines()[0])
    def race(title):
        payload=dict(id=doc_id,mutation_id=str(uuid.uuid4()),revision=revision,title=title,node_kind='document',parent_id=None,depth=0,
                     content_json=dict(type='doc',content=[]),plain_text=title,status='active',is_favorite=False,is_template=False,
                     created_at='2026-10-12T00:00:00Z',archived_at=None,deleted_at=None,tags=[],is_purged=False)
        return sql(f"set request.jwt.claim.sub='{user}'; select public.vana_push_documents('{json.dumps([payload])}'::jsonb)->>'accepted';").splitlines()[-1]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(race,['writer A','writer B']))
    assert sorted(results)==['false','true'],results
    print('PASS: concurrent independent writers cannot overwrite one another')
finally:
    subprocess.run(['docker','rm','-f',name],capture_output=True)
