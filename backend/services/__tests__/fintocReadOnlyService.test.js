const { createFintocReadOnlyService } = require('../fintocReadOnlyService');

const OWNER = 'fintoc-owner';
const QUERY = { year: '2026', month: '10' };
const config = (patch = {}) => ({
  FINTOC_ENABLED: 'true', FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'true',
  FINTOC_MODE: 'test', FINTOC_OWNER_USER_ID: OWNER,
  FINTOC_SECRET_KEY: 'sk_test_privateExample',
  FINTOC_LINK_TOKEN: 'link_example_token_privateExample',
  FINTOC_ACCOUNT_ID: 'acc_example', ...patch,
});
const account = (patch = {}) => ({
  id: 'acc_example', object: 'account', name: 'Cuenta corriente', number: '00001234',
  currency: 'CLP', type: 'checking_account', removed_from_link: false,
  refreshed_at: null, ...patch,
});
const link = (patch = {}) => ({
  id: 'link_example', object: 'link', active: true, status: 'active', mode: 'test',
  institution: { id: 'cl_banco_de_chile', country: 'cl' },
  holder_type: 'individual', accounts: [account()], ...patch,
});
const movement = (patch = {}) => ({
  id: 'mov_example', object: 'movement', amount: -12500, currency: 'CLP',
  description: 'Ejemplo ficticio', post_date: '2026-10-03T00:00:00.000Z',
  transaction_date: '2026-09-30T23:00:00.000Z', status: 'confirmed', pending: false, ...patch,
});
const response = (data, headers = {}) => ({ status: 200, data, headers });
function setup({ env = config(), linkData = link(), movements = [movement()], headers = {}, clock } = {}) {
  const transport = { get: jest.fn().mockResolvedValueOnce(response(linkData)).mockResolvedValueOnce(response(movements, headers)) };
  const service = createFintocReadOnlyService({ env, transport, now: () => new Date('2026-10-31T20:00:00.000Z'), ...(clock ? { clock } : {}) });
  return { service, transport };
}

