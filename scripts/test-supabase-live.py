#!/usr/bin/env python3
"""Opt-in real Supabase acceptance with disposable users and private local credentials.

Uses admin-generated signup links without sending mail. Protocol requests use real
user JWTs, never service_role. Fixture cleanup checks ownership before deleting.
This verifies the live service; native clients and mailbox delivery are separate.
"""
import argparse
import concurrent.futures
import copy
import datetime
import json
import os
import pathlib
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


class AcceptanceError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise AcceptanceError(message)


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as file:
        json.dump(value, file, indent=2)
    path.chmod(0o600)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class Api:
    def __init__(self, config):
        self.url = config['url'].rstrip('/')
        self.anon = config['anon']
        self.admin = config['service_role']

    def request(self, path, body=None, token=None, admin=False, method=None):
        key = self.admin if admin else self.anon
        request = urllib.request.Request(
            self.url + path, method=method or ('POST' if body is not None else 'GET'),
            data=json.dumps(body).encode() if body is not None else None,
            headers={'apikey': key, 'Authorization': 'Bearer ' + (token or key),
                     'Content-Type': 'application/json'},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            try:
                value = json.loads(error.read())
                code = value.get('code') or value.get('error_code')
            except (ValueError, AttributeError):
                code = None
            return error.code, {'code': code if isinstance(code, str) and re.fullmatch(r'[\w-]+', code) else 'unknown'}
        except (urllib.error.URLError, TimeoutError):
            raise AcceptanceError('Live request failed or timed out; no automatic mutation retry') from None

    def ok(self, path, body=None, token=None, admin=False, method=None):
        status, value = self.request(path, body, token, admin, method)
        require(200 <= status < 300, f'API request rejected: HTTP {status}, code {value.get("code") if isinstance(value, dict) else "unknown"}')
        return value

    def rpc(self, name, token, body=None):
        return self.ok('/rest/v1/rpc/' + name, body or {}, token)

    def denied(self, path, body=None, token=None, method=None):
        status, _ = self.request(path, body, token, method=method)
        require(status in (400, 401, 403, 404), f'Unauthorized/invalid request was not rejected: HTTP {status}')


def password_login(api, fixture):
    session = api.ok('/auth/v1/token?grant_type=password',
                     {'email': fixture['email'], 'password': fixture['password']})
    user = api.ok('/auth/v1/user', token=session['access_token'])
    require(user['id'] == fixture['id'], 'Authenticated fixture identity mismatch')
    return session


def provision(api, path):
    require(not path.exists(), 'Fixture manifest already exists; reuse or clean up explicitly')
    run_id = uuid.uuid4().hex
    state = {'run_id': run_id, 'url': api.url, 'created_at': now(), 'users': [], 'checks': []}
    private_json(path, state)
    for label in ['A', 'B']:
        fixture = {'label': label, 'email': f'vana-acceptance-{run_id}-{label.lower()}@example.com',
                   'password': secrets.token_urlsafe(32)}
        state['users'].append(fixture)
        private_json(path, state)
        link = api.ok('/auth/v1/admin/generate_link', {
            'type': 'signup', 'email': fixture['email'], 'password': fixture['password'],
            'data': {'vana_acceptance_run': run_id},
        }, admin=True)
        fixture['id'] = link.get('id') or link.get('user', {}).get('id')
        require(fixture['id'], 'Signup link did not return a fixture identity')
        private_json(path, state)
        status, _ = api.request('/auth/v1/token?grant_type=password',
                                {'email': fixture['email'], 'password': fixture['password']})
        require(status == 400, 'Unconfirmed account could log in before signup verification')
        confirmation = api.ok('/auth/v1/verify', {'token_hash': link['hashed_token'], 'type': 'signup'})
        require(confirmation['user']['id'] == fixture['id'], 'Signup confirmation identity mismatch')
        require(confirmation['user'].get('email_confirmed_at'), 'Signup link did not confirm email')
        session = password_login(api, fixture)
        refreshed = api.ok('/auth/v1/token?grant_type=refresh_token', {'refresh_token': session['refresh_token']})
        require(refreshed['user']['id'] == fixture['id'], 'Refresh identity mismatch')
        api.ok('/auth/v1/logout?scope=local', {}, refreshed['access_token'])
        status, _ = api.request('/auth/v1/token?grant_type=refresh_token', {'refresh_token': refreshed['refresh_token']})
        require(status == 400, 'Logged-out refresh session remained usable')
        fixture['confirmed'] = True
        private_json(path, state)
        print('PASS: fixture', label, 'signup link confirmation, password login, refresh and logout')
    return state


def fixture_owned(api, state, fixture):
    require(fixture.get('id'), 'Fixture lacks recorded identity; no automatic deletion')
    user = api.ok('/auth/v1/admin/users/' + fixture['id'], admin=True)
    require(user.get('email') == fixture['email'] and
            user.get('user_metadata', {}).get('vana_acceptance_run') == state['run_id'],
            'Fixture ownership marker mismatch; refusing mutation')


def document(identifier=None, parent=None, depth=0, kind='document', text='fixture'):
    return {
        'id': identifier or str(uuid.uuid4()), 'mutation_id': str(uuid.uuid4()), 'revision': 0,
        'title': 'Vana live acceptance', 'node_kind': kind, 'parent_id': parent, 'depth': depth,
        'content_json': {'type': 'doc', 'content': [] if kind == 'folder' else [
            {'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}]},
        'plain_text': '' if kind == 'folder' else text, 'status': 'active',
        'is_favorite': False, 'is_template': False, 'created_at': now(),
        'archived_at': None, 'deleted_at': None, 'tags': [], 'is_purged': False,
    }


def change(record, **fields):
    value = copy.deepcopy(record)
    value['mutation_id'] = str(uuid.uuid4())
    value.update(fields)
    return value


def run(api, state, path):
    require(not state.get('protocol_complete'), 'Protocol already ran; create new fixtures for a fresh run')
    require(len(state['users']) == 2, 'Two provisioned fixtures required')
    for fixture in state['users']:
        fixture_owned(api, state, fixture)
    sessions = []
    snapshots = []
    def check(name):
        state['checks'].append(name)
        private_json(path, state)
        print('PASS:', name)
    def push(changes, token=None, accepted=True):
        token = token or a
        result = api.rpc('vana_push_documents', token, {'changes': changes})
        require(result.get('accepted') is accepted, 'Unexpected CAS result')
        if accepted:
            require(len(result['documents']) == len(changes), 'Incomplete mutation acknowledgement')
        return {row['id']: row for row in result['documents']}
    def open_snapshot(token=None):
        token = token or a
        value = api.rpc('vana_open_pull_snapshot', token)
        snapshots.append((token, value['snapshot_id']))
        return value
    def close_snapshot(snapshot, token=None):
        token = token or a
        api.rpc('vana_close_pull_snapshot', token, {'snapshot_id': snapshot['snapshot_id']})
        snapshots.remove((token, snapshot['snapshot_id']))
    def pull(token=None):
        token = token or a
        snapshot = open_snapshot(token)
        rows = []
        for offset in range(0, snapshot['total'], 500):
            page = api.rpc('vana_pull_snapshot_page', token, {'snapshot_id': snapshot['snapshot_id'], 'page_offset': offset})
            require(len(page) == min(500, snapshot['total'] - offset), 'Incomplete live snapshot pagination')
            rows.extend(page)
        close_snapshot(snapshot, token)
        require(len({row['id'] for row in rows}) == len(rows), 'Duplicate live snapshot IDs')
        return {row['id']: row for row in rows}
    try:
        for user in state['users']:
            sessions.append(password_login(api, user))
        a, b = [session['access_token'] for session in sessions]
        second_session = password_login(api, state['users'][0])
        sessions.append(second_session)
        client_two = second_session['access_token']
        require(not pull(a) and not pull(b), 'Disposable accounts must be empty before protocol tests')
        folders = []
        for depth in range(3):
            folders.append(document(parent=folders[-1]['id'] if folders else None, depth=depth, kind='folder'))
        records = folders + [document(parent=folders[-1]['id'], depth=3, text=f'fixture-{i}') for i in range(1198)]
        state['fixture_document_ids'] = [row['id'] for row in records]
        private_json(path, state)
        baseline = push(records)
        require(len(baseline) == 1201 and all(row['revision'] > 0 for row in baseline.values()), 'Initial live upload incomplete')
        check('1201 records including a three-level folder tree uploaded through real user RPC')

        retry = push(records, client_two)
        require({i: row['revision'] for i, row in retry.items()} == {i: row['revision'] for i, row in baseline.items()}, 'Lost-ack retry changed revisions')
        check('lost upload acknowledgement is idempotent from a second authenticated client')
        target_id = records[-1]['id']
        snapshot = open_snapshot()
        require(snapshot['total'] == 1201, 'Live snapshot count mismatch')
        changed = push([change(baseline[target_id], title='changed during pagination')])[target_id]
        rows = []
        for offset, count in [(0, 500), (500, 500), (1000, 201)]:
            page = api.rpc('vana_pull_snapshot_page', a, {'snapshot_id': snapshot['snapshot_id'], 'page_offset': offset})
            require(len(page) == count, 'Live pages capped or truncated')
            rows.extend(page)
        require(len({row['id'] for row in rows}) == 1201, 'Live pages overlap')
        require(next(row for row in rows if row['id'] == target_id)['title'] == baseline[target_id]['title'], 'Snapshot changed during pagination')
        api.denied('/rest/v1/rpc/vana_pull_snapshot_page', {'snapshot_id': snapshot['snapshot_id'], 'page_offset': 0}, b)
        api.rpc('vana_close_pull_snapshot', b, {'snapshot_id': snapshot['snapshot_id']})
        require(len(api.rpc('vana_pull_snapshot_page', a, {'snapshot_id': snapshot['snapshot_id'], 'page_offset': 0})) == 500, 'Other account closed owner snapshot')
        close_snapshot(snapshot)
        check('immutable 500/500/201 paging and snapshot ownership across real JWTs')

        require(not pull(b), 'Account B can see A documents')
        isolated = api.ok('/rest/v1/documents?select=id&user_id=eq.' + state['users'][0]['id'], token=b)
        require(isolated == [], 'Direct table read bypassed RLS')
        for method, endpoint, payload in [
            ('POST', '/rest/v1/documents', {'id': str(uuid.uuid4()), 'user_id': state['users'][0]['id'],
                                          'title': 'legacy insert', 'content_json': {'type': 'doc', 'content': []}}),
            ('PATCH', '/rest/v1/documents?id=eq.' + target_id, {'title': 'legacy patch'}),
            ('DELETE', '/rest/v1/documents?id=eq.' + target_id, None),
        ]:
            status, error = api.request(endpoint, payload, a, method=method)
            require(status in (401, 403) and error.get('code') == '42501',
                    'Legacy table write did not fail specifically with insufficient privilege')
        api.denied('/rest/v1/rpc/vana_open_pull_snapshot', {})
        api.denied('/rest/v1/rpc/vana_push_documents', {'changes': []})
        check('RLS account isolation, anonymous RPC denial and legacy direct writes blocked')

        mixed_new = document()
        push([change(baseline[target_id], title='stale offline edit'), mixed_new], accepted=False)
        require(mixed_new['id'] not in pull(), 'Rejected CAS batch partially inserted')
        broken = document(parent=str(uuid.uuid4()), depth=1)
        api.denied('/rest/v1/rpc/vana_push_documents', {'changes': [change(changed, title='must roll back'), broken]}, a)
        require(pull()[target_id]['title'] == changed['title'], 'Invalid hierarchy batch partially wrote')
        check('stale and malformed batches roll back atomically')

        def race(title):
            return api.rpc('vana_push_documents', a if title == 'writer A' else client_two,
                           {'changes': [change(changed, title=title)]})
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(race, ['writer A', 'writer B']))
        require(sorted(result['accepted'] for result in outcomes) == [False, True], 'Concurrent writers both overwrote the same revision')
        winner = next(result['documents'][0] for result in outcomes if result['accepted'])
        loser = next(result for result in outcomes if not result['accepted'])
        require(loser['documents'][0]['revision'] == winner['revision'], 'Conflict did not return the winning revision')
        check('two independent real authenticated sessions race: exactly one write wins')

        # Conflicting offline moves of an entire subtree must not leave any orphan.
        tree = pull()
        branch = [tree[record['id']] for record in records if record['id'] != folders[0]['id']]
        moved = [change(row, parent_id=None if row['id'] == folders[1]['id'] else row['parent_id'], depth=row['depth'] - 1) for row in branch]
        push(moved)
        push([change(row, title='stale subtree move') for row in branch], client_two, accepted=False)
        latest = pull()
        require(latest[folders[1]['id']]['parent_id'] is None and latest[target_id]['depth'] == 2, 'Subtree move did not retain coherent depths')
        check('offline concurrent subtree moves preserve an atomic coherent tree')

        deletion = [change(latest[row['id']], status='trashed', deleted_at=now()) for row in branch]
        deleted = push(deletion)
        push([change(latest[target_id], title='edit after remote deletion')], client_two, accepted=False)
        require(pull()[target_id]['status'] == 'trashed', 'Stale edit resurrected a deleted subtree')
        check('subtree deletion rejects stale edits without resurrection')

        tombstone = change(deleted[target_id], parent_id=None, depth=0, title='', plain_text='',
                           content_json={'type': 'doc', 'content': []}, is_purged=True)
        purged = push([tombstone])[target_id]
        require(purged['is_purged'], 'Permanent-delete tombstone not stored')
        push([change(purged, title='resurrect purge')], client_two, accepted=False)
        check('purge tombstones cannot be resurrected by a new mutation')

        # Same UUID is allowed in another account, without exposing/modifying owner A.
        other = document(identifier=target_id, text='account B fixture')
        other_row = push([other], b)[target_id]
        require(other_row['user_id'] == state['users'][1]['id'], 'RPC trusted another owner identity')
        require(pull(a)[target_id]['is_purged'], 'Account B changed account A tombstone')
        require(len(pull(b)) == 1, 'Account B snapshot not isolated')
        check('same document UUID in separate account spaces remains isolated')
        state['protocol_complete'] = now()
        private_json(path, state)
    finally:
        for token, snapshot_id in snapshots:
            try:
                api.rpc('vana_close_pull_snapshot', token, {'snapshot_id': snapshot_id})
            except AcceptanceError:
                pass
        for session in sessions:
            try:
                api.ok('/auth/v1/logout?scope=local', {}, session['access_token'])
            except AcceptanceError:
                pass


def cleanup(api, state, path):
    for fixture in state['users']:
        require(fixture.get('id'), 'Fixture lacks recorded identity; no automatic deletion')
        status, _ = api.request('/auth/v1/admin/users/' + fixture['id'], admin=True)
        if status == 404:
            fixture['deleted_at'] = fixture.get('deleted_at') or now()
            private_json(path, state)
            print('PASS: fixture', fixture['label'], 'absence verified')
            continue
        fixture_owned(api, state, fixture)
        api.ok('/auth/v1/admin/users/' + fixture['id'], admin=True, method='DELETE')
        status, _ = api.request('/auth/v1/admin/users/' + fixture['id'], admin=True)
        require(status == 404, 'Fixture deletion could not be verified')
        fixture['deleted_at'] = now()
        private_json(path, state)
        print('PASS: fixture', fixture['label'], 'deleted with its owned records')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['provision', 'run', 'cleanup'])
    parser.add_argument('--config', type=pathlib.Path, required=True)
    parser.add_argument('--fixtures', type=pathlib.Path, required=True)
    parser.add_argument('--expected-project-ref', required=True)
    args = parser.parse_args()
    require(re.fullmatch(r'[a-z0-9]{20}', args.expected_project_ref), 'Invalid expected project ref')
    config = json.loads(args.config.read_text())
    require(config['url'].rstrip('/') == f'https://{args.expected_project_ref}.supabase.co', 'Project does not match explicitly chosen target')
    require(args.config.stat().st_mode & 0o077 == 0, 'Private config permissions must exclude other users')
    api = Api(config)
    if args.action == 'provision':
        provision(api, args.fixtures)
    else:
        require(args.fixtures.stat().st_mode & 0o077 == 0, 'Fixture credentials must be private')
        state = json.loads(args.fixtures.read_text())
        require(state['url'] == api.url, 'Fixture project differs from selected project')
        (run if args.action == 'run' else cleanup)(api, state, args.fixtures)
    print('PASS:', args.action, 'finished; credentials, JWTs and original document data suppressed')


if __name__ == '__main__':
    try:
        main()
    except AcceptanceError as error:
        print('FAIL:', error)
        sys.exit(1)
    except (KeyError, ValueError, OSError):
        print('FAIL: invalid private configuration or API response; details suppressed')
        sys.exit(1)
