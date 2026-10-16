#!/usr/bin/env bash
# Run as host root (sudo, or chroot via the existing Docker administrator).
set -euo pipefail
stage=$1
id=$2
[[ "$stage" =~ ^/tmp/vana-site-deploy\.[a-zA-Z0-9]+$ ]]
[[ "$id" =~ ^web-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{7,12}$ ]]
source_root=/opt/vana-site
base=/var/www/vana
backup="$source_root/backups/$id"
install -d -m 0755 "$source_root/releases" "$source_root/backups"
mkdir -m 0755 "$backup"
# Record all existing virtual hosts so unrelated routes can be checked after.
sha256sum /etc/nginx/sites-enabled/* > "$backup/other-sites.sha256"
previous_source=$(readlink "$source_root/current" || true)
previous_site=$(readlink "$base/current" || true)
for file in /etc/nginx/sites-available/vana /etc/systemd/system/vana-site-refresh.service /etc/systemd/system/vana-site-refresh.timer; do
    if test -e "$file"; then cp -a "$file" "$backup/$(basename "$file")"; fi
done
existing_nginx_link=$(readlink /etc/nginx/sites-enabled/vana || true)
printf '%s\n' "$previous_source" > "$backup/source-link"
printf '%s\n' "$previous_site" > "$backup/site-link"
printf '%s\n' "$existing_nginx_link" > "$backup/nginx-link"
rollback() {
    code=$?
    trap - ERR
    echo 'Deployment failed; restoring previous Vana pointers and config.' >&2
    # Releases stay on disk for inspection. Only the exact current pointers and
    # newly added configuration paths are restored/removed.
    python3 - "$backup" "$source_root" "$base" <<'PY'
import os, pathlib, shutil, sys
backup, source, base = map(pathlib.Path, sys.argv[1:])
for root, record in [(source, 'source-link'), (base, 'site-link')]:
    link = (backup / record).read_text().strip()
    current = root / 'current'
    if current.is_symlink(): current.unlink()
    if link: current.symlink_to(link)
for target in [pathlib.Path('/etc/nginx/sites-available/vana'), pathlib.Path('/etc/systemd/system/vana-site-refresh.service'), pathlib.Path('/etc/systemd/system/vana-site-refresh.timer')]:
    old = backup / target.name
    if old.exists(): shutil.copy2(old, target)
    elif target.exists(): target.unlink()
link = pathlib.Path('/etc/nginx/sites-enabled/vana')
old = (backup / 'nginx-link').read_text().strip()
if link.is_symlink(): link.unlink()
if old: link.symlink_to(old)
PY
    systemctl daemon-reload
    if test -f "$backup/vana-site-refresh.timer"; then systemctl restart vana-site-refresh.timer; else systemctl disable --now vana-site-refresh.timer || true; fi
    nginx -t && systemctl reload nginx
    exit "$code"
}
trap rollback ERR
mkdir -m 0755 "$source_root/releases/$id"
tar -xzf "$stage/source.tar.gz" -C "$source_root/releases/$id" --no-same-owner
find "$source_root/releases/$id" -type d -exec chmod 0755 {} +
find "$source_root/releases/$id" -type f -exec chmod 0644 {} +
install -d -o gellar -g gellar -m 0755 "$base" "$base/releases"
# Initial rendering was already checked using the SSH user's network access.
release_dir=$(readlink "$stage/build/current")
[[ "$release_dir" =~ ^releases/site-v[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{16}$ ]]
if ! test -d "$base/$release_dir"; then cp -a "$stage/build/$release_dir" "$base/releases/"; fi
chown -R gellar:gellar "$base/releases"
ln -s "$source_root/releases/$id" "$source_root/current-$id"
mv -Tf "$source_root/current-$id" "$source_root/current"
ln -s "$release_dir" "$base/current-$id"
mv -Tf "$base/current-$id" "$base/current"
install -m 0644 "$stage/source/deploy/nginx.conf" /etc/nginx/sites-available/vana
if ! test -e /etc/nginx/sites-enabled/vana; then ln -s /etc/nginx/sites-available/vana /etc/nginx/sites-enabled/vana; fi
install -m 0644 "$stage/source/deploy/vana-site-refresh.service" /etc/systemd/system/vana-site-refresh.service
install -m 0644 "$stage/source/deploy/vana-site-refresh.timer" /etc/systemd/system/vana-site-refresh.timer
nginx -t
systemctl daemon-reload
systemctl start vana-site-refresh.service
systemctl enable --now vana-site-refresh.timer
systemctl restart vana-site-refresh.timer
systemctl reload nginx
systemctl is-active nginx vana-site-refresh.timer
origin_ready=0
for attempt in {1..10}; do
    if curl --fail --silent --show-error --insecure --resolve vana.gellaronline.cc:443:127.0.0.1 https://vana.gellaronline.cc/ > "$backup/origin-check.html" && grep -q '<title>Vana' "$backup/origin-check.html"; then
        origin_ready=1
        break
    fi
    # nginx reload returns before its new worker generation accepts requests.
    sleep 1
done
test "$origin_ready" = 1
# Exclude only our own site if updating an existing Vana deployment.
python3 - "$backup/other-sites.sha256" <<'PY'
import hashlib, pathlib, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    expected, file = line.split('  ', 1)
    if file == '/etc/nginx/sites-enabled/vana': continue
    actual = hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()
    if actual != expected: raise SystemExit('Unrelated Nginx virtual host changed: ' + file)
print('PASS: unrelated Nginx virtual hosts unchanged')
PY
trap - ERR
printf 'Vana deployed: %s\nBackup: %s\n' "$id" "$backup"
