#!/usr/bin/env python3
"""Per-user Linux desktop installation and stable GitHub Release updates."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

REPOSITORY = 'oneder2/Vana'
API = f'https://api.github.com/repos/{REPOSITORY}/releases/latest'
MAX_PACKAGE = 512 * 1024 * 1024


def version(value):
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ValueError(f'Invalid stable version: {value}')
    return tuple(map(int, value.split('.')))


def select_release(release):
    tag = release.get('tag_name', '')
    if release.get('draft') is not False or release.get('prerelease') is not False or not tag.startswith('v'):
        raise ValueError('Only published stable releases are installed')
    number = tag[1:]
    version(number)
    if release.get('html_url') != f'https://github.com/{REPOSITORY}/releases/tag/{tag}':
        raise ValueError('Unexpected release repository')
    name = f'Vana_{number}_amd64.AppImage'
    matches = [asset for asset in release.get('assets', []) if asset.get('name') == name]
    if len(matches) != 1:
        raise ValueError('Exactly one current Linux x86_64 AppImage is required')
    asset = matches[0]
    expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/{urllib.parse.quote(name)}'
    digest = asset.get('digest', '')
    size = asset.get('size', 0)
    if asset.get('state') != 'uploaded' or asset.get('browser_download_url') != expected:
        raise ValueError('Invalid release asset source')
    if not isinstance(size, int) or not 0 < size <= MAX_PACKAGE or not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
        raise ValueError('Release asset needs a bounded size and GitHub SHA-256 digest')
    return dict(version=number, tag=tag, url=expected, sha256=digest[7:], size=size)


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        'User-Agent': 'Vana-Local-Desktop/1.0', 'Accept': 'application/vnd.github+json' if url == API else 'application/octet-stream',
    }), timeout=45)


def fetch_release():
    with request(API) as response:
        payload = response.read(2_000_001)
        if len(payload) > 2_000_000:
            raise ValueError('Release metadata too large')
        return json.loads(payload)


def download(asset, destination):
    digest, size = hashlib.sha256(), 0
    with request(asset['url']) as response, destination.open('xb') as output:
        resolved = urllib.parse.urlparse(response.geturl())
        if resolved.scheme != 'https' or resolved.hostname not in {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}:
            raise ValueError('Unexpected download redirect')
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > asset['size']:
                raise ValueError('Download exceeds declared size')
            digest.update(chunk)
            output.write(chunk)
        output.flush()
        os.fsync(output.fileno())
    if size != asset['size'] or digest.hexdigest() != asset['sha256']:
        raise ValueError('Download size or SHA-256 verification failed')
    with destination.open('rb') as stream:
        header = stream.read(20)
    if header[:6] != b'\x7fELF\x02\x01' or header[8:11] != b'AI\x02' or header[18:20] != b'\x3e\x00':
        raise ValueError('Not a Linux x86_64 type-2 AppImage')
    destination.chmod(0o755)


def switch_link(link, target):
    staging = link.with_name(f'.{link.name}-{os.getpid()}')
    try:
        staging.symlink_to(target)
        os.replace(staging, link)
    finally:
        staging.unlink(missing_ok=True)


class Installation:
    def __init__(self, root=None):
        self.data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
        self.config = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
        self.root = root or self.data / 'vana-desktop'

    def current(self):
        metadata = self.root / 'current/installed.json'
        return json.loads(metadata.read_text()) if metadata.exists() else None

    def backup_data(self, destination):
        source = self.data / 'com.vana.no-visitors'
        for database in source.rglob('*.db') if source.exists() else []:
            target = destination / 'data-backup' / database.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as reader, sqlite3.connect(target) as writer:
                reader.backup(writer)
            target.chmod(0o600)

    def update(self, release=None, downloader=download):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.root / 'update.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print('Another Vana update is already running')
                return False
            asset = select_release(release if release is not None else fetch_release())
            current = self.current()
            if current and version(asset['version']) <= version(current['version']):
                print(f"Vana {current['version']} installed; no newer stable release")
                return False
            if shutil.disk_usage(self.root).free < asset['size'] * 2 + 64 * 1024 * 1024:
                raise RuntimeError('Insufficient space for a staged Vana update')
            versions = self.root / 'versions'
            versions.mkdir(exist_ok=True)
            destination = versions / f"{asset['version']}-{asset['sha256'][:12]}"
            with tempfile.TemporaryDirectory(prefix='.download-', dir=versions) as temporary:
                staging = Path(temporary)
                downloader(asset, staging / 'Vana.AppImage')
                self.backup_data(staging)
                metadata = dict(asset, installed_at=dt.datetime.now(dt.timezone.utc).isoformat())
                (staging / 'installed.json').write_text(json.dumps(metadata, indent=2) + '\n')
                # A previous interrupted commit may already have staged this exact version.
                if destination.exists():
                    shutil.rmtree(destination)
                os.replace(staging, destination)
            if (self.root / 'current').is_symlink():
                switch_link(self.root / 'previous', (self.root / 'current').readlink())
            switch_link(self.root / 'current', destination.relative_to(self.root))
            print(f"Installed Vana {asset['version']}; running windows stay open; next launch uses this version")
            return True

    def launch(self, arguments):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.root / 'launch.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                if shutil.which('wmctrl'):
                    subprocess.run(['wmctrl', '-xa', 'vana'], check=False)
                return 0
            executable = (self.root / 'current/Vana.AppImage').resolve()
            if not executable.is_file():
                raise RuntimeError('Vana is not installed; run desktop:install first')
            return subprocess.call([str(executable), *arguments])


def desktop_quote(value):
    return '"' + str(value).replace('%', '%%').replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$') + '"'


def setup(installation):
    installation.update()
    root = installation.root
    manager = root / 'manager.py'
    source = Path(__file__).resolve()
    if source != manager:
        shutil.copy2(source, manager)
    icon = source.parent.parent / 'src-tauri/icons/128x128@2x.png'
    if icon.exists():
        shutil.copy2(icon, root / 'icon.png')
    launcher = Path.home() / '.local/bin/vana'
    launcher.parent.mkdir(parents=True, exist_ok=True)
    launcher.write_text(f'#!/bin/sh\nexec /usr/bin/python3 {shlex.quote(str(manager))} launch "$@"\n')
    launcher.chmod(0o755)
    desktop = ('[Desktop Entry]\nType=Application\nName=Vana\nComment=Notes and writing\n'
               f'Exec={desktop_quote(launcher)}\nTryExec={launcher}\nIcon={root / "icon.png"}\n'
               'Terminal=false\nCategories=Office;TextEditor;\nStartupWMClass=vana\nX-Vana-Managed=true\n')
    files = {
        installation.data / 'applications/vana.desktop': desktop,
        installation.config / 'autostart/vana.desktop': desktop + 'X-GNOME-Autostart-enabled=true\nX-GNOME-Autostart-Delay=8\n',
        installation.config / 'systemd/user/vana-local-update.service': (
            '[Unit]\nDescription=Update local Vana from published stable releases\n\n[Service]\nType=oneshot\n'
            f'ExecStart=/usr/bin/python3 {desktop_quote(manager)} update\n'
            'TimeoutStartSec=10min\nUMask=0077\nNice=10\nNoNewPrivileges=true\n'),
        installation.config / 'systemd/user/vana-local-update.timer': (
            '[Unit]\nDescription=Check for Vana releases after login and hourly\n\n[Timer]\n'
            'OnStartupSec=2min\nOnCalendar=hourly\nRandomizedDelaySec=90s\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n'),
    }
    for file, contents in files.items():
        file.parent.mkdir(parents=True, exist_ok=True)
        if file.exists() and file.read_text() != contents:
            backup = root / 'config-backups' / dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%f') / file.name
            backup.parent.mkdir(parents=True, mode=0o700)
            shutil.copy2(file, backup)
        file.write_text(contents)
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'vana-local-update.timer'], check=True)
    if shutil.which('update-desktop-database'):
        subprocess.run(['update-desktop-database', str(installation.data / 'applications')], check=True)
    print(f'Configured desktop login startup and hourly release updates: {launcher}')


def main():
    if sys.platform != 'linux' or platform.machine() not in {'x86_64', 'AMD64'}:
        raise RuntimeError('This local installer supports Linux x86_64')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['setup', 'update', 'status', 'launch'])
    args, extra = parser.parse_known_args()
    if extra and args.command != 'launch':
        parser.error('Unexpected arguments')
    installation = Installation()
    if args.command == 'setup':
        setup(installation)
    elif args.command == 'update':
        installation.update()
    elif args.command == 'status':
        print(json.dumps(installation.current(), indent=2))
    else:
        return installation.launch(extra)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'Vana local desktop: {error}', file=sys.stderr)
        sys.exit(1)
