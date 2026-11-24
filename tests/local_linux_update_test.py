"""Isolated installer tests: no real releases, desktop settings or user databases."""
import copy
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('vana_local_linux', Path(__file__).resolve().parents[1] / 'scripts/manage-local-linux.py')
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)
HEADER = bytearray(32)
HEADER[:6], HEADER[8:11], HEADER[18:20] = b'\x7fELF\x02\x01', b'AI\x02', b'\x3e\x00'
PACKAGE = bytes(HEADER) + b'isolated package fixture'


def release(number='0.8.0'):
    name = f'Vana_{number}_amd64.AppImage'
    return dict(tag_name=f'v{number}', draft=False, prerelease=False,
                html_url=f'https://github.com/oneder2/Vana/releases/tag/v{number}',
                assets=[dict(name=name, state='uploaded', size=len(PACKAGE),
                             browser_download_url=f'https://github.com/oneder2/Vana/releases/download/v{number}/{name}',
                             digest='sha256:' + hashlib.sha256(PACKAGE).hexdigest())])


class Response(io.BytesIO):
    def geturl(self):
        return 'https://release-assets.githubusercontent.com/fixture'


def download_fixture(asset, destination):
    with patch.object(updater, 'request', return_value=Response(PACKAGE)):
        updater.download(asset, destination)


class LocalInstallationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        self.environment = patch.dict(os.environ, {'XDG_DATA_HOME': str(self.home / 'data'), 'XDG_CONFIG_HOME': str(self.home / 'config')})
        self.environment.start()
        self.installation = updater.Installation()

    def tearDown(self):
        self.environment.stop()
        self.temporary.cleanup()

    def test_select_only_stable_current_version_from_owned_repository(self):
        self.assertEqual(updater.select_release(release())['version'], '0.8.0')
        for change in [{'draft': True}, {'prerelease': True}, {'tag_name': 'v0.9.0-beta.1'}, {'html_url': 'https://github.com/other/repo/releases/tag/v0.8.0'}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                updater.select_release(dict(release(), **change))
        for field, value in [('browser_download_url', 'https://example.com/app'), ('digest', ''), ('state', 'new'), ('size', updater.MAX_PACKAGE + 1)]:
            payload = release()
            payload['assets'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                updater.select_release(payload)
        payload = release()
        payload['assets'].append(copy.deepcopy(payload['assets'][0]))
        with self.assertRaises(ValueError):
            updater.select_release(payload)

    def test_download_requires_size_digest_architecture_and_expected_redirect(self):
        asset = updater.select_release(release())
        for content in [PACKAGE[:-1], PACKAGE + b'extra', b'corrupt']:
            with self.subTest(content=content), patch.object(updater, 'request', return_value=Response(content)), self.assertRaises(ValueError):
                updater.download(asset, self.home / 'invalid.AppImage')
            (self.home / 'invalid.AppImage').unlink(missing_ok=True)
        wrong = dict(asset, sha256=hashlib.sha256(b'not an ELF executable').hexdigest(), size=len(b'not an ELF executable'))
        with patch.object(updater, 'request', return_value=Response(b'not an ELF executable')), self.assertRaises(ValueError):
            updater.download(wrong, self.home / 'wrong-architecture.AppImage')
        response = Response(PACKAGE)
        response.geturl = lambda: 'https://example.com/not-github'
        with patch.object(updater, 'request', return_value=response), self.assertRaises(ValueError):
            updater.download(asset, self.home / 'redirect.AppImage')

    def test_failed_update_keeps_existing_launch_target_and_cleans_staging(self):
        self.installation.update(release(), download_fixture)
        before = (self.installation.root / 'current').resolve()
        def failure(asset, destination):
            destination.write_bytes(b'partial download')
            raise OSError('connection interrupted')
        with self.assertRaises(OSError):
            self.installation.update(release('0.8.1'), failure)
        self.assertEqual((self.installation.root / 'current').resolve(), before)
        self.assertEqual(list((self.installation.root / 'versions').glob('.download-*')), [])
        self.assertTrue((before / 'Vana.AppImage').is_file())

    def test_new_version_atomically_switches_keeps_previous_and_backs_up_sqlite(self):
        source = self.installation.data / 'com.vana.no-visitors/vana-local/vana.db'
        source.parent.mkdir(parents=True)
        with sqlite3.connect(source) as database:
            database.execute('create table notes (body text)')
            database.execute("insert into notes values ('owned fixture')")
        original = source.read_bytes()
        self.installation.update(release(), download_fixture)
        old = (self.installation.root / 'current').resolve()
        self.installation.update(release('0.8.1'), download_fixture)
        self.assertEqual(self.installation.current()['version'], '0.8.1')
        self.assertEqual((self.installation.root / 'previous').resolve(), old)
        self.assertEqual(source.read_bytes(), original)
        backup = self.installation.root / 'current/data-backup/vana-local/vana.db'
        with sqlite3.connect(backup) as database:
            self.assertEqual(database.execute('select body from notes').fetchone()[0], 'owned fixture')
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)

    def test_same_or_older_release_does_not_download_or_downgrade(self):
        self.installation.update(release('0.10.0'), download_fixture)
        with patch.object(updater, 'download') as download:
            self.assertFalse(self.installation.update(release('0.9.9'), download))
            self.assertFalse(self.installation.update(release('0.10.0'), download))
            download.assert_not_called()
        self.assertEqual(self.installation.current()['version'], '0.10.0')

    def test_competing_update_and_duplicate_launch_do_not_start_second_work(self):
        self.installation.root.mkdir(parents=True)
        with (self.installation.root / 'update.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(updater, 'fetch_release') as fetch:
                self.assertFalse(self.installation.update())
                fetch.assert_not_called()
        with (self.installation.root / 'launch.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(updater.subprocess, 'call') as start, patch.object(updater.subprocess, 'run'):
                self.assertEqual(self.installation.launch([]), 0)
                start.assert_not_called()

    def test_setup_is_opt_in_idempotent_and_installed_launcher_has_no_repo_dependency(self):
        self.installation.update(release(), download_fixture)
        with patch.object(self.installation, 'update'), patch.object(updater.subprocess, 'run') as run, patch.object(Path, 'home', return_value=self.home):
            updater.setup(self.installation)
            updater.setup(self.installation)
        launcher = self.home / '.local/bin/vana'
        self.assertIn(str(self.installation.root / 'manager.py'), launcher.read_text())
        self.assertNotIn(str(Path(__file__).resolve().parents[1]), launcher.read_text())
        self.assertEqual(launcher.stat().st_mode & 0o777, 0o755)
        self.assertIn('OnCalendar=hourly', (self.installation.config / 'systemd/user/vana-local-update.timer').read_text())
        self.assertIn('X-GNOME-Autostart-enabled=true', (self.installation.config / 'autostart/vana.desktop').read_text())
        self.assertIn('enable', str(run.call_args_list))
        self.assertFalse((self.installation.root / 'config-backups').exists())


if __name__ == '__main__':
    unittest.main()
