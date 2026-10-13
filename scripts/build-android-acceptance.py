#!/usr/bin/env python3
"""Build same-signer test instrumentation for a self-created Android account.

Requires the release signing environment. Does not modify the production APK.
"""
import os
import pathlib
import subprocess
import tempfile
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
sdk = pathlib.Path(os.environ['ANDROID_HOME'])
tools = sorted((sdk / 'build-tools').glob('*'))[-1]
platform = sorted((sdk / 'platforms').glob('android-*'))[-1] / 'android.jar'
output = root / 'dist/android/vana-native-acceptance.apk'
output.parent.mkdir(parents=True, exist_ok=True)

def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('Android acceptance tool build failed; signing details suppressed')

with tempfile.TemporaryDirectory(prefix='vana-native-android-') as temporary:
    work = pathlib.Path(temporary)
    (work / 'classes').mkdir()
    (work / 'dex').mkdir()
    manifest = work / 'AndroidManifest.xml'
    manifest.write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android"
      package="com.vana.acceptance.instrumented">
      <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/>
      <application android:label="Vana native acceptance" android:allowBackup="false"/>
      <instrumentation android:name=".NativeAcceptance" android:targetPackage="com.vana.no_visitors"/>
    </manifest>''')
    run(['javac', '-source', '8', '-target', '8', '-cp', str(platform), '-d', str(work / 'classes'),
         str(root / 'tests/native-android/NativeAcceptance.java')])
    run([str(tools / 'd8'), '--lib', str(platform), '--min-api', '26', '--output', str(work / 'dex'),
         *[str(p) for p in (work / 'classes').rglob('*.class')]])
    unsigned = work / 'unsigned.apk'
    run([str(tools / 'aapt'), 'package', '-f', '-M', str(manifest), '-I', str(platform), '-F', str(unsigned)])
    with zipfile.ZipFile(unsigned, 'a') as archive:
        archive.write(work / 'dex/classes.dex', 'classes.dex')
    run([str(tools / 'apksigner'), 'sign', '--ks', os.environ['VANA_ANDROID_KEYSTORE_PATH'],
         '--ks-key-alias', os.environ['VANA_ANDROID_KEY_ALIAS'],
         '--ks-pass', 'env:VANA_ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:VANA_ANDROID_KEY_PASSWORD',
         '--out', str(output), str(unsigned)])
    run([str(tools / 'apksigner'), 'verify', str(output)])
print('PASS: separate signed Android native acceptance instrumentation built')
