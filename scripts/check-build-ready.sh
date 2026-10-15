#!/usr/bin/env bash
# Local release-candidate gate. Native device/signing acceptance is separate.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --hosted ) ]]; then
    echo 'Usage: bash scripts/check-build-ready.sh [--hosted]' >&2
    exit 2
fi
python3 - <<'PY'
import json, pathlib, re, subprocess, tomllib
root = pathlib.Path.cwd()
npm = json.loads((root / 'package.json').read_text())
lock = json.loads((root / 'package-lock.json').read_text())
cargo = tomllib.loads((root / 'src-tauri/Cargo.toml').read_text())
cargo_lock = tomllib.loads((root / 'src-tauri/Cargo.lock').read_text())
tauri = json.loads((root / 'src-tauri/tauri.conf.json').read_text())
versions = [npm['version'], lock['version'], lock['packages']['']['version'],
            cargo['package']['version'], tauri['version']]
versions += [p['version'] for p in cargo_lock['package'] if p['name'] == cargo['package']['name']]
assert len(versions) == 6 and len(set(versions)) == 1, 'Version and lockfile mismatch'
tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
for name in filter(None, tracked):
    p = pathlib.PurePosixPath(name)
    assert not (p.parts[0] == 'secrets' or (p.name.startswith('.env') and p.name != '.env.example') or p.name == 'keystore.properties'
                or p.suffix.lower() in ('.jks', '.keystore', '.pfx', '.p12')), 'Private file tracked: ' + name
    path = root / name
    if path.is_file() and path.stat().st_size < 2_000_000:
        content = path.read_bytes()
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content), 'Private key tracked: ' + name
print('PASS: source/lockfile versions agree; tracked-file secret checks (' + versions[0] + ')')
PY
npm run typecheck
npm test
CARGO_TARGET_DIR="${VANA_NATIVE_TEST_TARGET:-tests/native-core/target}" cargo test -j 2 --locked --manifest-path tests/native-core/Cargo.toml
python3 scripts/test-supabase-protocol.py
npm run build
cargo check -j 2 --locked --manifest-path src-tauri/Cargo.toml
python3 scripts/check-app-icons.py
python3 -m unittest discover -s website -p 'test_*.py'
node --check website/site.js
node --check website/effects.js
bash -n website/deploy.sh website/deploy/install-host.sh
npm audit --omit=dev --audit-level=moderate
if [[ "${1:-}" == --hosted ]]; then
    python3 scripts/check-supabase-release.py --require-protocol
fi
echo 'PASS: automated candidate checks. Check the release report for platform/signing/device evidence.'
