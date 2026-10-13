#!/usr/bin/env bash
# An isolated D-Bus session and disposable keyring; never use the user's entries.
set -euo pipefail
command -v dbus-run-session >/dev/null
command -v gnome-keyring-daemon >/dev/null
task_probe_root=$(mktemp -d -t vana-keyring-probe-XXXXXXXX)
trap 'rm -rf "$task_probe_root"' EXIT
mkdir -p "$task_probe_root/data" "$task_probe_root/config" "$task_probe_root/control"
chmod 700 "$task_probe_root/data" "$task_probe_root/config" "$task_probe_root/control"
dbus-run-session -- env XDG_DATA_HOME="$task_probe_root/data" XDG_CONFIG_HOME="$task_probe_root/config" GNOME_KEYRING_CONTROL="$task_probe_root/control" bash -c '
  printf "vana-disposable-test-keyring\n" | gnome-keyring-daemon --unlock --components=secrets --control-directory="$GNOME_KEYRING_CONTROL" >/dev/null
  cargo run -j 2 --locked --manifest-path tests/native-core/Cargo.toml --example credential_probe
'
