#!/usr/bin/env python3
"""Validate Rust's JNI contract in actual Release R8 mapping and minified DEX declarations."""
import os, pathlib, re, shutil, subprocess, sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'src-tauri/gen/android/app/build/outputs/mapping')
mappings=sorted(root.glob('**/mapping.txt')) if root.is_dir() else [root]
if not mappings: raise SystemExit(f'No R8 mapping found under {root}; build a minified Release variant first')
sdk=pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or pathlib.Path.home()/'Android/Sdk')
tools=sorted(sdk.glob('build-tools/*/dexdump'))
dexdump=shutil.which('dexdump') or (str(tools[-1]) if tools else None)
if not dexdump: raise SystemExit('Android build-tools dexdump is required to verify actual DEX declarations')
name='com.vana.no_visitors.AndroidShare'
for path in mappings:
    text=path.read_text()
    section=re.search(r'^'+re.escape(name)+r' -> ([^\n:]+):\n((?:[ \t#].*\n)*)',text,re.MULTILINE)
    if not section or section.group(1)!=name: raise SystemExit(f'{path}: JNI class was removed or renamed')
    members=section.group(2)
    if not re.search(r'void shareExportFile\(java.lang.String,java.lang.String,java.lang.String\).* -> shareExportFile\s*$',members,re.MULTILINE):
        raise SystemExit(f'{path}: JNI method was removed or renamed')
    # R8 may omit unchanged field mappings, so mapping alone cannot prove presence.
    variant=path.parent.name
    dex_root=path.parents[3]/'intermediates/dex'/variant
    found=False
    for dex in dex_root.glob('**/classes*.dex'):
        dump=subprocess.check_output([dexdump,str(dex)],text=True,errors='replace')
        for block in re.split(r'(?m)^Class #\d+.*\n',dump):
            if f"Class descriptor  : 'L{name.replace('.', '/')};'" not in block: continue
            def member(member_name, signature):
                match=re.search(r"name\s*:\s*'"+re.escape(member_name)+r"'\s+type\s*:\s*'"+
                    re.escape(signature)+r"'\s+access\s*:\s*0x([0-9a-fA-F]+)",block)
                return bool(match and int(match.group(1),16)&0x9==0x9)
            if not member('lastShareError','Ljava/lang/String;') or not member('shareExportFile','(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V'):
                raise SystemExit(f'{dex}: public static JNI method or error field is absent or has the wrong signature')
            found=True
            print(f'PASS: {dex}: JNI class, public static method signature and error field retained')
    if not found: raise SystemExit(f'{dex_root}: JNI class missing from actual minified DEX')

# Refresh tokens now use a second JNI entry, also invisible to R8's reachability analysis.
secret_name='com.vana.no_visitors.AndroidSessionSecrets'
secret_signature='(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;'
for path in mappings:
    text=path.read_text()
    section=re.search(r'^'+re.escape(secret_name)+r' -> ([^\n:]+):\n((?:[ \t#].*\n)*)',text,re.MULTILINE)
    if not section or section.group(1)!=secret_name: raise SystemExit(f'{path}: Keystore JNI class was removed or renamed')
    variant=path.parent.name
    dex_root=path.parents[3]/'intermediates/dex'/variant
    found=False
    for dex in dex_root.glob('**/classes*.dex'):
        dump=subprocess.check_output([dexdump,str(dex)],text=True,errors='replace')
        for block in re.split(r'(?m)^Class #\d+.*\n',dump):
            if f"Class descriptor  : 'L{secret_name.replace('.', '/')};'" not in block: continue
            match=re.search(r"name\s*:\s*'access'\s+type\s*:\s*'"+re.escape(secret_signature)+r"'\s+access\s*:\s*0x([0-9a-fA-F]+)",block)
            if not match or int(match.group(1),16)&0x9!=0x9:
                raise SystemExit(f'{dex}: public static Keystore JNI signature is absent or incorrect')
            found=True
            print(f'PASS: {dex}: Keystore JNI public static method retained')
    if not found: raise SystemExit(f'{dex_root}: Keystore JNI class missing from minified DEX')