describe('Fintoc configuration is local, private and inactive by default', () => {
  test.each([
    [{}, 'disabled'],
    [config({ FINTOC_ENABLED: 'false' }), 'disabled'],
    [config({ FINTOC_ACCOUNT_ID: '' }), 'configuration_required'],
    [config({ FINTOC_OWNER_USER_ID: '' }), 'configuration_required'],
    [config({ FINTOC_MODE: 'other' }), 'configuration_required'],
    [config({ FINTOC_SECRET_KEY: 'sk_live_privateExample' }), 'configuration_required'],
    [config({ FINTOC_SECRET_KEY: 'pk_test_privateExample' }), 'configuration_required'],
    [config({ FINTOC_LINK_TOKEN: 'https://private.example' }), 'configuration_required'],
    [config({ FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'false' }), 'access_unconfirmed'],
    [config(), 'ready'],
    [config({ FINTOC_MODE: 'live', FINTOC_SECRET_KEY: 'sk_live_privateExample' }), 'ready'],
  ])('returns state %s without upstream requests', (env, state) => {
    const { service, transport } = setup({ env });
    expect(service.getStatus(OWNER)).toMatchObject({ state, provider: 'fintoc', readOnly: true, writesEnabled: false });
    expect(transport.get).not.toHaveBeenCalled();
    const serialized = JSON.stringify(service.getStatus(OWNER));
    expect(serialized).not.toMatch(/privateExample|acc_example|fintoc-owner/);
  });

  test('accepts URL-safe link token characters and completes a mocked preview', async () => {
    const linkToken = 'link_Fake123_token_Abc_Def-123';
    const { service, transport } = setup({
      env: config({ FINTOC_LINK_TOKEN: linkToken }),
      linkData: link({ id: 'link_Fake123' }),
    });

    expect(service.getStatus(OWNER)).toMatchObject({ state: 'ready' });
    expect(transport.get).not.toHaveBeenCalled();
    await expect(service.preview(OWNER, QUERY)).resolves.toMatchObject({
      total: 1, coverage: { complete: true, excludedNonConfirmed: 0 },
      items: [{ externalId: 'mov_example' }],
    });
    expect(transport.get).toHaveBeenCalledTimes(2);
    expect(transport.get.mock.calls[0][0]).toBe(`https://api.fintoc.com/v1/links/${linkToken}`);
    expect(transport.get.mock.calls[1][1].params.link_token).toBe(linkToken);
  });

  test.each([
    'link_Fake_123_token_Abc123',
    'link_Fake-123_token_Abc123',
    'link_Fake123_token_',
    'link_Fake123_token_Abc.Def',
    'link_Fake123_token_Abc/Def',
    ' link_Fake123_token_Abc123',
    'link_Fake123_token_Abc123 ',
    `link_Fake123_token_${'A'.repeat(1024)}`,
  ])('rejects malformed link tokens before upstream requests', async (linkToken) => {
    const { service, transport } = setup({ env: config({ FINTOC_LINK_TOKEN: linkToken }) });
    expect(service.getStatus(OWNER)).toMatchObject({ state: 'configuration_required' });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 503, code: 'FINTOC_NOT_READY' });
    expect(transport.get).not.toHaveBeenCalled();
  });

  test('accepts URL-safe secret key characters and preserves the authorization header', async () => {
    const secretKey = 'sk_live_Example_Token-123';
    const { service, transport } = setup({
      env: config({ FINTOC_MODE: 'live', FINTOC_SECRET_KEY: secretKey }),
      linkData: link({ mode: 'live' }),
    });

    expect(service.getStatus(OWNER)).toMatchObject({ state: 'ready' });
    expect(transport.get).not.toHaveBeenCalled();
    await expect(service.preview(OWNER, QUERY)).resolves.toMatchObject({
      mode: 'live', total: 1, coverage: { complete: true, excludedNonConfirmed: 0 },
    });
    expect(transport.get).toHaveBeenCalledTimes(2);
    for (const [, options] of transport.get.mock.calls) {
      expect(options.headers.Authorization).toBe(secretKey);
    }
  });

  test.each([
    'pk_live_Example_Token-123',
    'sk_test_Example_Token-123',
    'sk_live_',
    ' sk_live_Example_Token-123',
    'sk_live_Example_Token-123 ',
    'sk_live_Example Token-123',
    'sk_live_Example\nToken-123',
    'sk_live_Example\u0000Token-123',
    'sk_live_Example.Token-123',
  ])('rejects malformed or mode-incompatible secret keys before upstream requests', async (secretKey) => {
    const { service, transport } = setup({ env: config({ FINTOC_MODE: 'live', FINTOC_SECRET_KEY: secretKey }) });
    expect(service.getStatus(OWNER)).toMatchObject({ state: 'configuration_required' });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 503, code: 'FINTOC_NOT_READY' });
    expect(transport.get).not.toHaveBeenCalled();
  });

  test('configuration is reevaluated without retaining old secrets or enabling traffic', async () => {
    const env = config();
    const { service, transport } = setup({ env });
    env.FINTOC_ENABLED = 'false';
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 503, code: 'FINTOC_NOT_READY' });
    expect(transport.get).not.toHaveBeenCalled();
  });

  test('another own-space owner cannot access a globally configured connection', async () => {
    const { service, transport } = setup();
    expect(() => service.getStatus('other-owner')).toThrow();
    await expect(service.preview('other-owner', QUERY)).rejects.toMatchObject({ status: 403, code: 'FINTOC_FORBIDDEN' });
    expect(transport.get).not.toHaveBeenCalled();
  });

  test.each([{}, config({ FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED: 'false' })])('never calls upstream before readiness', async (env) => {
    const { service, transport } = setup({ env });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 503, code: 'FINTOC_NOT_READY' });
    expect(transport.get).not.toHaveBeenCalled();
  });
});

