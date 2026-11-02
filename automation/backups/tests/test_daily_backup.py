import datetime as dt
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from collections import namedtuple
from zoneinfo import ZoneInfo

MODULE = Path(__file__).resolve().parents[1] / 'daily_backup.py'
spec = importlib.util.spec_from_file_location('daily_backup', MODULE)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
Usage = namedtuple('Usage', 'total used free')

class FixtureRunner:
    def __init__(self):
        self.calls = []
        self.notify_results = []
        self.dump_fails = False
    def __call__(self, args, **kwargs):
        self.calls.append((list(args), kwargs))
        name = Path(args[0]).name
        if name == 'pg_dump':
            if self.dump_fails:
                return subprocess.CompletedProcess(args, 1, stderr=b'private details')
            kwargs['stdout'].write(b'PGDMP-fictitious-financial-snapshot\n')
            return subprocess.CompletedProcess(args, 0)
        if name == 'pg_restore':
            if '--dbname' in args or '-d' in args:
                raise AssertionError('must never restore into a database')
            code = 0 if Path(args[-1]).read_bytes().startswith(b'PGDMP-') else 1
            return subprocess.CompletedProcess(args, code)
        if name == 'docker':
            data = [{'Config': {'Image': 'n8n:test', 'Env': ['N8N_ENCRYPTION_KEY=fixture-secret']}, 'Mounts': []}]
            return subprocess.CompletedProcess(args, 0, stdout=json.dumps(data).encode())
        if name == 'notify':
            delivered = self.notify_results.pop(0) if self.notify_results else True
            return subprocess.CompletedProcess(args, 0, stdout=json.dumps({'delivered': delivered}).encode())
        raise AssertionError('unexpected subprocess')

class DailyBackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name).resolve()
        self.source = self.base / 'source.sqlite'
        c = sqlite3.connect(self.source)
        c.executescript('PRAGMA journal_mode=WAL; CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT, value BLOB); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), note TEXT); CREATE INDEX child_note ON child(note); CREATE TRIGGER child_insert AFTER INSERT ON parent BEGIN INSERT INTO child VALUES(NEW.id,NEW.id,NULL); END;')
        c.executemany('INSERT INTO parent(value) VALUES(?)', [(b'a' * 4096,)] * 60)
        c.execute('DELETE FROM child WHERE id>2'); c.execute('DELETE FROM parent WHERE id>2'); c.commit(); c.close()
        self.secret = self.base / 'config'; self.secret.write_text('fixture-private-encryption-key')
        self.runner = FixtureRunner()
        self.usage = Usage(1000000000, 200000000, 800000000)
        self.config = {'schemaVersion': 1, 'appRoot': str(self.base), 'backupRoot': str(self.base/'managed'), 'n8nDatabase': str(self.source), 'n8nContainer': 'n8n-fixture', 'privateFiles': {'n8n-config.json': str(self.secret), 'application.env': str(self.secret)}, 'dailyKeep': 7, 'weeklyKeep': 4, 'diskThresholdPercent': 85, 'minimumFreeBytes': 1024, 'pgDumpPath': '/fixture/pg_dump', 'pgRestorePath': '/fixture/pg_restore', 'dockerPath': '/fixture/docker', 'notifyCommand': ['/fixture/notify']}
        self.now = dt.datetime(2026,11,1,21,0,tzinfo=ZoneInfo('America/Santiago'))
    def tearDown(self): self.tmp.cleanup()
    def engine(self, now=None):
        return backup.BackupEngine(self.config, now=now or self.now, runner=self.runner, disk_usage=lambda _: self.usage)
    def paths(self, directory='daily'):
        return sorted((Path(self.config['backupRoot'])/directory).glob('*.tar.gz'))
    def notifications(self):
        return [json.loads(kwargs['input']) for args,kwargs in self.runner.calls if Path(args[0]).name=='notify']
    def replace_member(self, archive, change=None, extra=None, duplicate=None):
        with tarfile.open(archive,'r:gz') as src:
            members=[(m,src.extractfile(m).read()) for m in src.getmembers()]
        with tarfile.open(archive,'w:gz') as out:
            for m,data in members:
                if change and m.name==change: data += b'corruption'
                m.size=len(data); out.addfile(m,io.BytesIO(data))
                if duplicate and m.name==duplicate: out.addfile(m,io.BytesIO(data))
            if extra:
                m=tarfile.TarInfo(extra); m.size=1; out.addfile(m,io.BytesIO(b'x'))
    def test_consistent_compressed_private_snapshot_does_not_change_source(self):
        before=self.source.read_bytes()
        result=self.engine().run()
        self.assertEqual(result['status'],'ok')
        self.assertTrue(result['verified'])
        self.assertEqual(len(self.paths()),1)
        archive=self.paths()[0]
        self.assertEqual(archive.stat().st_mode & 0o777,0o600)
        self.assertEqual(archive.parent.stat().st_mode & 0o777,0o700)
        self.assertEqual(self.source.read_bytes(),before)
        with tarfile.open(archive,'r:gz')as t:
            names={m.name for m in t.getmembers()}
            self.assertEqual(names,{'manifest.json','postgres.dump','n8n.sqlite','n8n-runtime.json','n8n-config.json','application.env'})
            self.assertTrue(all(m.isfile()and m.mode==0o600 for m in t.getmembers()))
            self.assertIn(b'fixture-secret',t.extractfile('n8n-runtime.json').read())
            self.assertLess(len(t.extractfile('n8n.sqlite').read()),len(before))
        self.assertTrue(self.engine().verify_archive(archive)['verified'])
        restores=[args for args,_ in self.runner.calls if Path(args[0]).name=='pg_restore']
        self.assertTrue(restores)
        self.assertTrue(all('--file=/dev/null' in a for a in restores))
    def test_manifest_records_independent_database_capture_intervals(self):
        self.engine().run()
        manifest=self.engine().verify_archive(self.paths()[0])['manifest']
        capture=manifest['capturedAt']
        self.assertEqual(set(capture),{'postgresStartedAt','postgresFinishedAt','n8nStartedAt','n8nFinishedAt'})
        for prefix in ['postgres','n8n']:
            start=dt.datetime.fromisoformat(capture[prefix+'StartedAt']);end=dt.datetime.fromisoformat(capture[prefix+'FinishedAt'])
            self.assertEqual(start.utcoffset(),dt.timedelta(0));self.assertEqual(end.utcoffset(),dt.timedelta(0))
            self.assertLessEqual(start,end)
    def test_same_day_is_idempotent_and_verified_again(self):
        self.engine().run(); original=self.paths()[0].read_bytes()
        result=self.engine().run()
        self.assertEqual(len(self.paths()),1)
        self.assertEqual(self.paths()[0].read_bytes(),original)
        self.assertTrue(result['existingVerified'])
        self.assertEqual(sum(Path(a[0]).name=='pg_dump'for a,_ in self.runner.calls),1)
    def test_retains_seven_daily_four_weekly_across_year_boundary(self):
        start=dt.datetime(2026,12,20,3,30,tzinfo=ZoneInfo('America/Santiago'))
        for index in range(43): self.engine(start+dt.timedelta(days=index)).run()
        self.assertEqual(len(self.paths()),7); self.assertEqual(len(self.paths('weekly')),4)
        self.assertEqual([p.name for p in self.paths()],['backup-2027-01-%02d.tar.gz'%day for day in range(25,32)])
        self.assertEqual([p.name for p in self.paths('weekly')],['backup-2027-W%02d.tar.gz'%week for week in range(1,5)])
    def test_first_verified_copy_is_weekly_and_not_replaced_during_week(self):
        self.engine().run(); first=self.paths('weekly')[0].read_bytes()
        self.engine(self.now-dt.timedelta(days=1)).run()
        self.assertEqual(self.paths('weekly')[0].read_bytes(),first)
    def test_corrupt_component_is_rejected(self):
        self.engine().run(); archive=self.paths()[0]; self.replace_member(archive,change='postgres.dump')
        with self.assertRaises(backup.BackupError): self.engine().verify_archive(archive)
    def test_duplicate_and_extra_and_traversal_members_are_rejected(self):
        for marker in ['duplicate','extra','traversal']:
            with self.subTest(marker=marker):
                root=Path(self.config['backupRoot']); shutil.rmtree(root,ignore_errors=True)
                self.engine().run(); archive=self.paths()[0]
                if marker=='duplicate':self.replace_member(archive,duplicate='postgres.dump')
                else:self.replace_member(archive,extra='unexpected' if marker=='extra' else '../outside')
                with self.assertRaises(backup.BackupError):self.engine().verify_archive(archive)
    def test_corrupt_existing_copy_prevents_rotation(self):
        for day in range(7):self.engine(self.now+dt.timedelta(days=day)).run()
        archive=self.paths()[0]; self.replace_member(archive,change='application.env')
        original_names=[p.name for p in self.paths()]
        result=self.engine(self.now+dt.timedelta(days=8)).run()
        self.assertEqual(result['status'],'failed')
        self.assertTrue(all((archive.parent/name).exists()for name in original_names))
    def test_dump_failure_preserves_previous_backups_and_removes_staging(self):
        self.engine().run(); paths={p.name:p.read_bytes()for p in self.paths()}
        self.runner.dump_fails=True
        result=self.engine(self.now+dt.timedelta(days=1)).run()
        self.assertEqual(result['status'],'failed')
        self.assertEqual({p.name:p.read_bytes()for p in self.paths()},paths)
        self.assertFalse(list(Path(self.config['backupRoot']).glob('.staging-*')))
        self.assertEqual(self.notifications()[-1]['type'],'backup-failed')
    def test_symlink_source_and_managed_directory_rejected(self):
        link=self.base/'linked'; link.symlink_to(self.secret); self.config['privateFiles']['application.env']=str(link)
        self.assertEqual(self.engine().run()['status'],'failed')
        self.assertEqual(self.secret.read_text(),'fixture-private-encryption-key')
        self.config['privateFiles']['application.env']=str(self.secret)
        managed=Path(self.config['backupRoot']); shutil.rmtree(managed)
        managed.mkdir(); (managed/'daily').symlink_to(self.base,target_is_directory=True)
        self.assertEqual(self.engine().run()['status'],'failed')
        self.assertTrue(self.source.exists())
    def test_unknown_files_and_manual_backups_are_never_rotated(self):
        self.engine().run(); daily=self.paths()[0].parent
        unrelated=daily/'manual.tar.gz'; unrelated.write_bytes(b'must survive')
        historical=self.base/'n8n-old.sqlite.gz'; historical.write_bytes(b'must survive too')
        for day in range(1,12): self.engine(self.now+dt.timedelta(days=day)).run()
        self.assertEqual(unrelated.read_bytes(),b'must survive')
        self.assertTrue(historical.exists())
    def test_symlink_with_managed_filename_is_rejected_and_target_untouched(self):
        self.engine().run(); target=self.base/'preserve'; target.write_bytes(b'preserve')
        link=self.paths()[0].parent/'backup-2025-01-01.tar.gz';link.symlink_to(target)
        self.assertEqual(self.engine(self.now+dt.timedelta(days=1)).run()['status'],'failed')
        self.assertTrue(link.is_symlink());self.assertEqual(target.read_bytes(),b'preserve')
    def test_lock_prevents_concurrent_work(self):
        self.engine().run(); lock=Path(self.config['backupRoot'])/'.backup.lock'
        with lock.open('r+')as f:
            fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
            count=len(self.runner.calls)
            result=self.engine().run()
            self.assertEqual(result['status'],'skipped');self.assertEqual(result['reason'],'locked')
            self.assertEqual(count,len(self.runner.calls))
    def test_disk_threshold_inclusive_not_rounded_and_df_reserved_space_semantics(self):
        for usage,alerts in [(Usage(1000000000,849900000,150100000),0),(Usage(1000000000,850000000,150000000),1),(Usage(1000000000,800000000,100000000),1)]:
            with self.subTest(usage=usage):
                shutil.rmtree(self.config['backupRoot'],ignore_errors=True);self.runner.calls=[];self.usage=usage
                self.engine().run();self.assertEqual(len(self.notifications()),alerts)
    def test_disk_alert_retries_until_delivered_deduplicates_and_resets(self):
        self.usage=Usage(1000000000,850000000,150000000);self.runner.notify_results=[False,True,True]
        first=self.engine().run();self.assertTrue(first['diskAlertPending'])
        second=self.engine().run();self.assertFalse(second['diskAlertPending'])
        self.engine().run();self.assertEqual(len(self.notifications()),2)
        self.usage=Usage(1000000000,200000000,800000000);self.engine().run()
        self.usage=Usage(1000000000,900000000,100000000);self.engine().run()
        self.assertEqual(len(self.notifications()),3)
    def test_adaptive_preflight_reserves_three_times_previous_raw_size(self):
        self.engine().run()
        path=Path(self.config['backupRoot'])/'state.json';state=json.loads(path.read_text());state['lastVerifiedRawBytes']=200000000;path.write_text(json.dumps(state))
        self.usage=Usage(1000000000,500000000,500000000)
        result=self.engine(self.now+dt.timedelta(days=1)).run()
        self.assertEqual(result['status'],'failed');self.assertEqual(result['code'],'DISK_SPACE_INSUFFICIENT')
        self.assertEqual(len(self.paths()),1)
    def test_insufficient_free_space_keeps_valid_copy(self):
        self.engine().run(); archive=self.paths()[0]; previous=archive.read_bytes()
        self.usage=Usage(1000000000,999999500,500)
        result=self.engine(self.now+dt.timedelta(days=1)).run()
        self.assertEqual(result['status'],'failed');self.assertEqual(archive.read_bytes(),previous)
        self.assertEqual(len(self.paths()),1)
    def test_truncated_gzip_trailer_is_rejected(self):
        self.engine().run();archive=self.paths()[0];archive.write_bytes(archive.read_bytes()[:-8])
        with self.assertRaises(backup.BackupError):self.engine().verify_archive(archive)
    def test_snapshot_includes_committed_active_wal_rows(self):
        writer=sqlite3.connect(self.source)
        try:
            writer.execute('PRAGMA journal_mode=WAL');writer.execute('PRAGMA wal_autocheckpoint=0')
            writer.execute('INSERT INTO parent(value) VALUES(?)',(b'committed-in-active-wal',));writer.commit()
            self.assertTrue(Path(str(self.source)+'-wal').exists())
            self.engine().run()
            with tarfile.open(self.paths()[0],'r:gz')as archive:
                snapshot=self.base/'restored.sqlite';snapshot.write_bytes(archive.extractfile('n8n.sqlite').read())
            c=sqlite3.connect(snapshot)
            self.assertEqual(c.execute('SELECT COUNT(*)FROM parent WHERE value=?',(b'committed-in-active-wal',)).fetchone()[0],1);c.close()
        finally:writer.close()
    def test_crossing_disk_threshold_during_backup_alerts_in_same_run(self):
        root=Path(self.config['backupRoot'])
        def usage(_):
            return Usage(1000000000,850000000,150000000)if list((root/'daily').glob('*.tar.gz'))else Usage(1000000000,200000000,800000000)
        result=backup.BackupEngine(self.config,now=self.now,runner=self.runner,disk_usage=usage).run()
        self.assertEqual(result['status'],'ok');self.assertEqual(len(self.notifications()),1)
        self.assertEqual(self.notifications()[0],{'type':'disk-high','usedPercent':85})
    def test_truncated_archive_is_rejected(self):
        self.engine().run(); archive=self.paths()[0]; data=archive.read_bytes();archive.write_bytes(data[:len(data)//2])
        with self.assertRaises(backup.BackupError):self.engine().verify_archive(archive)

if __name__=='__main__':unittest.main()
