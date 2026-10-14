"""Release boundary checks; no network or actual user data needed."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('site_build', Path(__file__).with_name('build.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def fixture():
    names = ['Vana_1.2.3_x64-setup.exe', 'Vana_1.2.3_x64_en-US.msi',
             'vana-1.2.3-android-release.apk', 'Vana_1.2.3_amd64.AppImage',
             'Vana_1.2.3_amd64.deb', 'Vana-1.2.3-1.x86_64.rpm']
    return {'draft': False, 'prerelease': False, 'tag_name': 'v1.2.3',
            'html_url': 'https://github.com/oneder2/Vana/releases/tag/v1.2.3',
            'published_at': '2026-10-14T00:00:00Z',
            'assets': [{'name': n, 'browser_download_url':
                        'https://github.com/oneder2/Vana/releases/download/v1.2.3/' + n,
                        'state': 'uploaded', 'size': 100, 'digest': 'sha256:' + 'a' * 64}
                       for n in names]}


class ReleaseBoundary(unittest.TestCase):
    def test_draft_prerelease_and_nonstable_tag_are_rejected(self):
        for key, value in [('draft', True), ('prerelease', True), ('tag_name', 'v1.2.3-rc.1')]:
            release = fixture()
            release[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                build.release_manifest(release)

    def test_incomplete_or_duplicate_asset_set_is_rejected(self):
        release = fixture()
        release['assets'].pop()
        with self.assertRaises(ValueError):
            build.release_manifest(release)
        release = fixture()
        release['assets'].append(copy.deepcopy(release['assets'][0]))
        with self.assertRaises(ValueError):
            build.release_manifest(release)

    def test_external_urls_missing_hash_and_unuploaded_assets_rejected(self):
        for key, value in [('browser_download_url', 'https://example.com/file.exe'),
                           ('digest', ''), ('state', 'new'), ('size', 0)]:
            release = fixture()
            release['assets'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                build.release_manifest(release)

    def test_failed_refresh_keeps_existing_complete_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            first = build.publish(fixture(), base)
            release = fixture()
            release['assets'].pop()
            with self.assertRaises(ValueError):
                build.publish(release, base)
            self.assertEqual((base / 'current').resolve(), first)
            self.assertTrue((first / 'index.html').is_file())
            self.assertEqual(json.loads((first / 'release.json').read_text())['version'], 'v1.2.3')

    def test_html_downloads_match_manifest_and_refresh_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            first = build.publish(fixture(), base)
            self.assertEqual(build.publish(fixture(), base), first)
            page = (first / 'index.html').read_text()
            self.assertNotIn('{{', page)
            for asset in build.release_manifest(fixture())['downloads'].values():
                self.assertIn(asset['url'], page)
            self.assertEqual(len(list((base / 'releases').iterdir())), 1)
            self.assertEqual((first / 'assets/vana-icon.png').read_bytes(),
                             (build.SOURCE / 'assets/vana-icon.png').read_bytes())


if __name__ == '__main__':
    unittest.main()