describe('read-only preview uses the fixed Fintoc contract', () => {
  test('returns confirmed CLP movements by posting date without balance, IDs or credentials of the account', async () => {
    const { service, transport } = setup({ movements: [movement(), movement({ id: 'mov_abono', amount: 50000 })] });
    const result = await service.preview(OWNER, QUERY);
    expect(result).toEqual({
      provider: 'fintoc', mode: 'test', readOnly: true, imported: false,
      period: { year: 2026, month: 10, since: '2026-10-01', until: '2026-10-31' },
      account: { name: 'Cuenta corriente', currency: 'CLP', numberLast4: '1234' },
      queriedAt: '2026-10-31T20:00:00.000Z', bankUpdatedAt: null,
      items: [
        { externalId: 'mov_example', date: '2026-10-03', description: 'Ejemplo ficticio', type: 'cargo', amount: '12500', status: 'confirmed' },
        { externalId: 'mov_abono', date: '2026-10-03', description: 'Ejemplo ficticio', type: 'abono', amount: '50000', status: 'confirmed' },
      ], total: 2, coverage: { complete: true, excludedNonConfirmed: 0 },
    });
    expect(transport.get).toHaveBeenCalledTimes(2);
    expect(transport.get.mock.calls[0][0]).toBe('https://api.fintoc.com/v1/links/link_example_token_privateExample');
    for (const [url, options] of transport.get.mock.calls) {
      expect(new URL(url).origin).toBe('https://api.fintoc.com');
      expect(options).toMatchObject({ maxRedirects: 0, headers: { Authorization: 'sk_test_privateExample', 'Fintoc-Version': '2026-02-01' } });
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(20000);
    }
    expect(transport.get.mock.calls[1][1].params).toEqual({ link_token: 'link_example_token_privateExample', since: '2026-10-01', until: '2026-10-31', confirmed_only: true, per_page: 300, page: 1 });
    expect(JSON.stringify(result)).not.toMatch(/privateExample|holder_name|balance|00001234|acc_example/);
  });

  test('bank freshness remains the provider timestamp, not the query timestamp', async () => {
    const { service } = setup({ linkData: link({ accounts: [account({ refreshed_at: '2026-09-01T02:00:00.000Z' })] }) });
    expect((await service.preview(OWNER, QUERY)).bankUpdatedAt).toBe('2026-09-01T02:00:00.000Z');
  });

  test('leap-year February uses inclusive calendar bounds', async () => {
    const { service, transport } = setup({ movements: [] });
    const result = await service.preview(OWNER, { year: '2024', month: '2' });
    expect(result.period).toEqual({ year: 2024, month: 2, since: '2024-02-01', until: '2024-02-29' });
    expect(transport.get.mock.calls[1][1].params.until).toBe('2024-02-29');
  });

  test.each([
    {}, { year: '2026', month: '13' }, { year: '2026x', month: '10' },
    { year: '1999', month: '10' }, { year: ['2026'], month: '10' },
    { ...QUERY, account_id: 'acc_other' }, { ...QUERY, link_token: 'other' },
    { ...QUERY, url: 'https://another.example' }, { ...QUERY, refresh: 'true' },
  ])('rejects invalid or extra period parameters before network', async (query) => {
    const { service, transport } = setup();
    await expect(service.preview(OWNER, query)).rejects.toMatchObject({ status: 400, code: 'FINTOC_INVALID_PERIOD' });
    expect(transport.get).not.toHaveBeenCalled();
  });

  test.each([
    { institution: { id: 'cl_other_bank', country: 'cl' } },
    { institution: { id: 'cl_banco_de_chile', country: 'mx' } },
    { holder_type: 'business' }, { mode: 'live' }, { active: false }, { status: 'inactive' },
    { accounts: [] }, { accounts: [account({ id: 'acc_other' })] },
    { accounts: [account({ currency: 'USD' })] },
    { accounts: [account({ type: 'credit_card' })] },
    { accounts: [account({ removed_from_link: true })] },
    { accounts: [account({ removed_from_link: undefined })] },
    { accounts: [account(), account()] },
    { accounts: [account({ refreshed_at: 'bad-date' })] },
  ])('does not fetch movements for an incompatible link/account', async (patch) => {
    const { service, transport } = setup({ linkData: link(patch) });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ code: expect.stringMatching(/^FINTOC_/) });
    expect(transport.get).toHaveBeenCalledTimes(1);
  });

  test('excludes every nonconfirmed or pending record and counts those exclusions', async () => {
    const { service } = setup({ movements: [movement(),
      movement({ id: 'mov_pending', pending: true }),
      movement({ id: 'mov_reversed', status: 'reversed' }),
      movement({ id: 'mov_processing', status: 'processing' }),
    ] });
    const result = await service.preview(OWNER, QUERY);
    expect(result.total).toBe(1);
    expect(result.coverage).toEqual({ complete: true, excludedNonConfirmed: 3 });
  });

  test.each([
    { pending: undefined }, { pending: 'false' }, { status: undefined },
    { id: '' }, { amount: 1.25 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { amount: '12500' }, { amount: 0 }, { currency: 'USD' },
    { description: '' }, { description: null }, { post_date: '2026-02-30T00:00:00.000Z' },
    { post_date: '2026-09-30T00:00:00.000Z' }, { post_date: null },
  ])('fails closed on malformed or out-of-period movements', async (patch) => {
    const { service } = setup({ movements: [movement(patch)] });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INVALID_RESPONSE' });
  });
});

