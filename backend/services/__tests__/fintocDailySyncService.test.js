const { createFintocDailySyncService, planReconciliation } = require('../fintocDailySyncService');

const OWNER = 'owner-one';
const ACCOUNT = 'acc_example';
const item = (id, patch = {}) => ({ externalId: id, date: '2026-11-02', description: 'Compra del barrio', type: 'cargo', amount: '12500', status: 'confirmed', pending: false, ...patch });
const local = (id, patch = {}) => ({ id, fecha: '2026-11-02', descripcion: 'Compra del barrio', tipo: 'cargo', amount: '12500.00', ...patch });
const prior = (id, patch = {}) => ({ external_id: id, fecha: '2026-11-02', descripcion: 'Compra del barrio', tipo: 'cargo', amount: '12500', status: 'confirmed', pending: false, disposition: 'inserted', checking_transaction_id: 'local-a', had_financial_reference: true, created_checking: true, reason: null, ...patch });
const plan = (patch = {}) => planReconciliation({ items: [item('mov_a')], existing: [], legacy: [], cutoverDate: '2026-11-01', today: '2026-11-02', baseline: false, coverage: { since: '2026-09-01', until: '2026-11-02' }, ...patch });

describe('append-only Fintoc reconciliation', () => {
  test('baseline unmatched movements never insert history', () => {
    expect(plan({ baseline: true }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'initial_unmatched', insertFinancial: false }]);
  });
  test('baseline links a unique exact legacy match without changing any data', () => {
    const legacy = [local('local-a', { category_id: 7, notas: 'Conservar', created_at: 'original' })];
    const before = JSON.stringify(legacy);
    expect(plan({ baseline: true, legacy }).actions).toMatchObject([{ disposition: 'linked', checkingTransactionId: 'local-a', insertFinancial: false }]);
    expect(JSON.stringify(legacy)).toBe(before);
  });
  test('baseline duplicate legacy candidates remain for review', () => {
    expect(plan({ baseline: true, legacy: [local('a'), local('b')] }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'ambiguous_match', candidateCount: 2 }]);
  });
  test('new confirmed post-cutover movement is eligible for one new unclassified row', () => {
    expect(plan().actions).toMatchObject([{ disposition: 'inserted', insertFinancial: true }]);
  });
  test('two distinct identical IDs preserve multiplicity', () => {
    const result = plan({ items: [item('mov_a'), item('mov_b')] });
    expect(result.actions.filter(action => action.insertFinancial)).toHaveLength(2);
  });
  test('an already mapped invariant present ID does not consume the second legitimate movement', () => {
    const result = plan({ items: [item('mov_a'), item('mov_b')], existing: [prior('mov_a')], legacy: [local('local-a')] });
    expect(result.actions.find(action => action.item.externalId === 'mov_b')).toMatchObject({ insertFinancial: true });
    expect(result.actions.find(action => action.item.externalId === 'mov_a')).toMatchObject({ insertFinancial: false, disposition: 'inserted' });
  });
  test('replaying an existing ID never reinserts or updates its Checking row', () => {
    expect(plan({ existing: [prior('mov_a')], legacy: [local('local-a')] }).actions).toMatchObject([{ insertFinancial: false, disposition: 'inserted' }]);
  });
  test('provider correction is a discrepancy, preserving its financial reference', () => {
    expect(plan({ items: [item('mov_a', { amount: '15000' })], existing: [prior('mov_a')], legacy: [local('local-a')] }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'provider_changed', checkingTransactionId: 'local-a', insertFinancial: false }]);
  });
  test('reversal and replacement cannot create a duplicate expense', () => {
    const result = plan({ items: [item('mov_a', { status: 'reversed' }), item('mov_b')], existing: [prior('mov_a')], legacy: [local('local-a')] });
    expect(result.actions.every(action => !action.insertFinancial)).toBe(true);
    expect(result.actions.find(action => action.item.externalId === 'mov_a').reason).toBe('provider_reversed');
    expect(result.actions.find(action => action.item.externalId === 'mov_b').reason).toBe('ambiguous_match');
  });
  test('missing ID and identical replacement remain ambiguous', () => {
    const result = plan({ items: [item('mov_b')], existing: [prior('mov_a')], legacy: [local('local-a')] });
    expect(result.missing).toMatchObject([{ external_id: 'mov_a' }]);
    expect(result.actions).toMatchObject([{ disposition: 'needs_review', reason: 'ambiguous_match', insertFinancial: false }]);
  });
  test('deleted financial references are never resurrected', () => {
    expect(plan({ existing: [prior('mov_a', { checking_transaction_id: null })] }).actions).toMatchObject([{ reason: 'financial_record_removed', insertFinancial: false }]);
  });
  test('a deleted mapped expense remains a blocker when the provider reissues its ID', () => {
    const deleted = prior('mov_original', { checking_transaction_id: null });
    const result = plan({ items: [item('mov_reissued')], existing: [deleted], legacy: [] });
    expect(result.actions).toMatchObject([{ disposition: 'needs_review', reason: 'ambiguous_match', candidateCount: 1, insertFinancial: false }]);
    expect(result.missing).toMatchObject([{ external_id: 'mov_original' }]);
  });
  test('a deleted reference also prevents automatically linking its reissue to a new manual row', () => {
    const deleted = prior('mov_original', { checking_transaction_id: null });
    expect(plan({ items: [item('mov_reissued')], existing: [deleted], legacy: [local('manual')] }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'ambiguous_match', checkingTransactionId: null, insertFinancial: false }]);
  });
  test('a deleted reference preserves its financial signature after provider metadata changes', () => {
    const deleted = prior('mov_original', { checking_transaction_id: null, amount: '15000', reason: 'provider_changed', disposition: 'needs_review',
      financial_snapshot: { date: '2026-11-02', description: 'Compra del barrio', type: 'cargo', amount: '12500' } });
    expect(plan({ items: [item('mov_reissued')], existing: [deleted], legacy: [] }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'ambiguous_match', insertFinancial: false }]);
  });
  test.each(['2026-11-01', '2026-10-31'])('late arrival %s is retained for review', date => {
    expect(plan({ items: [item('mov_a', { date })] }).actions).toMatchObject([{ reason: 'before_cutover', insertFinancial: false }]);
  });
  test('future movement is held rather than inserted', () => {
    expect(plan({ items: [item('mov_a', { date: '2026-11-03' })] }).actions).toMatchObject([{ reason: 'future_date', insertFinancial: false }]);
  });
  test('amount beyond Checking NUMERIC(14,2) is held for review', () => {
    expect(plan({ items: [item('mov_a', { amount: '1000000000000' })] }).actions).toMatchObject([{ reason: 'amount_out_of_range', insertFinancial: false }]);
  });
  test('broad candidates within three dates prevent silent duplicates', () => {
    expect(plan({ legacy: [local('manual', { fecha: '2026-10-31', descripcion: 'Descripción distinta de cartola' })] }).actions).toMatchObject([{ reason: 'ambiguous_match', candidateCount: 1, insertFinancial: false }]);
  });
  test('older pending can link to a unique newly loaded legacy row', () => {
    const old = prior('mov_a', { disposition: 'needs_review', reason: 'initial_unmatched', checking_transaction_id: null, had_financial_reference: false, created_checking: false });
    expect(plan({ existing: [old], legacy: [local('manual')] }).actions).toMatchObject([{ disposition: 'linked', checkingTransactionId: 'manual', insertFinancial: false }]);
  });
  test('repeating an unresolved baseline preserves its reason without inventing candidates', () => {
    const old = prior('mov_a', { disposition: 'needs_review', reason: 'initial_unmatched', checking_transaction_id: null, had_financial_reference: false, created_checking: false });
    expect(plan({ existing: [old] }).actions).toMatchObject([{ disposition: 'needs_review', reason: 'initial_unmatched', candidateCount: 0, insertFinancial: false }]);
  });
  test('unconfirmed observations never become expenses', () => {
    expect(plan({ items: [item('mov_a', { status: 'processing', pending: true })] }).actions).toMatchObject([{ disposition: 'observed', reason: 'not_confirmed', insertFinancial: false }]);
  });
  test('an observed pending without a financial reference is imported when confirmed after cutover', () => {
    const old = prior('mov_a', { status: 'processing', pending: true, disposition: 'observed', reason: 'not_confirmed', checking_transaction_id: null, had_financial_reference: false, created_checking: false });
    expect(plan({ existing: [old] }).actions).toMatchObject([{ disposition: 'inserted', reason: null, insertFinancial: true }]);
  });
  test('pending consolidation may move post_date without correcting an existing expense', () => {
    const old = prior('mov_a', { fecha: '2026-10-31', amount: '12000', status: 'processing', pending: true, disposition: 'observed', reason: 'not_confirmed', checking_transaction_id: null, had_financial_reference: false, created_checking: false });
    expect(plan({ existing: [old] }).actions).toMatchObject([{ disposition: 'inserted', reason: null, insertFinancial: true }]);
  });
  test('pending confirmation still respects cutoff and conservative manual candidates', () => {
    const old = prior('mov_a', { status: 'processing', pending: true, disposition: 'observed', reason: 'not_confirmed', checking_transaction_id: null, had_financial_reference: false, created_checking: false });
    expect(plan({ existing: [old], items: [item('mov_a', { date: '2026-11-01' })] }).actions).toMatchObject([{ reason: 'before_cutover', insertFinancial: false }]);
    expect(plan({ existing: [old], legacy: [local('manual', { descripcion: 'Otra descripción' })] }).actions).toMatchObject([{ reason: 'ambiguous_match', insertFinancial: false }]);
  });
});

