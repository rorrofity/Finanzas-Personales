#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
function invalidInvocation() {
  const error = new Error('Invalid private classification invocation');
  error.code = 'FINTOC_CLASSIFICATION_INVALID_INVOCATION';
  return error;
}
function privateFilename(filename, mode) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw invalidInvocation();
  const parent = fs.realpathSync(path.dirname(filename));
  const repository = fs.realpathSync(ROOT);
  if (parent === repository || parent.startsWith(repository + path.sep)) throw invalidInvocation();
  const directory = fs.statSync(parent);
  if (!directory.isDirectory() || (directory.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && directory.uid !== process.getuid())) throw invalidInvocation();
  const resolved = path.join(parent, path.basename(filename));
  if (mode === '--preview') {
    try { fs.lstatSync(resolved); throw invalidInvocation(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  } else {
    const file = fs.lstatSync(resolved);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0
      || (typeof process.getuid === 'function' && file.uid !== process.getuid())) throw invalidInvocation();
  }
  return resolved;
}
function safeSummary(result, status) {
  return { status, digest: result.digest, summary: result.summary,
    ...(status === 'success' ? { classified: result.classified, left: result.left } : {}) };
}

/** Injectable CLI entry point. Requiring this module never loads .env or a DB. */
async function runCli({ args = process.argv.slice(2), env = process.env, createService, print = console.log } = {}) {
  let database;
  try {
    if (args.length !== 2 || !['--preview', '--apply'].includes(args[0])) throw invalidInvocation();
    const [mode, requestedFilename] = args;
    const filename = privateFilename(requestedFilename, mode);
    let reviewed;
    if (mode === '--apply') {
      reviewed = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (reviewed?.version !== 1 || typeof reviewed.digest !== 'string' || !/^[a-f0-9]{64}$/.test(reviewed.digest)) throw invalidInvocation();
    }
    let service;
    if (createService) service = createService();
    else {
      require('dotenv').config({ path: path.join(ROOT, '.env') });
      database = require('../config/database');
      const { createFintocHistoryClassificationService } = require('../services/fintocHistoryClassificationService');
      service = createFintocHistoryClassificationService({ db: database, env });
    }
    if (mode === '--preview') {
      const plan = await service.preview(env.FINTOC_OWNER_USER_ID);
      // The directory is private, and O_EXCL/O_NOFOLLOW also protect against an
      // accidental overwrite or a symlink introduced after the initial check.
      const descriptor = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify(plan, null, 2) + '\n'); }
      finally { fs.closeSync(descriptor); }
      print(JSON.stringify(safeSummary(plan, 'preview')));
    } else {
      // File actions are informational: execution trusts only its digest and
      // derives every financial decision anew under the database lock.
      const result = await service.apply(env.FINTOC_OWNER_USER_ID, { digest: reviewed.digest });
      print(JSON.stringify(safeSummary(result, 'success')));
    }
    return 0;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^FINTOC_CLASSIFICATION_[A-Z_]+$/.test(error.code)
      ? error.code : 'FINTOC_CLASSIFICATION_CLI_ERROR';
    print(JSON.stringify({ status: 'error', code }));
    return 1;
  } finally {
    if (database) await database.pool.end().catch(() => {});
  }
}

if (require.main === module) runCli().then(code => { process.exitCode = code; });
module.exports = { runCli };