describe('pagination never returns a partial preview', () => {
  const nextLink = (page) => `<https://api.fintoc.com/v1/accounts/acc_example/movements?page=${page}>; rel="next"`;
  const relation = (name, page) => `<https://api.fintoc.com/v1/accounts/acc_example/movements?page=${page}>; rel="${name}"`;
  const batch = (page, count = 300) => Array.from({ length: count }, (_, i) => movement({ id: `mov_${page}_${i}` }));

  test('combines pages and validates the total count', async () => {
    const { service, transport } = setup({ movements: batch(1), headers: { link: nextLink(2), 'x-total-count': '301' } });
    transport.get.mockResolvedValueOnce(response(batch(2, 1), { 'x-total-count': '301' }));
    const result = await service.preview(OWNER, QUERY);
    expect(result.total).toBe(301);
    expect(result.coverage.complete).toBe(true);
    expect(transport.get.mock.calls[2][1].params.page).toBe(2);
  });

  test.each([
    '<https://attacker.example/collect?page=2>; rel="next"',
    '<https://api.fintoc.com/v1/other?page=2>; rel="next"',
    nextLink(1), nextLink(3), 'broken-pagination',
  ])('rejects unsafe or inconsistent next metadata', async (header) => {
    const { service, transport } = setup({ movements: batch(1), headers: { link: header } });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INCOMPLETE' });
    expect(transport.get).toHaveBeenCalledTimes(2);
  });

  test.each([
    relation('last', 2),
    relation('first', 2),
    relation('prev', 1),
    `${nextLink(2)}, ${relation('last', 1)}`,
  ])('rejects contradictory first-page relations instead of claiming complete coverage', async (header) => {
    const { service, transport } = setup({ movements: [movement()], headers: { link: header } });
    transport.get.mockResolvedValueOnce(response([movement({ id: 'mov_second' })]));
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INCOMPLETE' });
    expect(transport.get).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['', 3],
    [relation('last', 3), 2],
    [relation('last', 1), 2],
    [relation('prev', 2), 2],
    [relation('prev', 3), 2],
  ])('retains the advertised last page and validates later-page relations', async (secondHeader, lastPage) => {
    const { service, transport } = setup({ movements: [movement()], headers: { link: `${nextLink(2)}, ${relation('last', lastPage)}` } });
    transport.get.mockResolvedValueOnce(response([movement({ id: 'mov_second' })], { link: secondHeader }));
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INCOMPLETE' });
    expect(transport.get).toHaveBeenCalledTimes(3);
  });

  test('accepts coherent first/previous/last metadata and stops only at the advertised last page', async () => {
    const { service, transport } = setup({ movements: [movement()], headers: { link: `${relation('first', 1)}, ${nextLink(2)}, ${relation('last', 2)}` } });
    transport.get.mockResolvedValueOnce(response([movement({ id: 'mov_second' })], { link: `${relation('first', 1)}, ${relation('prev', 1)}, ${relation('last', 2)}` }));
    const result = await service.preview(OWNER, QUERY);
    expect(result.total).toBe(2);
    expect(result.coverage.complete).toBe(true);
    expect(transport.get).toHaveBeenCalledTimes(3);
  });

  test('rejects duplicate provider IDs across pages', async () => {
    const { service, transport } = setup({ movements: [movement()], headers: { link: nextLink(2) } });
    transport.get.mockResolvedValueOnce(response([movement()]));
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INVALID_RESPONSE' });
  });

  test('does not silently truncate at ten pages', async () => {
    const { service, transport } = setup({ movements: batch(1), headers: { link: nextLink(2) } });
    for (let page = 2; page <= 10; page += 1) transport.get.mockResolvedValueOnce(response(batch(page), { link: nextLink(page + 1) }));
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INCOMPLETE' });
    expect(transport.get).toHaveBeenCalledTimes(11);
  });

  test('fails when the announced total was not retrieved', async () => {
    const { service } = setup({ headers: { 'x-total-count': '2', link: '' } });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_INCOMPLETE' });
  });

  test('fails if a later page cannot be retrieved instead of returning earlier rows', async () => {
    const { service, transport } = setup({ movements: [movement()], headers: { link: nextLink(2) } });
    transport.get.mockRejectedValueOnce({ response: { status: 500, data: { secret: 'raw private data' } } });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 502, code: 'FINTOC_UPSTREAM_ERROR' });
  });

  test('the total deadline includes link validation and all pages', async () => {
    let elapsed = 0;
    const { service, transport } = setup({ clock: () => elapsed });
    transport.get.mockReset().mockImplementationOnce(async () => { elapsed = 20001; return response(link()); });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 504, code: 'FINTOC_TIMEOUT' });
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
});