function database({ state = null, existing = [], legacy = [], failInsert = false } = {}) {
  const calls = [];
  const query = jest.fn(async (sql, params = []) => {
    calls.push({ sql, params });
    if (/SELECT.*FROM fintoc_sync_state/s.test(sql)) return { rows: state ? [state] : [] };
    if (/SELECT.*FROM fintoc_external_movements/s.test(sql)) return { rows: existing };
    if (/SELECT.*FROM checking_transactions/s.test(sql)) return { rows: legacy };
    if (/INSERT INTO checking_transactions/.test(sql)) {
      if (failInsert) throw new Error('PRIVATE storage failure');
      return { rows: [{ id: 'new-local' }] };
    }
    return { rows: [] };
  });
  const client = { query, release: jest.fn() };
  return { connect: jest.fn().mockResolvedValue(client), query, calls, client };
}
function setup(options = {}) {
  const db = database(options);
  const env = { FINTOC_ENABLED: 'true', FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'true', FINTOC_DAILY_SYNC_ENABLED: 'true', FINTOC_OWNER_USER_ID: OWNER, FINTOC_ACCOUNT_ID: ACCOUNT };
  const provider = {
    getStatus: jest.fn(() => ({ state: 'ready', mode: 'live' })),
    assertOwner: jest.fn(),
    readSnapshot: jest.fn(async (_, { year, month }) => ({ provider: 'fintoc', mode: 'live', period: { year: Number(year), month: Number(month) }, items: Number(month) === 11 ? [item('mov_a')] : [], total: Number(month) === 11 ? 1 : 0, coverage: { complete: true }, bankUpdatedAt: '2026-11-02T12:00:00.000Z' })),
  };
  const service = createFintocDailySyncService({ db, provider, env, now: () => new Date('2026-11-02T16:00:00.000Z') });
  return { service, db, provider, env };
}

