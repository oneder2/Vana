#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover -s website -p 'test_*.py'
node --check website/site.js
id="web-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
local_stage=$(mktemp -d /tmp/vana-site-local.XXXXXXXX)
remote_stage=$(ssh -o BatchMode=yes Gellar 'mktemp -d /tmp/vana-site-deploy.XXXXXXXX')
[[ "$remote_stage" =~ ^/tmp/vana-site-deploy\.[a-zA-Z0-9]{8}$ ]]
tar -czf "$local_stage/source.tar.gz" -C website index.template.html style.css site.js build.py assets deploy
scp "$local_stage/source.tar.gz" "Gellar:$remote_stage/source.tar.gz"
ssh -o BatchMode=yes Gellar "bash -s -- '$remote_stage' '$id'" <<'REMOTE'
set -euo pipefail
stage=$1
id=$2
mkdir "$stage/source"
tar -xzf "$stage/source.tar.gz" -C "$stage/source"
python3 "$stage/source/build.py" --base "$stage/build"
if sudo -n true 2>/dev/null; then
    sudo bash "$stage/source/deploy/install-host.sh" "$stage" "$id"
else
    # Gellar already has Docker administration rights. The transient helper
    # runs the exact host installer; no password or privileged service is added.
    docker run --rm --network host --pid host -v /:/host alpine:3.20 \
        chroot /host /bin/bash "$stage/source/deploy/install-host.sh" "$stage" "$id"
fi
REMOTE
printf 'Published source: %s\n' "$id"
