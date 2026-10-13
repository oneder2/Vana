#!/usr/bin/env python3
"""Read-only hosted release preflight. Never prints keys, tokens or document rows."""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-protocol', action='store_true')
    args = parser.parse_args()
    url = os.environ.get('VANA_PUBLIC_SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('VANA_PUBLIC_SUPABASE_ANON_KEY', '')
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or
            parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('A public HTTPS Supabase origin is required')
    if key.startswith('sb_publishable_'):
        pass
    else:
        parts = key.split('.')
        if len(parts) != 3:
            raise ValueError('A public anon JWT or publishable key is required')
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
        if claims.get('role') != 'anon':
            raise ValueError('Only an anon key may be embedded in release packages')
        if claims.get('ref') and parsed.hostname.endswith('.supabase.co'):
            if parsed.hostname.split('.')[0] != claims['ref']:
                raise ValueError('Public key and project URL do not match')
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    failed = False
    endpoints = [
        ('Auth health', '/auth/v1/health'),
        ('Auth settings', '/auth/v1/settings'),
        ('Document schema (zero rows)', '/rest/v1/documents?select=id,revision,last_mutation_id,is_purged,node_kind,parent_id,depth&limit=0'),
    ]
    for label, path in endpoints:
        req = urllib.request.Request(url + path, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                response.read()
                print(f'{label}: HTTP {response.status}')
        except urllib.error.HTTPError as error:
            try:
                code = json.loads(error.read()).get('code')
            except (ValueError, AttributeError):
                code = None
            # Restrict output to protocol identifiers; API messages may contain user data.
            code = code if isinstance(code, str) and code.isalnum() else 'unknown'
            print(f'{label}: HTTP {error.code}, code {code}')
            failed = True
    if failed and args.require_protocol:
        raise ValueError('Hosted release preflight failed; do not publish')
    if failed:
        print('NOT READY: service/schema preflight failed')
        return 1
    print('PASS: public configuration and schema; authenticated sync remains a separate acceptance gate')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, urllib.error.URLError, TimeoutError) as error:
        # Do not print raw exception/request objects, which can contain credentials.
        print('FAIL: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__))
        sys.exit(1)
