#!/usr/bin/env python3
"""Real PostgreSQL backup/restore integration against a disposable isolated cluster.

Linux/root only. Never reads application .env, connects to production, sends push,
starts Docker or restores a database outside the cluster created by this process.
Optional real-backup validation reads an existing private archive and expected
hashes only; all restored copies are confined to and removed with that cluster.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile


SNAPSHOT_SQL = """
SELECT json_build_object(
 'categories',(SELECT json_agg(t ORDER BY id) FROM categories t),
 'expenses',(SELECT json_agg(t ORDER BY id) FROM expenses t)
)::text;
"""
SEED_SQL = """
CREATE TABLE categories(id integer PRIMARY KEY,name text NOT NULL);
CREATE TABLE expenses(id integer PRIMARY KEY,posted date NOT NULL,amount numeric(12,2) NOT NULL,category_id integer REFERENCES categories(id),note text,payload bytea);
INSERT INTO categories VALUES(1,'Fixture groceries'),(2,'Fixture transport');
INSERT INTO expenses VALUES
 (1,'2026-10-28',12345.67,1,'Fictitious café',decode('0001ff','hex')),
 (2,'2026-10-29',890.00,2,NULL,decode('deadbeef','hex')),
 (3,'2026-10-30',56.78,NULL,'Fictitious uncategorized',NULL);
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default='/usr/lib/postgresql/14/bin')
    parser.add_argument('--restore-archive')
    parser.add_argument('--expected-snapshot')
    parser.add_argument('--snapshot-sql')
    args = parser.parse_args(argv)
    real_flags = [args.restore_archive, args.expected_snapshot, args.snapshot_sql]
    if any(real_flags) and not all(real_flags):
        print(json.dumps({'status': 'failed', 'code': 'REAL_RESTORE_FLAGS_MUST_BE_COMPLETE'}))
        return 1
    phase = 'preconditions'
    base = None
    started = False
    success = False
    outcome = None
    fixture_env = None
    data = None
    pg_bin = Path(args.pg_bin).resolve()
    os.umask(0o077)

    def command(arguments, *, env=None, input=None, as_postgres=False, allow_failure=False):
        if as_postgres:
            arguments = ['/usr/sbin/runuser', '-u', 'postgres', '--', *map(str, arguments)]
        result = subprocess.run(list(map(str, arguments)), input=input, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, cwd=str(base), env=env or fixture_env,
                                timeout=90, check=False)
        if result.returncode and not allow_failure:
            raise RuntimeError('FIXTURE_COMMAND_FAILED')
        return result

    def sql(database, statement, readonly=False):
        return command([pg_bin/'psql', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
                        '--set=ON_ERROR_STOP=1', '--host', socket, '--port', str(port),
                        '--username', 'postgres', '--dbname', database],
                       input=statement.encode('utf-8'),
                       env=dict(fixture_env, PGOPTIONS='-c default_transaction_read_only=on') if readonly else fixture_env).stdout.strip()

    try:
        if sys.platform != 'linux' or os.geteuid() != 0:
            raise RuntimeError('LINUX_ROOT_REQUIRED')
        postgres = pwd.getpwnam('postgres')
        for executable in ['initdb', 'pg_ctl', 'createdb', 'psql', 'pg_dump', 'pg_restore']:
            if not (pg_bin/executable).is_file() or not os.access(pg_bin/executable, os.X_OK):
                raise RuntimeError('POSTGRES_TOOLS_REQUIRED')
        if not Path('/usr/sbin/runuser').is_file():
            raise RuntimeError('RUNUSER_REQUIRED')
        base = Path(tempfile.mkdtemp(prefix='finanzas-backup-integration-', dir='/tmp')).resolve()
        if not re.fullmatch(r'/tmp/finanzas-backup-integration-[A-Za-z0-9_-]+', str(base)):
            raise RuntimeError('UNSAFE_FIXTURE_PATH')
        os.chmod(base, 0o700)
        os.chown(base, postgres.pw_uid, postgres.pw_gid)
        data = base/'cluster'
        socket = base/'socket'
        socket.mkdir(mode=0o700)
        os.chown(socket, postgres.pw_uid, postgres.pw_gid)
        port = 20000 + secrets.randbelow(30000)
        # Scrub every PG/DB setting. Explicit private socket + no TCP prohibit
        # fallback to the normal server, inherited credentials or application DB.
        fixture_env = {k: v for k, v in os.environ.items()
                       if not k.startswith('PG') and not k.startswith('DB_')}
        fixture_env.update({'PGHOST': str(socket), 'PGPORT': str(port),
                            'PGDATABASE': 'fixture_source', 'PGUSER': 'postgres',
                            'PGPASSWORD': '', 'PGCONNECT_TIMEOUT': '10',
                            'PGAPPNAME': 'finanzas-disposable-backup-integration'})
        phase = 'initialize-isolated-cluster'
        command([pg_bin/'initdb', '--pgdata', data, '--auth-local=trust',
                 '--auth-host=reject', '--encoding=UTF8', '--locale=C'], as_postgres=True)
        phase = 'start-private-unix-socket'
        options = "-c listen_addresses='' -c unix_socket_directories='%s' -c port=%s -c fsync=on" % (socket, port)
        # Treat startup as potentially live before invoking pg_ctl so a timeout
        # or partial startup still enters controlled shutdown in finally.
        started = True
        command([pg_bin/'pg_ctl', '--pgdata', data, '--log', base/'postgres-private.log',
                 '--options', options, '--wait', 'start'], as_postgres=True)
        # The settings are checked on this exact socket before any fixture data.
        assert sql('postgres', 'SHOW listen_addresses;') == b''
        assert sql('postgres', 'SHOW unix_socket_directories;').decode() == str(socket)
        phase = 'seed-fictitious-source'
        command([pg_bin/'createdb', '--host', socket, '--port', str(port),
                 '--username', 'postgres', 'fixture_source'])
        sql('fixture_source', SEED_SQL)
        before = sql('fixture_source', SNAPSHOT_SQL)
        source = base/'n8n-fixture.sqlite'
        c = sqlite3.connect(source)
        c.executescript('PRAGMA journal_mode=WAL; CREATE TABLE fixture(id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT, payload BLOB); CREATE INDEX fixture_note ON fixture(note);')
        c.executemany('INSERT INTO fixture(note,payload) VALUES(?,?)', [('fictitious', b'\x00\xff'), (None, None), ('fixture café', b'\x01\x02')])
        c.commit()
        sqlite_rows = c.execute('SELECT id,note,payload FROM fixture ORDER BY id').fetchall()
        c.close()
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        private = base/'fixture-config.json'
        private.write_text(json.dumps({'encryptionKey': 'fictitious-key-for-disposable-test'}))
        fake_docker = base/'fake-docker'
        fake_docker.write_text('#!/usr/bin/python3\nimport json\nprint(json.dumps([{\"Config\":{\"Image\":\"n8n:fixture\",\"Env\":[\"N8N_ENCRYPTION_KEY=fictitious\"]},\"Mounts\":[]}]))\n')
        fake_docker.chmod(0o700)
        fake_notify = base/'fake-notify.py'
        fake_notify.write_text('import json,sys\njson.load(sys.stdin)\nprint(json.dumps({\"delivered\":True}))\n')
        config = {'schemaVersion': 1, 'appRoot': str(base), 'backupRoot': str(base/'managed'),
                  'n8nDatabase': str(source), 'n8nContainer': 'fictitious-container',
                  'privateFiles': {'n8n-config.json': str(private)},
                  'dailyKeep': 7, 'weeklyKeep': 4, 'diskThresholdPercent': 85,
                  'minimumFreeBytes': 1024*1024,
                  'pgDumpPath': str(pg_bin/'pg_dump'), 'pgRestorePath': str(pg_bin/'pg_restore'),
                  'dockerPath': str(fake_docker), 'notifyCommand': ['/usr/bin/python3', str(fake_notify)]}
        module_path = Path(__file__).resolve().parents[1]/'daily_backup.py'
        spec = importlib.util.spec_from_file_location('isolated_daily_backup', module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        readonly_env = dict(fixture_env, PGOPTIONS='-c default_transaction_read_only=on')
        calls = []

        def fixture_runner(arguments, **kwargs):
            # No production host/database and no app dotenv can be consulted.
            assert readonly_env['PGHOST'] == str(socket)
            assert readonly_env['PGDATABASE'] == 'fixture_source'
            assert str(socket).startswith(str(base)+'/')
            if Path(arguments[0]).name in ['pg_dump', 'pg_restore']:
                assert '--dbname' not in arguments and '-d' not in arguments
                assert not any(str(a).startswith('--dbname=') for a in arguments)
            calls.append(Path(arguments[0]).name)
            kwargs['env'] = readonly_env
            kwargs['cwd'] = str(base)
            return subprocess.run(arguments, **kwargs)

        phase = 'backup-real-postgres-fictitious-data'
        engine = module.BackupEngine(config, runner=fixture_runner)
        result = engine.run()
        assert result['status'] == 'ok' and result['verified']
        archive = Path(config['backupRoot'])/'daily'/result['archive']
        phase = 'verify-compressed-archive'
        assert engine.verify_archive(archive)['verified']
        phase = 'same-day-idempotence'
        repeated = module.BackupEngine(config, runner=fixture_runner).run()
        assert repeated['status'] == 'ok' and repeated['existingVerified']
        assert calls.count('pg_dump') == 1
        assert sql('fixture_source', SNAPSHOT_SQL) == before
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        extracted = base/'extracted-fixture.dump'
        extracted_sqlite = base/'extracted-fixture.sqlite'
        with tarfile.open(archive, 'r:gz') as bundle:
            for member_name, destination in [('postgres.dump', extracted), ('n8n.sqlite', extracted_sqlite)]:
                member = bundle.getmember(member_name)
                assert member.isfile() and member.name == member_name
                with destination.open('xb') as dst, bundle.extractfile(member) as src:
                    os.fchmod(dst.fileno(), 0o600)
                    shutil.copyfileobj(src, dst)
        copied = sqlite3.connect(extracted_sqlite.as_uri()+'?mode=ro', uri=True)
        assert copied.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert copied.execute('SELECT id,note,payload FROM fixture ORDER BY id').fetchall() == sqlite_rows
        copied.close()
        phase = 'restore-only-second-isolated-database'
        command([pg_bin/'createdb', '--host', socket, '--port', str(port),
                 '--username', 'postgres', 'fixture_restored'])
        command([pg_bin/'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
                 '--host', socket, '--port', str(port), '--username', 'postgres',
                 '--dbname', 'fixture_restored', extracted])
        assert sql('fixture_restored', SNAPSHOT_SQL) == before
        assert sql('fixture_source', SNAPSHOT_SQL) == before
        assert sql('fixture_restored', 'SELECT count(*) FROM expenses;') == b'3'
        real_verified = False
        if all(real_flags):
            phase = 'validate-real-restore-inputs'
            real_archive = Path(args.restore_archive)
            expected_path = Path(args.expected_snapshot)
            sql_path = Path(args.snapshot_sql)
            assert real_archive.is_absolute() and expected_path.is_absolute() and sql_path.is_absolute()
            expected = json.loads(expected_path.read_text())
            expected_financial = expected['financial']
            assert isinstance(expected_financial, dict) and len(expected_financial) == 11
            snapshot_sql = sql_path.read_text().strip()
            # Trusted root-owned SELECT file only; execute it with READ ONLY on
            # the isolated restored copy, never on an application database.
            assert len(snapshot_sql) < 1024 * 1024
            assert snapshot_sql.startswith('SELECT json_build_object(')
            assert ';' not in snapshot_sql.rstrip(';')
            assert not re.search(r'\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|COPY|CALL|DO|EXECUTE|GRANT|REVOKE|TRUNCATE|VACUUM)\b', snapshot_sql, re.I)
            phase = 'verify-real-backup-in-private-fixture'
            assert engine.verify_archive(real_archive)['verified']
            real_dump = base/'real-backup-copy.dump'
            with tarfile.open(real_archive, 'r:gz') as bundle:
                member = bundle.getmember('postgres.dump')
                assert member.isfile() and member.name == 'postgres.dump'
                with real_dump.open('xb') as dst, bundle.extractfile(member) as src:
                    os.fchmod(dst.fileno(), 0o600)
                    shutil.copyfileobj(src, dst)
            phase = 'restore-real-backup-only-third-isolated-database'
            command([pg_bin/'createdb', '--host', socket, '--port', str(port),
                     '--username', 'postgres', 'fixture_real_restored'])
            command([pg_bin/'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
                     '--host', socket, '--port', str(port), '--username', 'postgres',
                     '--dbname', 'fixture_real_restored', real_dump])
            phase = 'compare-real-restored-financial-hashes'
            restored_financial = json.loads(sql('fixture_real_restored', snapshot_sql, readonly=True))
            for table in ['imports', 'credit_cards']:
                query = "SELECT COALESCE(json_object_agg(id::text,md5(row_to_json(t)::text)),'{}'::json) FROM %s t;" % table
                restored_financial[table] = json.loads(sql('fixture_real_restored', query, readonly=True))
            assert len(restored_financial) == 11
            assert restored_financial == expected_financial
            assert sql('fixture_source', SNAPSHOT_SQL) == before
            real_verified = True
        outcome = {'status': 'ok', 'fictitiousPostgresExpenseRows': 3,
                   'fictitiousPostgresCategories': 2, 'fictitiousSQLiteRows': 3,
                   'realPgDumpAndRestore': True, 'restoredFixtureExactlyMatches': True,
                   'sourceFixturesUnchanged': True, 'sameDayIdempotent': True,
                   'privateUnixSocketOnly': True, 'productionAccess': False,
                   'realNotificationsSent': False}
        if real_verified:
            outcome.update({'realArchiveRestoreVerified': True, 'financialTablesCompared': 11,
                            'realRestoredCopyRemovedWithFixture': True})
        success = True
    except Exception:
        outcome = {'status': 'failed', 'code': 'ISOLATED_POSTGRES_INTEGRATION_FAILED', 'phase': phase}
    finally:
        if started:
            try:
                phase = 'cleanup-isolated-cluster'
                stopped = command([pg_bin/'pg_ctl', '--pgdata', data, '--mode=fast', '--wait', 'stop'],
                                  as_postgres=True, allow_failure=True)
                if stopped.returncode:
                    stopped = command([pg_bin/'pg_ctl', '--pgdata', data, '--mode=immediate', '--wait', 'stop'],
                                      as_postgres=True, allow_failure=True)
                status = command([pg_bin/'pg_ctl', '--pgdata', data, 'status'], as_postgres=True, allow_failure=True)
                if status.returncode != 3:
                    raise RuntimeError('FIXTURE_SHUTDOWN_NOT_CONFIRMED')
                started = False
            except Exception:
                success = False
                outcome = {'status': 'failed', 'code': 'ISOLATED_CLUSTER_CLEANUP_FAILED'}
        if base and not started:
            try:
                shutil.rmtree(base)
            except Exception:
                success = False
                outcome = {'status': 'failed', 'code': 'ISOLATED_FIXTURE_CLEANUP_FAILED'}
        if success:
            outcome['isolatedClusterRemoved'] = True
    print(json.dumps(outcome, sort_keys=True))
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
