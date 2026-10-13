#!/usr/bin/env python3
"""Check the actual R8 mapping, so Java refactors cannot silently remove Rust's JNI contract."""
import pathlib, re, sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'src-tauri/gen/android/app/build/outputs/mapping')
mappings=sorted(root.glob('**/mapping.txt')) if root.is_dir() else [root]
if not mappings: raise SystemExit(f'No R8 mapping found under {root}; build a minified Release variant first')
name='com.vana.no_visitors.AndroidShare'
for path in mappings:
    text=path.read_text()
    section=re.search(r'^'+re.escape(name)+r' -> ([^\n:]+):\n((?:[ \t#].*\n)*)',text,re.MULTILINE)
    if not section or section.group(1)!=name: raise SystemExit(f'{path}: JNI class was removed or renamed')
    members=section.group(2)
    if not re.search(r'void shareExportFile\(java.lang.String,java.lang.String,java.lang.String\).* -> shareExportFile\s*$',members,re.MULTILINE):
        raise SystemExit(f'{path}: JNI shareExportFile signature was removed or renamed')
    if not re.search(r'java.lang.String lastShareError -> lastShareError\s*$',members,re.MULTILINE):
        raise SystemExit(f'{path}: JNI error field was removed or renamed')
    print(f'PASS: {path}: JNI class, three-String static method and error field retain their names')
