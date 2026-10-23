"""Build standalone macOS and source archives from explicit file lists."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = {name: name for name in ['agent.cjs', 'manage.cjs', 'macos/install-lock.cjs', 'macos/startup/controller.cjs', 'macos/startup/watch.cjs', 'scripts/mac-entry.sh', 'README.md', 'LICENSE', 'NOTICE.md', 'SECURITY.md', 'docs/macos.md', 'docs/metrics.md', 'docs/development.md']}
RUNTIME_FILES['macos/startup/bridge'] = '.devtools/macos-startup-bridge'
COMMANDS = {'安装.command': 'install', '诊断.command': 'status', '卸载.command': 'uninstall'}

def source_files():
    names = json.loads((ROOT / 'release-files.json').read_text())
    if not isinstance(names, list) or len(names) != len(set(names)):
        raise ValueError('Invalid source file list')
    for name in names:
        p = Path(name)
        if not isinstance(name, str) or not name or p.is_absolute() or '..' in p.parts or '\\' in name or name != p.as_posix():
            raise ValueError('Unsafe source path')
        if any((ROOT / Path(*p.parts[:n])).is_symlink() for n in range(1, len(p.parts) + 1)) or not (ROOT / p).is_file():
            raise ValueError('Missing source or symlink: ' + name)
    return names

def write_archive(archive, prefix, payload, executable=()):
    payload = dict(payload)
    payload['SHA256SUMS.txt'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(payload.items())).encode()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, data in sorted(payload.items()):
            entry = zipfile.ZipInfo(prefix + '/' + name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (0o100755 if name in executable else 0o100644) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(entry, data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=['macOS'], default='macOS')
    parser.parse_args()
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)?', version):
        raise ValueError('Invalid release version')
    if f"const VERSION='{version}';" not in (ROOT / 'manage.cjs').read_text() or f"var AGENT_VERSION = '{version}';" not in (ROOT / 'src/agent-main.js').read_text():
        raise ValueError('Installer, agent and package versions must match')
    names = source_files()
    subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/build_native.py')], check=True)
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    payload = {name: (ROOT / source).read_bytes() for name, source in RUNTIME_FILES.items()}
    payload.update({name: f'#!/bin/bash\nexec /bin/bash "$(dirname "$0")/scripts/mac-entry.sh" {action}\n'.encode() for name, action in COMMANDS.items()})
    archives = [dist / f'CodexSessionStats-macOS-{version}.zip', dist / f'CodexSessionStats-source-{version}.zip']
    write_archive(archives[0], archives[0].stem, payload, set(COMMANDS) | {'macos/startup/bridge', 'scripts/mac-entry.sh'})
    write_archive(archives[1], archives[1].stem, {name: (ROOT / name).read_bytes() for name in names}, {'scripts/mac-entry.sh'})
    (dist / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n' for archive in archives))
    for archive in archives:
        print(archive.name)

if __name__ == '__main__':
    main()
