const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCli } = require('../classify-fintoc-history');

const DIGEST = 'a'.repeat(64);
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finanzas-fintoc-classify-fixture-')); fs.chmodSync(directory, 0o700); });
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function fixture() {
  const service = { preview: jest.fn().mockResolvedValue({ version: 1, digest: DIGEST, summary: { classify: 1, leave: 0 }, actions: [{ checkingId: 'checking_private_fixture', decision: 'classify' }] }),
    apply: jest.fn().mockResolvedValue({ status: 'success', digest: DIGEST, summary: { classify: 1, leave: 0 }, actions: [{ checkingId: 'checking_private_fixture' }], classified: 1, left: 0 }) };
  const logs = [];
  const createService = jest.fn(() => service);
  return { service, logs, createService, options: { env: { FINTOC_OWNER_USER_ID: 'owner-fixture' }, createService, print: value => logs.push(value) } };
}
test('preview exclusively creates a private plan while console omits IDs/details', async () => {
  const f = fixture(), filename = path.join(directory, 'plan.json');
  expect(await runCli({ ...f.options, args: ['--preview', filename] })).toBe(0);
  expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  expect(JSON.parse(fs.readFileSync(filename, 'utf8')).actions[0].checkingId).toBe('checking_private_fixture');
  expect(f.service.preview).toHaveBeenCalledWith('owner-fixture');
  expect(f.logs.join('')).not.toContain('checking_private_fixture');
});
test('an existing plan cannot be overwritten', async () => {
  const f = fixture(), filename = path.join(directory, 'plan.json');
  fs.writeFileSync(filename, 'existing private plan', { mode: 0o600 });
  expect(await runCli({ ...f.options, args: ['--preview', filename] })).toBe(1);
  expect(fs.readFileSync(filename, 'utf8')).toBe('existing private plan');
  expect(f.createService).not.toHaveBeenCalled();
});
test('apply uses only a private reviewed digest and hides raw actions', async () => {
  const f = fixture(), filename = path.join(directory, 'plan.json');
  fs.writeFileSync(filename, JSON.stringify({ version: 1, digest: DIGEST, maliciousActions: [{ amount: 'do not trust' }] }), { mode: 0o600 });
  expect(await runCli({ ...f.options, args: ['--apply', filename] })).toBe(0);
  expect(f.service.apply).toHaveBeenCalledWith('owner-fixture', { digest: DIGEST });
  expect(f.logs.join('')).not.toContain('checking_private_fixture');
});
test.each([[], ['--apply'], ['--unsafe', '/tmp/plan.json'], ['--preview', 'relative.json']].map(args => ({ args })))('invalid invocation %o is rejected before service creation', async ({ args }) => {
  const f = fixture();
  expect(await runCli({ ...f.options, args })).toBe(1);
  expect(f.createService).not.toHaveBeenCalled();
});
test('group-readable directory cannot hold bank plans', async () => {
  const f = fixture(); fs.chmodSync(directory, 0o750);
  expect(await runCli({ ...f.options, args: ['--preview', path.join(directory, 'plan.json')] })).toBe(1);
  expect(f.createService).not.toHaveBeenCalled();
});
test('plans inside the repository are rejected', async () => {
  const f = fixture();
  expect(await runCli({ ...f.options, args: ['--preview', path.resolve(__dirname, '../../../plan-fixture.json')] })).toBe(1);
  expect(f.createService).not.toHaveBeenCalled();
});
test('apply rejects a plan readable by other users', async () => {
  const f = fixture(), filename = path.join(directory, 'plan.json');
  fs.writeFileSync(filename, JSON.stringify({ version: 1, digest: DIGEST }), { mode: 0o644 });
  expect(await runCli({ ...f.options, args: ['--apply', filename] })).toBe(1);
  expect(f.createService).not.toHaveBeenCalled();
});
test('apply refuses a symbolic link even inside a private directory', async () => {
  const f = fixture(), target = path.join(directory, 'target.json'), filename = path.join(directory, 'plan.json');
  fs.writeFileSync(target, JSON.stringify({ version: 1, digest: DIGEST }), { mode: 0o600 }); fs.symlinkSync(target, filename);
  expect(await runCli({ ...f.options, args: ['--apply', filename] })).toBe(1);
  expect(f.createService).not.toHaveBeenCalled();
});
test('malformed file is rejected and raw failures never reach output', async () => {
  const f = fixture(), filename = path.join(directory, 'plan.json');
  fs.writeFileSync(filename, 'PRIVATE bank description secret', { mode: 0o600 });
  expect(await runCli({ ...f.options, args: ['--apply', filename] })).toBe(1);
  expect(f.logs.join('')).not.toContain('PRIVATE');
});
test('service failure prints only a safe code', async () => {
  const f = fixture(); f.service.preview.mockRejectedValue(new Error('PRIVATE key or account description'));
  expect(await runCli({ ...f.options, args: ['--preview', path.join(directory, 'plan.json')] })).toBe(1);
  expect(f.logs.join('')).not.toContain('PRIVATE');
});