describe('daily sync orchestration and transaction safety', () => {
  test('disabled by default makes no provider or DB requests', async () => {
    const { service, db, provider, env } = setup();
    delete env.FINTOC_DAILY_SYNC_ENABLED;
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'disabled', inserted: 0 });
    expect(provider.readSnapshot).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
  test('provider configuration exceptions are returned safely rather than leaking errors', async () => {
    const { service, provider } = setup();
    provider.getStatus.mockImplementation(() => { throw new Error('PRIVATE configuration data'); });
    await expect(service.run({ trigger: 'scheduled' })).resolves.toMatchObject({ status: 'error', errorCode: 'FINTOC_NOT_READY' });
  });
  test.each(['FINTOC_ENABLED', 'FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED'])('missing %s prevents any network request', async name => {
    const { service, env, provider } = setup();
    env[name] = 'false';
    expect(await service.run({ trigger: 'manual' })).toMatchObject({ status: 'disabled' });
    expect(provider.readSnapshot).not.toHaveBeenCalled();
  });
  test('test-mode data is never written to financial records', async () => {
    const { service, provider, db } = setup();
    provider.getStatus.mockReturnValue({ state: 'ready', mode: 'test' });
    expect(await service.run({ trigger: 'initial' })).toMatchObject({ status: 'disabled' });
    expect(db.connect).not.toHaveBeenCalled();
    expect(provider.readSnapshot).not.toHaveBeenCalled();
  });
  test('baseline reads three Santiago months before transaction and never inserts Checking', async () => {
    const { service, db, provider } = setup();
    expect(await service.run({ trigger: 'initial' })).toMatchObject({ status: 'success', initialized: true, inserted: 0, review: 1 });
    expect(provider.readSnapshot.mock.calls.map(call => call[1])).toEqual([{ year: '2026', month: '9' }, { year: '2026', month: '10' }, { year: '2026', month: '11' }]);
    expect(db.calls.some(call => /INSERT INTO checking_transactions/.test(call.sql))).toBe(false);
    expect(db.calls.some(call => /INSERT INTO fintoc_sync_state/.test(call.sql))).toBe(true);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
    expect(db.client.release).toHaveBeenCalled();
  });
  test('one failed provider page causes no transaction or partial persistence', async () => {
    const { service, db, provider } = setup();
    provider.readSnapshot.mockRejectedValueOnce({ code: 'FINTOC_PAYMENT_REQUIRED', message: 'PRIVATE' });
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'error', inserted: 0, errorCode: 'FINTOC_PAYMENT_REQUIRED' });
    expect(db.connect).not.toHaveBeenCalled();
    expect(JSON.stringify(db.calls)).not.toContain('PRIVATE');
  });
  test('new Checking insert uses ISO period and null classification, atomically with mapping', async () => {
    const { service, db } = setup({ state: { cutover_date: '2026-11-01' } });
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'success', inserted: 1 });
    const call = db.calls.find(entry => /INSERT INTO checking_transactions/.test(entry.sql));
    expect(call.params.slice(0, 7)).toEqual([OWNER, 2026, 11, '2026-11-02', 'Compra del barrio', 'cargo', '12500']);
    expect(call.sql).toMatch(/NULL, NULL/);
    expect(db.calls.some(entry => /INSERT INTO fintoc_external_movements/.test(entry.sql) && entry.params.includes('new-local'))).toBe(true);
    expect(db.calls.some(entry => /(?:UPDATE|DELETE FROM) checking_/i.test(entry.sql))).toBe(false);
  });
  test('an older run completing after a newer success is discarded under the owner lock', async () => {
    const { service, db } = setup({ state: { cutover_date: '2026-11-01', last_success_at: '2026-11-02T17:00:00Z', bank_updated_at: '2026-11-02T16:00:00Z' } });
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'superseded', inserted: 0, linked: 0, review: 0 });
    expect(db.calls.some(call => /(?:INSERT INTO|UPDATE |DELETE FROM)/.test(call.sql))).toBe(false);
    expect(db.calls.some(call => /FROM checking_transactions/.test(call.sql))).toBe(false);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
  });
  test('equal timestamps do not discard a legitimate retry', async () => {
    const { service } = setup({ state: { cutover_date: '2026-11-01', last_success_at: '2026-11-02T16:00:00Z' } });
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'success', inserted: 1 });
  });
  test('a late provider failure cannot supersede a newer successful run in public state', async () => {
    const { provider, env } = setup();
    let entered;
    const providerEntered = new Promise(resolve => { entered = resolve; });
    let rejectOldRead;
    provider.readSnapshot.mockImplementationOnce(() => { entered(); return new Promise((_, reject) => { rejectOldRead = reject; }); });
    let state = null;
    const runs = [];
    const db = { query: jest.fn(async (sql, params = []) => {
      if (sql.includes('INSERT INTO fintoc_sync_runs')) {
        if (!/NOT EXISTS[\s\S]*last_success_at\s*>\s*\$7/.test(sql) || !state || Date.parse(state.last_success_at) <= Date.parse(params[6])) {
          runs.push({ trigger: params[2], status: 'error', inserted: 0, linked: 0, review: 0, error_code: params[5], started_at: params[6] });
        }
      } else if (sql.includes('UPDATE fintoc_sync_state')) {
        if (!/last_success_at\s*<=\s*\$4/.test(sql) || !state.last_success_at || Date.parse(state.last_success_at) <= Date.parse(params[3])) state.last_error_code = params[2];
      } else if (sql.includes('FROM fintoc_sync_state')) return { rows: state ? [state] : [] };
      else if (sql.includes('FROM fintoc_sync_runs')) {
        const ordered = /ORDER BY started_at DESC,\s*id DESC/.test(sql) ? [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)) : [...runs].reverse();
        return { rows: ordered.slice(0, 1) };
      }
      return { rows: [] };
    }) };
    const service = createFintocDailySyncService({ db, provider, env, now: () => new Date('2026-11-02T15:00:00Z') });
    const oldRun = service.run({ trigger: 'scheduled' });
    await providerEntered;
    // A newer execution commits while the old provider request is still outstanding.
    state = { cutover_date: '2026-11-01', last_success_at: '2026-11-02T16:00:00Z', bank_updated_at: '2026-11-02T15:00:00Z', last_error_code: null };
    runs.push({ trigger: 'scheduled', status: 'success', inserted: 0, linked: 0, review: 0, error_code: null, started_at: '2026-11-02T16:00:00Z' });
    rejectOldRead({ code: 'FINTOC_TIMEOUT' });
    expect(await oldRun).toMatchObject({ status: 'error', errorCode: 'FINTOC_TIMEOUT' });
    expect(await service.getDailyStatus(OWNER)).toMatchObject({ lastSuccessAt: '2026-11-02T16:00:00.000Z', bankUpdatedAt: '2026-11-02T15:00:00.000Z', lastErrorCode: null, lastRun: { status: 'success' } });
    expect(runs).toHaveLength(1);
  });
  test('storage failure rolls back and never reports successful insertion', async () => {
    const { service, db } = setup({ state: { cutover_date: '2026-11-01' }, failInsert: true });
    expect(await service.run({ trigger: 'scheduled' })).toMatchObject({ status: 'error', inserted: 0, errorCode: 'FINTOC_DAILY_STORAGE_ERROR' });
    expect(db.calls.some(call => call.sql === 'ROLLBACK')).toBe(true);
    expect(db.client.release).toHaveBeenCalled();
  });
  test('all writes and financial candidates are scoped to configured owner and account', async () => {
    const { service, db } = setup();
    await service.run({ trigger: 'initial' });
    for (const call of db.calls.filter(entry => /FROM (?:checking_transactions|fintoc_external_movements|fintoc_sync_state)/.test(entry.sql))) {
      expect(call.params[0]).toBe(OWNER);
    }
  });
  test('daily status and review reject other actors and invalid queries before storage', async () => {
    const { service, db } = setup();
    await expect(service.getDailyStatus('other')).rejects.toMatchObject({ status: 403 });
    await expect(service.getReview(OWNER, { limit: '101' })).rejects.toMatchObject({ status: 400 });
    await expect(service.getReview(OWNER, { token: 'PRIVATE' })).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });
  test.each([
    { complete: false },
    { complete: true, invalidAmount: true },
  ])('invalid or incomplete snapshots never reach the write transaction: %j', async scenario => {
    const { service, db, provider } = setup();
    provider.readSnapshot.mockImplementation(async (_, { year, month }) => ({ provider: 'fintoc', mode: 'live', period: { year: Number(year), month: Number(month) },
      bankUpdatedAt: null, coverage: { complete: scenario.complete }, items: month === '11' ? [item('mov_a', scenario.invalidAmount ? { amount: '12.5' } : {})] : [], total: month === '11' ? 1 : 0 }));
    expect(await service.run({ trigger: 'initial' })).toMatchObject({ status: 'error', errorCode: 'FINTOC_DAILY_INVALID_SNAPSHOT', inserted: 0 });
    expect(db.connect).not.toHaveBeenCalled();
  });
  test('untrusted provider error codes and messages cannot escape or enter the run log', async () => {
    const { service, provider, db } = setup();
    provider.readSnapshot.mockRejectedValueOnce({ code: 'sk_live_PRIVATE', message: 'link_token=PRIVATE' });
    const result = await service.run({ trigger: 'scheduled' });
    expect(result).toMatchObject({ errorCode: 'FINTOC_DAILY_PROVIDER_ERROR', status: 'error' });
    expect(JSON.stringify([result, db.calls])).not.toContain('PRIVATE');
  });
  test('status and review read only metadata and do not call the bank', async () => {
    const { service, db, provider } = setup();
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM fintoc_sync_state')) return { rows: [{ cutover_date: '2026-11-01', last_success_at: '2026-11-02T14:00:00Z', bank_updated_at: '2026-11-02T12:00:00Z', coverage_since: '2026-09-01', coverage_until: '2026-11-02', last_error_code: null }] };
      if (sql.includes('pending_review_count')) return { rows: [{ pending_review_count: 1, imported_total: 3 }] };
      if (sql.includes('FROM fintoc_sync_runs')) return { rows: [{ trigger: 'scheduled', status: 'success', inserted: 1, linked: 0, review: 1, error_code: null }] };
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
      return { rows: [{ externalId: 'mov_a', date: '2026-11-02', description: 'Conservar', type: 'cargo', amount: '1000000000000', status: 'confirmed', reason: 'amount_out_of_range', candidateCount: 0 }] };
    });
    expect(await service.getDailyStatus(OWNER)).toMatchObject({ enabled: true, state: 'needs_review', initialized: true, cutoverDate: '2026-11-01', pendingReviewCount: 1, importedTotal: 3, bankFreshness: 'current', schedule: '07:00', timezone: 'America/Santiago' });
    expect(await service.getReview(OWNER, { limit: '100', offset: '0' })).toMatchObject({ items: [{ amount: '1000000000000', reason: 'amount_out_of_range' }], total: 1, limit: 100, offset: 0 });
    expect(provider.readSnapshot).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });
  test.each([null, '2026-10-01T00:00:00Z'])('missing or old bank timestamp cannot announce a current account: %s', async bankTime => {
    const { service, db } = setup();
    db.query.mockImplementation(async sql => sql.includes('FROM fintoc_sync_state') ? { rows: [{ cutover_date: '2026-11-01', last_success_at: '2026-11-02T14:00:00Z', bank_updated_at: bankTime }] } : { rows: [] });
    expect(await service.getDailyStatus(OWNER)).toMatchObject({ state: 'stale', bankFreshness: bankTime ? 'stale' : 'unknown' });
  });
  test('the three-month query crosses year boundaries using Santiago calendar dates', async () => {
    const { db, provider, env } = setup();
    provider.readSnapshot.mockImplementation(async (_, selected) => ({ provider: 'fintoc', mode: 'live', period: { year: Number(selected.year), month: Number(selected.month) }, items: [], total: 0, coverage: { complete: true }, bankUpdatedAt: null }));
    const service = createFintocDailySyncService({ db, provider, env, now: () => new Date('2027-01-02T02:30:00Z') });
    expect(await service.run({ trigger: 'initial' })).toMatchObject({ status: 'success', coverage: { since: '2026-11-01', until: '2027-01-01' } });
    expect(provider.readSnapshot.mock.calls.map(call => call[1])).toEqual([{ year: '2026', month: '11' }, { year: '2026', month: '12' }, { year: '2027', month: '1' }]);
  });
  test('extra fields from a provider adapter never enter stored snapshots', async () => {
    const { service, db, provider } = setup();
    provider.readSnapshot.mockImplementation(async (_, selected) => ({ provider: 'fintoc', mode: 'live', period: { year: Number(selected.year), month: Number(selected.month) }, items: selected.month === '11' ? [item('mov_a', { secretKey: 'PRIVATE-EXTRA' })] : [], total: selected.month === '11' ? 1 : 0, coverage: { complete: true }, bankUpdatedAt: null }));
    expect(await service.run({ trigger: 'initial' })).toMatchObject({ status: 'success' });
    expect(JSON.stringify(db.calls)).not.toContain('PRIVATE-EXTRA');
  });
});

