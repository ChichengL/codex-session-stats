from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from audit_release import inspect, verify_archive
from build_release import write_archive

class ReleaseTests(unittest.TestCase):
    def test_archive_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'fixture.zip'
            payload = {'LICENSE': b'fixture', 'run.sh': b'#!/bin/sh\n'}
            write_archive(archive, 'fixture', payload, {'run.sh'})
            verify_archive(archive, 'fixture', payload, {'run.sh'})
            for filename in ['.env', '../escape', 'unexpected.txt']:
                write_archive(archive, 'fixture', {**payload, filename: b'private'}, {'run.sh'})
                with self.assertRaisesRegex(ValueError, 'file list'):
                    verify_archive(archive, 'fixture', payload, {'run.sh'})
            write_archive(archive, 'fixture', {**payload, 'LICENSE': b'tampered'}, {'run.sh'})
            with self.assertRaisesRegex(ValueError, 'checksum'):
                verify_archive(archive, 'fixture', payload, {'run.sh'})
            write_archive(archive, 'fixture', payload, {'run.sh'})
            with self.assertRaisesRegex(ValueError, 'mode'):
                verify_archive(archive, 'fixture', payload)
    def test_private_content(self):
        for name, data in [('auth.json', b'{}'), ('snapshot.png', b'pixels'), ('source.js', b'/Users/' + b'fixture/private'), ('source.js', b'ghp_' + b'A' * 30)]:
            with self.assertRaises(ValueError):
                inspect(name, data)
        inspect('source.js', b'public fixture')

if __name__ == '__main__':
    unittest.main()
