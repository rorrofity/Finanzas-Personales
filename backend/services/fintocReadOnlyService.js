const axios = require('axios');

const ORIGIN = 'https://api.fintoc.com';
const VERSION = '2026-02-01';
const MAX_PAGES = 10;
const PAGE_SIZE = 300;
const DEADLINE_MS = 20000;

class FintocReadOnlyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'FintocReadOnlyError';
    this.status = status;
    this.code = code;
  }
}

const error = (status, code, message) => new FintocReadOnlyError(status, code, message);
const invalid = () => error(502, 'FINTOC_INVALID_RESPONSE', 'Fintoc devolvió información que no se pudo validar.');
const incomplete = () => error(502, 'FINTOC_INCOMPLETE', 'No se pudo obtener el período completo. Intenta nuevamente más tarde.');
const timeout = () => error(504, 'FINTOC_TIMEOUT', 'La consulta a Fintoc superó el tiempo disponible.');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;

function configuration(env) {
  const mode = ['test', 'live'].includes(env.FINTOC_MODE) ? env.FINTOC_MODE : null;
  const owner = nonempty(env.FINTOC_OWNER_USER_ID, 128) ? env.FINTOC_OWNER_USER_ID : null;
  const secret = env.FINTOC_SECRET_KEY;
  const linkToken = env.FINTOC_LINK_TOKEN;
  const accountId = env.FINTOC_ACCOUNT_ID;
  const valid = Boolean(mode && owner
    && nonempty(secret) && new RegExp(`^sk_${mode}_[A-Za-z0-9_-]+$`).test(secret)
    && nonempty(linkToken, 1024) && /^link_[A-Za-z0-9]+_token_[A-Za-z0-9_-]+$/.test(linkToken)
    && nonempty(accountId) && /^acc_[A-Za-z0-9]+$/.test(accountId));
  let state = 'disabled';
  if (env.FINTOC_ENABLED === 'true') {
    if (!valid) state = 'configuration_required';
    else if (env.FINTOC_PERSONAL_FREE_ACCESS_CONFIRMED !== 'true') state = 'access_unconfirmed';
    else state = 'ready';
  }
  return { mode, owner, secret, linkToken, accountId, state };
}

function period(query) {
  if (!object(query) || Object.keys(query).some((key) => !['year', 'month'].includes(key))
    || typeof query.year !== 'string' || !/^\d{4}$/.test(query.year)
    || typeof query.month !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(query.month)) {
    throw error(400, 'FINTOC_INVALID_PERIOD', 'Selecciona un año y mes válidos, sin otros parámetros.');
  }
  const year = Number(query.year);
  const month = Number(query.month);
  if (year < 2000 || year > 2100) throw error(400, 'FINTOC_INVALID_PERIOD', 'El año debe estar entre 2000 y 2100.');
  const since = `${year}-${String(month).padStart(2, '0')}-01`;
  const until = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { year, month, since, until };
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function timestamp(value) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !validDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw invalid();
  return new Date(value).toISOString();
}

