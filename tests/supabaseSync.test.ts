import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeSupabaseSync, remoteDocumentToLocal, localDocumentToRemote, verifySupabaseConnection, importSupabaseSession } from '../src/lib/supabaseSync';
import type { AppState, SupabaseSession, SyncDocumentRecord, SyncExport, SyncSnapshot } from '../src/lib/api';

const config = { url: 'https://example.supabase.co', anon_key: 'test-key' };
const session: SupabaseSession = {access_token:'test-token',user_id:'00000000-0000-0000-0000-000000000001',refresh_token:null,expires_at:null,token_type:'bearer',email:null};
const state = {account_scope:'account-A', account_user_id:session.user_id, supabase:config} as AppState;
function remote(index = 0) {
  return {id:`00000000-0000-0000-0000-${String(index).padStart(12,'0')}`, revision:index+1,
    title:`doc ${index}`,node_kind:'document',parent_id:null,depth:0,content_json:{type:'doc',content:[]},plain_text:'body',
    status:'active',is_favorite:false,is_template:false,created_at:'2026-10-12T00:00:00Z',updated_at:'2026-10-12T00:00:00Z',
    archived_at:null,deleted_at:null,tags:[],is_purged:false,last_mutation_id:'00000000-0000-0000-0000-000000099999'};
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}});
function fixture(count = 0) {
  const calls: string[] = [], finalizations: { success: boolean; error?: string | null; ids: number[] }[] = [];
  let current = state, applied: SyncDocumentRecord[] = [], pending: SyncExport = {account_scope:state.account_scope,documents:[],pending_job_ids:[],last_pulled_at:null};
  const deps = {
    getConfig: async () => config, getState: async () => current, ensureSession: async () => session,
    flushDrafts: async () => {}, exportDocuments: async () => pending,
    apply: async (docs: SyncDocumentRecord[]) => {applied=docs; return {applied:docs.length,conflict_copies:0};},
    finalize: async (ids: number[], scope: string, success: boolean, error?: string | null) => {
      assert.equal(scope,state.account_scope); finalizations.push({ids,success,error});
      return {mode:'self-hosted',pending_jobs:success ? 0 : pending.pending_job_ids.length,last_error:error ?? null} as SyncSnapshot;
    },
    request: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);calls.push(url);
      assert.equal(init?.method, 'POST');
      if (url.endsWith('vana_open_pull_snapshot')) return response({snapshot_id:'snapshot',total:count});
      if (url.endsWith('vana_pull_snapshot_page')) {
        const offset = JSON.parse(String(init?.body)).page_offset;
        return response(Array.from({length:Math.min(500,count-offset)},(_,i)=>remote(offset+i)));
      }
      if (url.endsWith('vana_push_documents')) {
        return response({accepted:true, documents:pending.documents.map((d,i)=>({...remote(i),id:d.id}))});
      }
      return response(null);
    }) as typeof fetch,
  };
  return {deps,calls,finalizations,setState:(value:AppState)=>{current=value;},setPending:(value:SyncExport)=>{pending=value;},getApplied:()=>applied};
}

test('pulls a stable 1201-document snapshot in pages and never PATCHes local hierarchy', async () => {
  const f=fixture(1201);await executeSupabaseSync(f.deps);
  assert.equal(f.getApplied().length,1201);
  assert.equal(f.calls.filter(url=>url.endsWith('vana_pull_snapshot_page')).length,3);
  assert.equal(f.finalizations.at(-1)?.success,true);
  assert.ok(f.calls.every(url=>url.includes('/rpc/')));
});
test('HTTP failures reject and record failure without acknowledging queued changes', async () => {
  const f=fixture();f.deps.request=async()=>new Response('permission denied',{status:403});
  await assert.rejects(executeSupabaseSync(f.deps),/permission denied/);
  assert.equal(f.finalizations.at(-1)?.success,false);
});
test('network and truncated pagination failures never mark synchronization successful', async () => {
  for (const network of [true,false]) {
    const f=fixture(1001);const original=f.deps.request;
    f.deps.request=async(input,init)=>{
      if (String(input).endsWith('vana_pull_snapshot_page')) {if(network)throw new Error('offline');return response([]);}
      return original(input,init);
    };
    await assert.rejects(executeSupabaseSync(f.deps),network ? /offline/ : /分页不完整/);
    assert.equal(f.getApplied().length,0);assert.equal(f.finalizations.at(-1)?.success,false);
  }
});
test('switching accounts during the network request cannot apply old account documents', async () => {
  const f=fixture(1);const original=f.deps.request;
  f.deps.request=async(input,init)=>{const result=await original(input,init);f.setState({...state,account_scope:'account-B'});return result;};
  await assert.rejects(executeSupabaseSync(f.deps),/账号空间已切换/);
  assert.equal(f.getApplied().length,0);
});
test('session and project must match the captured space before any network request', async()=>{
  const f=fixture();f.setState({...state,account_user_id:'different-user'});
  await assert.rejects(executeSupabaseSync(f.deps),/登录验证期间已切换/);assert.equal(f.calls.length,0);
});
test('concurrent cloud rejection retains outbox and rejects success UI', async()=>{
  const f=fixture(); const doc=remoteDocumentToLocal(remote(1));
  f.setPending({account_scope:state.account_scope,documents:[doc],pending_job_ids:[7],last_pulled_at:null});
  const original=f.deps.request;
  f.deps.request=async(input,init)=>String(input).endsWith('vana_push_documents')?response({accepted:false,documents:[remote(1)]}):original(input,init);
  await assert.rejects(executeSupabaseSync(f.deps),/并发修改/);
  assert.deepEqual(f.finalizations.at(-1)?.ids,[7]);assert.equal(f.finalizations.at(-1)?.success,false);
});
test('JSONB contract accepts objects and legacy strings and rejects malformed content',()=>{
  const record=remote(1);
  assert.deepEqual(JSON.parse(remoteDocumentToLocal(record).content_json),record.content_json);
  assert.deepEqual(JSON.parse(remoteDocumentToLocal({...record,content_json:JSON.stringify(record.content_json)}).content_json),record.content_json);
  assert.deepEqual(localDocumentToRemote(remoteDocumentToLocal(record)).content_json,record.content_json);
  for (const content of ['[object Object]',{},null,[],{type:'doc'}, {type:'paragraph',content:[]}]) {
    assert.throws(()=>remoteDocumentToLocal({...record,content_json:content}));
  }
});
test('logged-out connection check reports reachable, and invalid imported session is never persisted', async()=>{
  let saves=0;const originalFetch=globalThis.fetch;
  const native=(globalThis as unknown as {window:unknown});
  native.window={__TAURI_INTERNALS__:{invoke:async(command:string)=>{
    if(command==='get_supabase_config_command')return config;
    if(command==='get_supabase_session_command')return null;
    if(command==='save_supabase_session_command'){saves++;return session;}
    throw new Error(`unexpected native command ${command}`);
  }}};
  try {
    globalThis.fetch=async(input)=>String(input).endsWith('/settings')?response({}):new Response('invalid token',{status:401});
    assert.deepEqual(await verifySupabaseConnection(),{reachable:true,authenticated:false,message:'连接成功，当前未登录。'});
    await assert.rejects(importSupabaseSession(JSON.stringify(session)),/会话验证失败/);
    assert.equal(saves,0);
    globalThis.fetch=async()=>response({id:'not-a-valid-id'});
    await assert.rejects(importSupabaseSession(JSON.stringify(session)),/用户 ID 无效/);
    assert.equal(saves,0);
  } finally {globalThis.fetch=originalFetch;delete (native as {window?:unknown}).window;}
});