describe('daily bank balance metadata is additive and atomic',()=>{
  const balance=(patch={})=>({currency:'CLP',available:'1234567',current:'1000000',bankUpdatedAt:'2026-11-02T12:00:00.000Z',queriedAt:'2026-11-02T15:00:00.000Z',...patch});
  test('complete daily batch stores the freshest validated balance in the same transaction',async()=>{const s=setup();const base=s.provider.readSnapshot.getMockImplementation();s.provider.readSnapshot.mockImplementation(async(actor,period)=>({...await base(actor,period),bankBalance:balance({available:period.month==='11'?'1234567':'7654321',queriedAt:`2026-11-02T${period.month==='11'?'15':period.month==='10'?'14':'13'}:00:00.000Z`})}));expect(await s.service.run({trigger:'initial'})).toMatchObject({status:'success',inserted:0});const writes=s.db.calls.filter(c=>c.sql.includes('INSERT INTO fintoc_bank_balances'));expect(writes).toHaveLength(1);expect(writes[0].params.slice(0,5)).toEqual([OWNER,ACCOUNT,'CLP','1234567','1000000']);expect(s.db.calls.at(-1).sql).toBe('COMMIT')});
  test('fixtures or providers with no bank balance keep movement synchronization without balance queries',async()=>{const s=setup();expect(await s.service.run()).toMatchObject({status:'success'});expect(s.db.calls.some(c=>c.sql.includes('fintoc_bank_balances'))).toBe(false)});
  test('optional invalid bank fields do not interrupt valid movements or overwrite earlier balance',async()=>{const s=setup();const base=s.provider.readSnapshot.getMockImplementation();s.provider.readSnapshot.mockImplementation(async(actor,period)=>({...await base(actor,period),bankBalance:balance({available:'invalid'})}));expect(await s.service.run()).toMatchObject({status:'success'});expect(s.db.calls.some(c=>c.sql.includes('fintoc_bank_balances'))).toBe(false)});
  test('incomplete movements never persist even an otherwise valid balance',async()=>{const s=setup();s.provider.readSnapshot.mockResolvedValueOnce({bankBalance:balance(),coverage:{complete:false}});expect(await s.service.run()).toMatchObject({status:'error'});expect(s.db.calls.some(c=>c.sql.includes('fintoc_bank_balances'))).toBe(false);expect(s.db.connect).not.toHaveBeenCalled()});
  test('bank persistence failure rolls back the complete transaction',async()=>{const s=setup();const base=s.provider.readSnapshot.getMockImplementation();s.provider.readSnapshot.mockImplementation(async(actor,period)=>({...await base(actor,period),bankBalance:balance()}));const query=s.db.client.query.getMockImplementation();s.db.client.query.mockImplementation(async(sql,params)=>{if(sql.includes('INSERT INTO fintoc_bank_balances'))throw new Error('PRIVATE bank write failure');return query(sql,params)});expect(await s.service.run()).toMatchObject({status:'error',errorCode:'FINTOC_DAILY_STORAGE_ERROR'});expect(s.db.calls.some(c=>c.sql==='ROLLBACK')).toBe(true)});
});
