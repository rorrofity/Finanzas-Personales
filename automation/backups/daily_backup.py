#!/usr/bin/env python3
"""Private, verified backups. Source databases are opened/read only; no restores here."""
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
from zoneinfo import ZoneInfo

FORMAT = 'finanzas-backup-v1'
DAILY = re.compile(r'^backup-(\d{4}-\d{2}-\d{2})\.tar\.gz$')
WEEKLY = re.compile(r'^backup-(\d{4}-W\d{2})\.tar\.gz$')
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$')
FIXED = {'postgres.dump', 'n8n.sqlite', 'n8n-runtime.json'}
CHUNK = 1024 * 1024

class BackupError(Exception):
    """Only stable codes may reach operational logs."""


def _no_symlink(path):
    path = Path(path)
    if not path.is_absolute():
        raise BackupError('PATH_NOT_ABSOLUTE')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise BackupError('SYMLINK_REJECTED')
    return path


def _open_regular(path, mode='rb'):
    path = _no_symlink(path)
    flags = os.O_RDONLY if mode == 'rb' else os.O_RDWR
    try:
        descriptor = os.open(str(path), flags | os.O_NOFOLLOW)
    except OSError:
        raise BackupError('FILE_UNAVAILABLE') from None
    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise BackupError('NONREGULAR_FILE_REJECTED')
    return os.fdopen(descriptor, mode)