function text(value, max) {
  if (typeof value !== 'string' || value.length > max || !value.trim()
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw invalid();
  return value.trim().replace(/\s+/g, ' ');
}

function accountFromLink(data, config) {
  if (!object(data) || data.object !== 'link' || data.id !== config.linkToken.split('_token_')[0]
    || !object(data.institution) || data.institution.id !== 'cl_banco_de_chile'
    || data.institution.country !== 'cl' || data.holder_type !== 'individual'
    || data.mode !== config.mode || typeof data.active !== 'boolean'
    || typeof data.status !== 'string' || !Array.isArray(data.accounts)) throw invalid();
  if (!data.active || data.status !== 'active') {
    throw error(503, 'FINTOC_RECONNECT_REQUIRED', 'La conexión bancaria requiere revisión o reconexión en Fintoc.');
  }
  const matches = data.accounts.filter((item) => object(item) && item.id === config.accountId);
  if (matches.length !== 1) throw invalid();
  const account = matches[0];
  if (account.object !== 'account' || account.currency !== 'CLP'
    || account.type !== 'checking_account' || account.removed_from_link !== false
    || typeof account.number !== 'string' || !/^\d{4,50}$/.test(account.number)) throw invalid();
  return {
    publicAccount: { name: text(account.name, 160), currency: 'CLP', numberLast4: account.number.slice(-4) },
    bankUpdatedAt: account.refreshed_at === null ? null : timestamp(account.refreshed_at),
  };
}

function normalizeMovement(row, selectedPeriod, seen) {
  if (!object(row) || row.object !== 'movement' || !nonempty(row.id, 200)
    || !/^mov_[A-Za-z0-9_-]+$/.test(row.id) || seen.has(row.id)
    || !nonempty(row.status, 64) || !/^[a-z_]+$/.test(row.status) || typeof row.pending !== 'boolean'
    || row.currency !== 'CLP' || !Number.isSafeInteger(row.amount) || row.amount === 0) throw invalid();
  timestamp(row.post_date);
  const date = row.post_date.slice(0, 10);
  if (date < selectedPeriod.since || date > selectedPeriod.until) throw invalid();
  const description = text(row.description, 2000);
  seen.add(row.id);
  return { externalId: row.id, date, description, type: row.amount < 0 ? 'cargo' : 'abono', amount: String(Math.abs(row.amount)), status: row.status, pending: row.pending };
}

function header(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const result = headers.get(name);
    return result === null ? undefined : result;
  }
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

function pagination(headers, path, currentPage, params) {
  const raw = header(headers, 'link');
  const result = { hasLink: raw !== undefined, next: null, last: null, total: null };
  const rawTotal = header(headers, 'x-total-count');
  if (rawTotal !== undefined) {
    if (!/^(?:0|[1-9]\d*)$/.test(String(rawTotal))) throw incomplete();
    result.total = Number(rawTotal);
    if (!Number.isSafeInteger(result.total) || result.total > MAX_PAGES * PAGE_SIZE) throw incomplete();
  }
  if (raw === undefined) return result;
  if (typeof raw !== 'string') throw incomplete();
  if (!raw.trim()) return result;
  const relations = new Set();
  for (const part of raw.split(',')) {
    const match = part.trim().match(/^<([^<>]+)>;\s*rel="(first|prev|next|last)"$/);
    if (!match || relations.has(match[2])) throw incomplete();
    relations.add(match[2]);
    let url;
    try { url = new URL(match[1]); } catch (_) { throw incomplete(); }
    if (url.origin !== ORIGIN || url.pathname !== path || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some((key) => !['page', ...Object.keys(params)].includes(key))) throw incomplete();
    for (const [key, value] of Object.entries(params)) {
      if (url.searchParams.has(key) && url.searchParams.get(key) !== String(value)) throw incomplete();
    }
    const pageValue = url.searchParams.get('page');
    if (!pageValue || !/^[1-9]\d*$/.test(pageValue)) throw incomplete();
    const target = Number(pageValue);
    if (!Number.isSafeInteger(target) || target > MAX_PAGES) throw incomplete();
    if (match[2] === 'first' && target !== 1) throw incomplete();
    if (match[2] === 'prev' && (currentPage === 1 || target !== currentPage - 1)) throw incomplete();
    if (match[2] === 'last') {
      if (target < currentPage) throw incomplete();
      result.last = target;
    }
    if (match[2] === 'next') {
      if (target !== currentPage + 1) throw incomplete();
      result.next = target;
    }
  }
  if (result.next !== null && result.last !== null && result.next > result.last) throw incomplete();
  return result;
}

function upstreamError(failure) {
  if (failure instanceof FintocReadOnlyError) return failure;
  if (['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(failure?.code)) return timeout();
  switch (failure?.response?.status) {
    case 401: case 403:
      return error(502, 'FINTOC_AUTH_FAILED', 'No se pudo autorizar la consulta con Fintoc. Revisa la configuración privada.');
    case 402:
      return error(503, 'FINTOC_PAYMENT_REQUIRED', 'Fintoc exige revisar las condiciones de acceso. No se reintentará ni se habilitará un pago.');
    case 404:
      return error(503, 'FINTOC_CONNECTION_UNAVAILABLE', 'La conexión o cuenta configurada no está disponible en Fintoc.');
    case 429:
      return error(429, 'FINTOC_RATE_LIMITED', 'Fintoc limitó las consultas. Intenta nuevamente más tarde.');
    default:
      return error(502, 'FINTOC_UPSTREAM_ERROR', 'No se pudo completar la consulta a Fintoc. Intenta nuevamente más tarde.');
  }
}

function createFintocReadOnlyService({ env = process.env, transport = axios, now = () => new Date(), clock = () => Date.now() } = {}) {
  function assertOwner(actorId) {
    const configuredOwner = configuration(env).owner;
    if (configuredOwner && configuredOwner !== actorId) throw error(403, 'FINTOC_FORBIDDEN', 'La conexión solo está disponible para su titular.');
  }

  function getStatus(actorId, query = {}) {
    assertOwner(actorId);
    if (!object(query) || Object.keys(query).length) throw error(400, 'FINTOC_INVALID_PERIOD', 'Esta consulta no acepta parámetros.');
    const { state, mode } = configuration(env);
    const messages = {
      disabled: 'La conexión Fintoc está pendiente de activación.',
      configuration_required: 'Falta completar la configuración privada de la conexión.',
      access_unconfirmed: 'Falta confirmar el acceso personal gratuito y las condiciones de Fintoc.',
      ready: 'Conector preparado para consultar movimientos. La consulta no importa ni modifica datos.',
    };
    return { state, provider: 'fintoc', mode, readOnly: true, writesEnabled: false, message: messages[state] };
  }

  async function readPeriod(actorId, query, confirmedOnly) {
    assertOwner(actorId);
    const selectedPeriod = period(query);
    const config = configuration(env);
    if (config.state !== 'ready') throw error(503, 'FINTOC_NOT_READY', 'La conexión Fintoc todavía no está habilitada para consultas.');
    const started = clock();
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(timeout()); }, DEADLINE_MS);
    });
    const ensureTime = () => {
      const remaining = DEADLINE_MS - (clock() - started);
      if (remaining <= 0) throw timeout();
      return remaining;
    };
    async function get(path, params) {
      try {
        const response = await Promise.race([transport.get(`${ORIGIN}${path}`, {
          headers: { Authorization: config.secret, 'Fintoc-Version': VERSION },
          ...(params ? { params } : {}), timeout: Math.min(10000, ensureTime()),
          maxRedirects: 0, maxContentLength: 2 * 1024 * 1024, signal: controller.signal,
        }), deadline]);
        ensureTime();
        if (!response || response.status !== 200) throw { response: { status: response?.status } }; // Converted below without preserving provider data.
        return response;
      } catch (failure) { throw upstreamError(failure); }
    }

    try {
      const linkResponse = await get(`/v1/links/${encodeURIComponent(config.linkToken)}`);
      const validatedAccount = accountFromLink(linkResponse.data, config);
      const path = `/v1/accounts/${encodeURIComponent(config.accountId)}/movements`;
      const params = { link_token: config.linkToken, since: selectedPeriod.since, until: selectedPeriod.until, confirmed_only: confirmedOnly, per_page: PAGE_SIZE };
      const seen = new Set();
      const items = [];
      let announcedTotal = null;
      let announcedLast = null;
      let page = 1;
      while (page <= MAX_PAGES) {
        const pageResponse = await get(path, { ...params, page });
        if (!Array.isArray(pageResponse.data) || pageResponse.data.length > PAGE_SIZE) throw invalid();
        const meta = pagination(pageResponse.headers, path, page, params);
        if (meta.last !== null) {
          if (announcedLast !== null && meta.last !== announcedLast) throw incomplete();
          announcedLast = meta.last;
        }
        if (announcedLast !== null && (page > announcedLast
          || (meta.next === null && page < announcedLast)
          || (meta.next !== null && meta.next > announcedLast))) throw incomplete();
        if (meta.total !== null) {
          if (announcedTotal !== null && meta.total !== announcedTotal) throw incomplete();
          announcedTotal = meta.total;
        }
        for (const row of pageResponse.data) {
          items.push(normalizeMovement(row, selectedPeriod, seen));
        }
        ensureTime();
        if (announcedTotal !== null && seen.size > announcedTotal) throw incomplete();
        if (meta.next !== null) {
          if (announcedTotal !== null && seen.size >= announcedTotal) throw incomplete();
          page = meta.next;
          continue;
        }
        if (meta.hasLink) {
          if (announcedTotal !== null && seen.size !== announcedTotal) throw incomplete();
          break;
        }
        if (announcedTotal !== null) {
          if (seen.size === announcedTotal) break;
          if (!pageResponse.data.length) throw incomplete();
        } else if (pageResponse.data.length < PAGE_SIZE) break;
        if (page === MAX_PAGES) throw incomplete();
        page += 1;
      }
      return {
        provider: 'fintoc', mode: config.mode, readOnly: true, imported: false,
        period: selectedPeriod, account: validatedAccount.publicAccount,
        queriedAt: now().toISOString(), bankUpdatedAt: validatedAccount.bankUpdatedAt,
        items, total: items.length, coverage: { complete: true, excludedNonConfirmed: 0 },
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async function readSnapshot(actorId, query) {
    return readPeriod(actorId, query, false);
  }

  async function preview(actorId, query) {
    const snapshot = await readPeriod(actorId, query, true);
    const confirmed = snapshot.items.filter((item) => item.status === 'confirmed' && !item.pending);
    return {
      ...snapshot,
      items: confirmed.map(({ pending, ...item }) => item),
      total: confirmed.length,
      coverage: { complete: true, excludedNonConfirmed: snapshot.items.length - confirmed.length },
    };
  }

  return { getStatus, preview, readSnapshot, assertOwner };
}

module.exports = { createFintocReadOnlyService, FintocReadOnlyError, ...createFintocReadOnlyService() };