describe('upstream failures are private and never retried', () => {
  test.each([
    [401, 502, 'FINTOC_AUTH_FAILED'], [403, 502, 'FINTOC_AUTH_FAILED'],
    [402, 503, 'FINTOC_PAYMENT_REQUIRED'], [429, 429, 'FINTOC_RATE_LIMITED'],
    [500, 502, 'FINTOC_UPSTREAM_ERROR'], [404, 503, 'FINTOC_CONNECTION_UNAVAILABLE'],
  ])('maps upstream %i to safe status %i and code %s', async (upstream, status, code) => {
    const { service, transport } = setup();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    transport.get.mockReset().mockRejectedValue({ message: 'privateExample raw provider detail', response: { status: upstream, data: { privateExample: 'secret' } }, config: { headers: { Authorization: 'sk_test_privateExample' } } });
    try { await service.preview(OWNER, QUERY); throw new Error('expected failure'); }
    catch (error) {
      expect(error).toMatchObject({ status, code });
      expect(error.message).not.toMatch(/privateExample|raw provider detail/);
      expect(JSON.stringify(error)).not.toMatch(/privateExample|raw provider detail/);
    }
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test('timeout is reported safely', async () => {
    const { service, transport } = setup();
    transport.get.mockReset().mockRejectedValue({ code: 'ECONNABORTED', message: 'private timeout url' });
    await expect(service.preview(OWNER, QUERY)).rejects.toMatchObject({ status: 504, code: 'FINTOC_TIMEOUT' });
  });
});