def _fsync_directory(path):
    descriptor = os.open(str(path), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _sha(stream):
    h = hashlib.sha256()
    size = 0
    while True:
        block = stream.read(CHUNK)
        if not block:
            return h.hexdigest(), size
        h.update(block)
        size += len(block)


class BackupEngine:
    def __init__(self, config, now=None, runner=subprocess.run, disk_usage=shutil.disk_usage):
        self.config = dict(config)
        self.now = (now or dt.datetime.now(dt.timezone.utc)).astimezone(ZoneInfo('America/Santiago'))
        self.runner = runner
        self.disk_usage = disk_usage
        self.root = Path(config['backupRoot'])
        self.state = {'schemaVersion': 1, 'diskAlarm': {}, 'backupFailure': {}}
        self.ready = False
        self._notification_attempts = set()
        self._validate_config()

    def _validate_config(self):
        c = self.config
        if c.get('schemaVersion') != 1 or not isinstance(c.get('privateFiles'), dict) or not c['privateFiles']:
            raise BackupError('CONFIG_INVALID')
        for key in ['backupRoot', 'appRoot', 'n8nDatabase']:
            _no_symlink(c[key])
        for name, path in c['privateFiles'].items():
            if not NAME.fullmatch(name) or name in FIXED or name == 'manifest.json':
                raise BackupError('COMPONENT_NAME_INVALID')
            if not Path(path).is_absolute():
                raise BackupError('CONFIG_INVALID')
        for key, default, maximum in [('dailyKeep', 7, 31), ('weeklyKeep', 4, 52), ('diskThresholdPercent', 85, 99)]:
            value = c.setdefault(key, default)
            if type(value) is not int or not 1 <= value <= maximum:
                raise BackupError('CONFIG_INVALID')
        minimum = c.setdefault('minimumFreeBytes', 100 * 1024 * 1024)
        if type(minimum) is not int or minimum < 1:
            raise BackupError('CONFIG_INVALID')
        command = c.get('notifyCommand')
        if not isinstance(command, list) or not command or any(not isinstance(v, str) for v in command):
            raise BackupError('CONFIG_INVALID')

    def _prepare(self):
        _no_symlink(self.root)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        marker = self.root / '.managed-by-finanzas-backup-v1'
        _no_symlink(marker)
        if not marker.exists():
            # An existing directory with unrelated contents cannot be adopted.
            if any(self.root.iterdir()):
                raise BackupError('UNMANAGED_ROOT_REJECTED')
            try:
                with marker.open('x') as f:
                    os.chmod(marker, 0o600)
                    f.write(FORMAT)
                    f.flush()
                    os.fsync(f.fileno())
            except FileExistsError:
                pass
        with _open_regular(marker) as f:
            if f.read().decode() != FORMAT:
                raise BackupError('MANAGEMENT_MARKER_INVALID')
        os.chmod(self.root, 0o700)
        for name in ['daily', 'weekly']:
            directory = _no_symlink(self.root / name)
            directory.mkdir(mode=0o700, exist_ok=True)
            if not directory.is_dir():
                raise BackupError('MANAGED_DIRECTORY_INVALID')
            os.chmod(directory, 0o700)
        self.ready = True

    def _atomic_json(self, target, value):
        _no_symlink(target)
        descriptor, name = tempfile.mkstemp(prefix='.state-', dir=self.root)
        try:
            with os.fdopen(descriptor, 'w') as f:
                os.fchmod(f.fileno(), 0o600)
                json.dump(value, f, sort_keys=True)
                f.flush()
                os.fsync(f.fileno())
            os.replace(name, target)
            _fsync_directory(self.root)
        finally:
            if os.path.exists(name):
                os.unlink(name)

    def _save_state(self):
        self._atomic_json(self.root / 'state.json', self.state)

    def _load_state(self):
        path = self.root / 'state.json'
        _no_symlink(path)
        if path.exists():
            try:
                with _open_regular(path) as f:
                    value = json.load(f)
                if value.get('schemaVersion') != 1 or not isinstance(value.get('diskAlarm'), dict) or not isinstance(value.get('backupFailure'), dict):
                    raise ValueError()
                self.state = value
            except (ValueError, TypeError, UnicodeError):
                raise BackupError('STATE_INVALID') from None

    def _run(self, command, **kwargs):
        kwargs.setdefault('timeout', 600)
        kwargs.setdefault('stderr', subprocess.DEVNULL)
        try:
            result = self.runner(command, **kwargs)
        except subprocess.TimeoutExpired:
            raise BackupError('TOOL_TIMEOUT') from None
        except OSError:
            raise BackupError('TOOL_START_FAILED') from None
        if result.returncode:
            raise BackupError('TOOL_FAILED')
        return result

    def _notify(self, event):
        if event['type'] in self._notification_attempts:
            return False
        self._notification_attempts.add(event['type'])
        try:
            result = self._run(self.config['notifyCommand'], input=json.dumps(event).encode(), stdout=subprocess.PIPE, timeout=30)
            return json.loads(result.stdout).get('delivered') is True
        except (BackupError, ValueError, TypeError, AttributeError):
            return False

    def _disk(self):
        usage = self.disk_usage(self.root)
        denominator = usage.used + usage.free
        if denominator <= 0:
            raise BackupError('DISK_USAGE_INVALID')
        return usage, usage.used * 100 / denominator

    def _disk_alert(self):
        usage, used = self._disk()
        alarm = self.state['diskAlarm']
        if used >= self.config['diskThresholdPercent']:
            delivered = alarm.get('active') is True and alarm.get('notified') is True
            if not delivered:
                delivered = self._notify({'type': 'disk-high', 'usedPercent': min(100, math.floor(used))})
            self.state['diskAlarm'] = {'active': True, 'notified': delivered, 'pending': not delivered, 'usedPercent': round(used, 2)}
        else:
            self.state['diskAlarm'] = {'active': False, 'notified': False, 'pending': False, 'usedPercent': round(used, 2)}
        self._save_state()
        return usage, used

    def _backup_failure_alert(self):
        alarm = self.state['backupFailure']
        delivered = alarm.get('active') is True and alarm.get('notified') is True
        if not delivered:
            delivered = self._notify({'type': 'backup-failed'})
        self.state['backupFailure'] = {'active': True, 'notified': delivered, 'pending': not delivered}

    def _copy_private(self, source, destination):
        with _open_regular(source) as src, destination.open('xb') as dst:
            os.fchmod(dst.fileno(), 0o600)
            shutil.copyfileobj(src, dst, CHUNK)
            dst.flush()
            os.fsync(dst.fileno())

    def _write_private(self, destination, value):
        with destination.open('x') as f:
            os.fchmod(f.fileno(), 0o600)
            json.dump(value, f, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())

    def _components(self, stage):
        captured = {'postgresStartedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        dump = stage / 'postgres.dump'
        with dump.open('xb') as f:
            os.fchmod(f.fileno(), 0o600)
            self._run([self.config['pgDumpPath'], '--format=custom', '--no-owner', '--no-acl'], stdout=f)
            f.flush()
            os.fsync(f.fileno())
        captured['postgresFinishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        captured['n8nStartedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        database = _no_symlink(self.config['n8nDatabase'])
        with _open_regular(database):
            pass
        snapshot = stage / 'n8n.sqlite'
        source = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=30)
        try:
            source.execute('PRAGMA busy_timeout=30000')
            source.execute('VACUUM INTO ?', (str(snapshot),))
        except sqlite3.Error:
            raise BackupError('SQLITE_SNAPSHOT_FAILED') from None
        finally:
            source.close()
        captured['n8nFinishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        os.chmod(snapshot, 0o600)
        snap = sqlite3.connect(snapshot.as_uri() + '?mode=ro', uri=True)
        try:
            if snap.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise BackupError('SQLITE_INTEGRITY_FAILED')
            foreign_keys = len(snap.execute('PRAGMA foreign_key_check').fetchall())
        finally:
            snap.close()
        with snapshot.open('rb') as f:
            os.fsync(f.fileno())
        result = self._run([self.config['dockerPath'], 'inspect', self.config['n8nContainer']], stdout=subprocess.PIPE, timeout=30)
        try:
            container = json.loads(result.stdout)[0]
            runtime = {'schemaVersion': 1, 'image': container['Config']['Image'], 'environment': container['Config']['Env'], 'mounts': container['Mounts']}
            if not isinstance(runtime['environment'], list):
                raise ValueError()
        except (ValueError, TypeError, KeyError, IndexError):
            raise BackupError('N8N_RUNTIME_INVALID') from None
        self._write_private(stage / 'n8n-runtime.json', runtime)
        for name, path in self.config['privateFiles'].items():
            self._copy_private(path, stage / name)
        components = {}
        for name in sorted(FIXED | set(self.config['privateFiles'])):
            with _open_regular(stage / name) as f:
                sha, size = _sha(f)
            components[name] = {'sha256': sha, 'bytes': size}
        year, week, _ = self.now.isocalendar()
        manifest = {'format': FORMAT, 'schemaVersion': 1, 'createdAt': self.now.isoformat(), 'capturedAt': captured, 'day': self.now.date().isoformat(), 'isoWeek': '%04d-W%02d' % (year, week), 'privateFiles': sorted(self.config['privateFiles']), 'components': components, 'sqlite': {'integrityCheck': 'ok', 'foreignKeyViolationCount': foreign_keys}, 'consistency': 'each database snapshot is consistent; snapshots are independent'}
        self._write_private(stage / 'manifest.json', manifest)
        return manifest

    def _archive(self, stage):
        path = stage / 'archive.tar.gz'
        with path.open('xb') as f:
            os.fchmod(f.fileno(), 0o600)
            with tarfile.open(fileobj=f, mode='w:gz', compresslevel=6) as archive:
                for component in sorted(stage.iterdir()):
                    if component == path:
                        continue
                    info = tarfile.TarInfo(component.name)
                    info.size = component.stat().st_size
                    info.mode = 0o600
                    info.mtime = int(self.now.timestamp())
                    with _open_regular(component) as content:
                        archive.addfile(info, content)
            f.flush()
            os.fsync(f.fileno())
        return path

    def verify_archive(self, archive):
        """Read gzip fully (including its trailer), every member and the full dump."""
        archive = _no_symlink(archive)
        try:
            # tarfile may stop at the TAR end marker before checking the gzip CRC.
            with _open_regular(archive) as raw, gzip.GzipFile(fileobj=raw) as zipped:
                while zipped.read(CHUNK):
                    pass
            parent = self.root if self.root.exists() else archive.parent
            with tempfile.TemporaryDirectory(prefix='.verify-', dir=parent) as tmp:
                os.chmod(tmp, 0o700)
                directory = Path(tmp)
                with _open_regular(archive) as f, tarfile.open(fileobj=f, mode='r:gz') as bundle:
                    members = bundle.getmembers()
                    names = [m.name for m in members]
                    if len(names) != len(set(names)) or any(not NAME.fullmatch(n) for n in names) or any(not m.isfile() or m.mode != 0o600 for m in members) or 'manifest.json' not in names:
                        raise BackupError('ARCHIVE_MEMBERS_INVALID')
                    manifest_member = bundle.getmember('manifest.json')
                    if manifest_member.size > CHUNK:
                        raise BackupError('MANIFEST_INVALID')
                    manifest = json.load(bundle.extractfile(manifest_member))
                    private = manifest.get('privateFiles')
                    components = manifest.get('components')
                    if manifest.get('format') != FORMAT or manifest.get('schemaVersion') != 1 or not isinstance(private, list) or not private or len(private) != len(set(private)) or any(not isinstance(n, str) or not NAME.fullmatch(n) or n in FIXED or n == 'manifest.json' for n in private) or not isinstance(components, dict) or set(components) != FIXED | set(private) or set(names) != set(components) | {'manifest.json'}:
                        raise BackupError('MANIFEST_INVALID')
                    # Bound extracted bytes by actual free capacity; only two files are extracted.
                    extraction_bytes = sum(bundle.getmember(n).size for n in ['postgres.dump', 'n8n.sqlite'])
                    if extraction_bytes + self.config['minimumFreeBytes'] > self.disk_usage(parent).free:
                        raise BackupError('VERIFICATION_SPACE_INSUFFICIENT')
                    for member in members:
                        if member.name == 'manifest.json':
                            continue
                        h = hashlib.sha256(); size = 0
                        out = None
                        try:
                            if member.name in ['postgres.dump', 'n8n.sqlite']:
                                out = (directory / member.name).open('xb')
                                os.fchmod(out.fileno(), 0o600)
                            with bundle.extractfile(member) as content:
                                while True:
                                    chunk = content.read(CHUNK)
                                    if not chunk:
                                        break
                                    h.update(chunk); size += len(chunk)
                                    if out:
                                        out.write(chunk)
                        finally:
                            if out:
                                out.close()
                        expected = components[member.name]
                        if expected != {'sha256': h.hexdigest(), 'bytes': size}:
                            raise BackupError('COMPONENT_CHECKSUM_FAILED')
                c = sqlite3.connect((directory/'n8n.sqlite').as_uri() + '?mode=ro', uri=True)
                try:
                    if c.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                        raise BackupError('SQLITE_INTEGRITY_FAILED')
                    violations = len(c.execute('PRAGMA foreign_key_check').fetchall())
                    if manifest.get('sqlite') != {'integrityCheck': 'ok', 'foreignKeyViolationCount': violations}:
                        raise BackupError('SQLITE_METADATA_INVALID')
                finally:
                    c.close()
                # No -d/--dbname: output SQL is discarded; PostgreSQL is never written.
                self._run([self.config['pgRestorePath'], '--file=/dev/null', str(directory/'postgres.dump')], stdout=subprocess.DEVNULL)
                return {'verified': True, 'manifest': manifest}
        except BackupError:
            raise
        except (OSError, EOFError, tarfile.TarError, sqlite3.Error, ValueError, TypeError, KeyError):
            raise BackupError('ARCHIVE_VERIFICATION_FAILED') from None

    def _inventory(self, kind):
        pattern = DAILY if kind == 'daily' else WEEKLY
        result = []
        for path in (self.root / kind).iterdir():
            match = pattern.fullmatch(path.name)
            if not match:
                continue
            with _open_regular(path):
                pass
            result.append(path)
        return sorted(result)

    def _validate_inventory(self, kind):
        paths = self._inventory(kind)
        pattern = DAILY if kind == 'daily' else WEEKLY
        for path in paths:
            manifest = self.verify_archive(path)['manifest']
            recorded = manifest['day'] if kind == 'daily' else manifest['isoWeek']
            if pattern.fullmatch(path.name).group(1) != recorded:
                raise BackupError('ARCHIVE_IDENTITY_INVALID')
        return paths

    def _promote_and_rotate(self, daily, manifest):
        weekly = self.root/'weekly'/('backup-' + manifest['isoWeek'] + '.tar.gz')
        _no_symlink(weekly)
        if not weekly.exists():
            # Link only immutable verified files, never truncate/rewrite them.
            try:
                os.link(daily, weekly, follow_symlinks=False)
            except OSError:
                # Cross-filesystem deployment fallback stays private and atomic.
                descriptor, temp = tempfile.mkstemp(prefix='.weekly-', dir=weekly.parent)
                try:
                    with os.fdopen(descriptor, 'wb') as dst, _open_regular(daily) as src:
                        os.fchmod(dst.fileno(), 0o600)
                        shutil.copyfileobj(src, dst, CHUNK); dst.flush(); os.fsync(dst.fileno())
                    self.verify_archive(Path(temp))
                    os.replace(temp, weekly)
                finally:
                    if os.path.exists(temp):
                        os.unlink(temp)
            _fsync_directory(weekly.parent)
        # All managed copies must verify before any old copy is removed.
        dailies = self._validate_inventory('daily')
        weeklies = self._validate_inventory('weekly')
        for paths, keep in [(dailies, self.config['dailyKeep']), (weeklies, self.config['weeklyKeep'])]:
            for path in paths[:-keep]:
                with _open_regular(path):
                    pass
                path.unlink()
                _fsync_directory(path.parent)
        return min(len(dailies), self.config['dailyKeep']), min(len(weeklies), self.config['weeklyKeep'])

    def _perform_backup(self):
        daily = self.root/'daily'/('backup-' + self.now.date().isoformat() + '.tar.gz')
        _no_symlink(daily)
        existing = daily.exists()
        if existing:
            manifest = self.verify_archive(daily)['manifest']
            if manifest['day'] != self.now.date().isoformat():
                raise BackupError('ARCHIVE_IDENTITY_INVALID')
        else:
            usage, _ = self._disk()
            previous_raw = self.state.get('lastVerifiedRawBytes', 0)
            if type(previous_raw) is not int or previous_raw < 0:
                raise BackupError('STATE_INVALID')
            required_free = max(self.config['minimumFreeBytes'], 3 * previous_raw + self.config['minimumFreeBytes'])
            if usage.free < required_free:
                raise BackupError('DISK_SPACE_INSUFFICIENT')
            with tempfile.TemporaryDirectory(prefix='.staging-', dir=self.root) as temp:
                stage = Path(temp); os.chmod(stage, 0o700)
                self._components(stage)
                archived = self._archive(stage)
                manifest = self.verify_archive(archived)['manifest']
                os.replace(archived, daily)
                _fsync_directory(daily.parent)
        daily_count, weekly_count = self._promote_and_rotate(daily, manifest)
        return {'status': 'ok', 'archive': daily.name, 'verified': True, 'existingVerified': existing, 'dailyCopies': daily_count, 'weeklyCopies': weekly_count, 'rawBytes': sum(v['bytes'] for v in manifest['components'].values())}

    def run(self):
        self._notification_attempts = set()
        lock = None
        locked = False
        try:
            self._prepare()
            path = _no_symlink(self.root/'.backup.lock')
            descriptor = os.open(str(path), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                os.close(descriptor); raise BackupError('LOCK_INVALID')
            lock = os.fdopen(descriptor, 'r+')
            os.fchmod(descriptor, 0o600)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
            except BlockingIOError:
                return {'status': 'skipped', 'reason': 'locked'}
            self._load_state()
            self._disk_alert()
            result = self._perform_backup()
            self.state['backupFailure'] = {'active': False, 'notified': False, 'pending': False}
            self.state['lastStatus'] = 'ok'
            self.state['lastVerifiedRawBytes'] = result['rawBytes']
            self.state['lastVerifiedDay'] = self.now.date().isoformat()
            self.state['lastVerifiedAt'] = self.now.isoformat()
            _, used = self._disk_alert()
            result.update({'diskUsedPercent': round(used, 2), 'diskAlertPending': self.state['diskAlarm'].get('pending', False)})
            self._save_state()
            return result
        except Exception as error:
            code = str(error) if isinstance(error, BackupError) else 'BACKUP_OPERATION_FAILED'
            if locked and self.ready:
                try:
                    self.state['lastStatus'] = 'failed'
                    self.state['lastErrorCode'] = code
                    self._backup_failure_alert()
                    self._disk_alert()
                    self._save_state()
                except Exception:
                    pass
            else:
                self._notify({'type': 'backup-failed'})
            return {'status': 'failed', 'code': code, 'backupAlertPending': self.state.get('backupFailure', {}).get('pending', True), 'diskAlertPending': self.state.get('diskAlarm', {}).get('pending', False)}
        finally:
            if lock:
                if locked:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
                lock.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Verified private backups')
    parser.add_argument('--config', default='/etc/finanzas-backup/config.json')
    parser.add_argument('--verify')
    args = parser.parse_args(argv)
    os.umask(0o077)
    def interrupted(_signum, _frame):
        raise BackupError('BACKUP_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        with _open_regular(Path(args.config)) as f:
            config = json.load(f)
        engine = BackupEngine(config)
        if args.verify:
            engine.verify_archive(Path(args.verify))
            result = {'status': 'ok', 'verified': True}
        else:
            result = engine.run()
        print(json.dumps(result, sort_keys=True))
        return 1 if result['status'] == 'failed' else 0
    except Exception:
        print(json.dumps({'status': 'failed', 'code': 'BACKUP_CONFIGURATION_OR_VERIFICATION_FAILED'}))
        return 1

if __name__ == '__main__':
    sys.exit(main())
