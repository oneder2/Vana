#!/usr/bin/env python3
"""Render a static download site from the latest public stable GitHub Release.

The server timer runs this without credentials. Failed refreshes leave current
untouched; each complete HTML + JSON + asset set is published atomically.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import urllib.parse
import urllib.request

REPO = 'oneder2/Vana'
API = f'https://api.github.com/repos/{REPO}/releases/latest'
SOURCE = Path(__file__).resolve().parent


def fetch_release():
    request = urllib.request.Request(API, headers={
        'User-Agent': 'Vana-Website/1.0', 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError('Release response too large')
        return json.loads(data)


def release_manifest(release):
    if release.get('draft') is not False or release.get('prerelease') is not False:
        raise ValueError('Only public stable releases can be downloaded here')
    tag = release['tag_name']
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        raise ValueError('Unexpected stable version tag')
    release_url = f'https://github.com/{REPO}/releases/tag/{tag}'
    if release.get('html_url') != release_url:
        raise ValueError('Unexpected release URL')
    published = dt.datetime.fromisoformat(release['published_at'].replace('Z', '+00:00'))
    if published.tzinfo is None:
        raise ValueError('Release date missing timezone')
    assets = release['assets']
    selections = {
        'windows': ('_x64-setup.exe', 'Windows', 'x86_64', 'Windows 10 / 11'),
        'msi': ('_x64_en-US.msi', 'Windows', 'x86_64', 'Windows 10 / 11'),
        'android': ('-android-release.apk', 'Android', 'arm64-v8a', 'Android 7.0'),
        'linux': ('_amd64.AppImage', 'Linux', 'x86_64', '请查看安装说明'),
        'deb': ('_amd64.deb', 'Linux', 'x86_64', 'Debian / Ubuntu'),
        'rpm': ('.x86_64.rpm', 'Linux', 'x86_64', 'Fedora / RPM 系统'),
    }
    result = {}
    version = tag[1:]
    for key, (suffix, platform, arch, minimum_os) in selections.items():
        matches = [a for a in assets if a.get('name', '').endswith(suffix)
                   and re.search(r'(?<!\d)' + re.escape(version) + r'(?!\d)', a['name'])]
        if len(matches) != 1:
            raise ValueError(f'Exactly one {key} stable artifact required')
        asset = matches[0]
        name = asset['name']
        url = asset['browser_download_url']
        expected = f'https://github.com/{REPO}/releases/download/{tag}/{urllib.parse.quote(name)}'
        if url != expected or asset.get('state') != 'uploaded' or asset.get('size', 0) <= 0:
            raise ValueError(f'Invalid {key} download')
        digest = asset.get('digest', '')
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
            raise ValueError(f'{key} artifact has no verified GitHub SHA-256 digest')
        result[key] = {'name': name, 'url': url, 'bytes': asset['size'],
                       'sha256': digest[7:], 'platform': platform,
                       'arch': arch, 'minimum_os': minimum_os}
    return {'version': tag, 'published_at': release['published_at'],
            'release_url': release_url, 'repository': f'https://github.com/{REPO}',
            'downloads': result}


def render(manifest):
    published = dt.datetime.fromisoformat(manifest['published_at'].replace('Z', '+00:00'))
    values = {'version': manifest['version'], 'published_iso': published.date().isoformat(),
              'published_date': published.date().isoformat(), 'release_url': manifest['release_url'],
              'year': str(dt.datetime.now(dt.timezone.utc).year)}
    values.update({key + '_url': value['url'] for key, value in manifest['downloads'].items()})
    content = (SOURCE / 'index.template.html').read_text()
    for key, value in values.items():
        content = content.replace('{{' + key + '}}', html.escape(value, quote=True))
    if '{{' in content:
        raise ValueError('Unresolved site template value')
    return content


def publish(release, base):
    manifest = release_manifest(release)
    content = render(manifest)
    source_digest = hashlib.sha256()
    for name in ('style.css', 'site.js', 'assets/vana-icon.png'):
        source_digest.update((SOURCE / name).read_bytes())
    digest = hashlib.sha256((content + json.dumps(manifest, sort_keys=True) +
                             source_digest.hexdigest()).encode()).hexdigest()[:16]
    releases = base / 'releases'
    releases.mkdir(parents=True, exist_ok=True)
    destination = releases / f"site-{manifest['version']}-{digest}"
    if not destination.exists():
        with tempfile.TemporaryDirectory(prefix='.build-', dir=releases) as temporary:
            stage = Path(temporary) / 'site'
            stage.mkdir()
            (stage / 'index.html').write_text(content)
            (stage / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
            (stage / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: https://vana.gellaronline.cc/sitemap.xml\n')
            (stage / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://vana.gellaronline.cc/</loc></url></urlset>\n')
            for name in ('style.css', 'site.js', 'assets/vana-icon.png'):
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(SOURCE / name, target)
            stage.rename(destination)
    # Relative links also work when the entire deployment base is relocated.
    handle, link = tempfile.mkstemp(prefix='.current-', dir=base)
    os.close(handle)
    Path(link).unlink()
    try:
        Path(link).symlink_to(destination.relative_to(base))
        os.replace(link, base / 'current')
    finally:
        if Path(link).is_symlink():
            Path(link).unlink()
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=SOURCE / 'output')
    parser.add_argument('--release-file', type=Path, help='Use an exact GitHub API snapshot for validation')
    args = parser.parse_args()
    release = json.loads(args.release_file.read_text()) if args.release_file else fetch_release()
    destination = publish(release, args.base.resolve())
    print(f'Published {release["tag_name"]}: {destination}')


if __name__ == '__main__':
    main()
