#!/usr/bin/env python3
"""Match a verified APK/AAB signer to the intended release certificate."""
import argparse
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--aab', action='store_true')
parser.add_argument('expected_sha256')
parser.add_argument('artifact_or_report', type=pathlib.Path)
args = parser.parse_args()
expected = args.expected_sha256.lower()
if not re.fullmatch(r'[a-f0-9]{64}', expected):
    raise SystemExit('Invalid expected certificate digest')
if args.aab:
    verified = subprocess.run(['jarsigner', '-J-Duser.language=en', '-J-Duser.country=US',
                               '-verify', str(args.artifact_or_report)], capture_output=True, text=True)
    if verified.returncode or 'jar verified.' not in verified.stdout:
        raise SystemExit('AAB signature verification failed')
    result = subprocess.run(['keytool', '-J-Duser.language=en', '-J-Duser.country=US',
                             '-printcert', '-jarfile', str(args.artifact_or_report)],
                            capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('AAB signer extraction failed')
    # Only signer leaf certificates, not certificates in their chains.
    blocks = re.findall(r'Signer #\d+:\s*Certificate #1:(.*?)(?=Certificate #\d+:|Signer #\d+:|$)', result.stdout, re.S)
    fingerprints = [re.search(r'SHA256:\s*([A-Fa-f0-9:]+)', block) for block in blocks]
    fingerprints = [m.group(1).replace(':', '').lower() for m in fingerprints if m]
else:
    report = args.artifact_or_report.read_text()
    fingerprints = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)$', report, re.M)
    fingerprints = [value.lower() for value in fingerprints]
if fingerprints != [expected]:
    raise SystemExit('Release artifact signer does not match the intended certificate')
print('PASS: verified artifact matches the release signing certificate')
