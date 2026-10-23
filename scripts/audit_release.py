"""Reject unexpected files, private data, symlinks and mismatched release content."""
from pathlib import Path
import hashlib
import json
import os
import re
import stat
import zipfile
from build_release import ROOT, RUNTIME_FILES, COMMANDS, source_files

PATTERNS = [
    rb'/Users/[A-Za-z0-9_. -]+/', rb'/home/[A-Za-z0-9_.-]+/', rb'/var/folders/[A-Za-z0-9_/.-]+',
    rb'[A-Za-z]:\\Users\\[^\\\r\n]+\\', rb'gh[pousr]_[A-Za-z0-9]{20,}', rb'github_pat_[A-Za-z0-9_]{20,}',
    rb'sk-[A-Za-z0-9_-]{24,}', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
]
def inspect(name, data):
    p = Path(name)
    if set(p.parts) & {'.git', 'node_modules', 'backups', '.devtools', '__MACOSX'} or p.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.asar', '.sqlite', '.db', '.log'} or p.name.startswith('.env') or p.name in {'auth.json', 'config.json', 'worker.json'}:
        raise ValueError('Private or unsupported artifact: ' + name)
    if any(re.search(pattern, data) for pattern in PATTERNS):
        raise ValueError('Potential secret/personal path (content withheld): ' + name)

def verify_archive(archive, prefix, payload, executable=()):
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        expected = {prefix + '/' + name for name in payload} | {prefix + '/SHA256SUMS.txt'}
        if len(names) != len(set(names)) or set(names) != expected or bundle.testzip():
            raise ValueError('Archive file list or CRC mismatch: ' + archive.name)
        sums = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(payload.items())).encode()
        if bundle.read(prefix + '/SHA256SUMS.txt') != sums:
            raise ValueError('Archive checksum manifest mismatch')
        for entry in bundle.infolist():
            name = entry.filename[len(prefix) + 1:]
            mode = entry.external_attr >> 16
            if not stat.S_ISREG(mode) or (mode & 0o777) != (0o755 if name in executable else 0o644):
                raise ValueError('Unsafe archive mode: ' + name)
            data = bundle.read(entry)
            if name in payload and data != payload[name]:
                raise ValueError('Archive content differs from source: ' + name)
            inspect(name, data)

def main():
    names = set(source_files())
    for directory, dirs, files in os.walk(ROOT, followlinks=False):
        dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', 'dist', '.devtools', '__pycache__'}]
        if any((Path(directory) / d).is_symlink() for d in dirs):
            raise ValueError('Unexpected source directory symlink')
        for name in files:
            source = Path(directory) / name
            relative = source.relative_to(ROOT).as_posix()
            if source.is_symlink() or relative not in names | {'agent.cjs'}:
                raise ValueError('Unexpected source file: ' + relative)
            inspect(relative, source.read_bytes())
    version = json.loads((ROOT / 'package.json').read_text())['version']
    archives = [ROOT / 'dist' / f'CodexSessionStats-{kind}-{version}.zip' for kind in ['macOS', 'source']]
    runtime = {name: (ROOT / source).read_bytes() for name, source in RUNTIME_FILES.items()}
    runtime.update({name: f'#!/bin/bash\nexec /bin/bash "$(dirname "$0")/scripts/mac-entry.sh" {action}\n'.encode() for name, action in COMMANDS.items()})
    verify_archive(archives[0], archives[0].stem, runtime, set(COMMANDS) | {'macos/startup/bridge', 'scripts/mac-entry.sh'})
    verify_archive(archives[1], archives[1].stem, {name: (ROOT / name).read_bytes() for name in names}, {'scripts/mac-entry.sh'})
    sums = ''.join(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n' for archive in archives)
    if (ROOT / 'dist/SHA256SUMS.txt').read_text() != sums:
        raise ValueError('External checksum manifest mismatch')
    print(f'PASS {len(names)} source files and both archives: file lists, content, permissions, CRC, SHA-256 and privacy patterns')

if __name__ == '__main__':
    main()
