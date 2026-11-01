import axios from '../../config/axios';
import { cacheRead, getCachedEntry } from '../readCache';
import { readExpenseReport, readExpenseTransactions, readExpenseLiquidity } from '../expenseEvolution';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../readCache', () => ({ cacheRead: jest.fn(), getCachedEntry: jest.fn() }));

const scope = { userId: 'reader', ownerId: 'owner', endYear: 2026, endMonth: 10, months: 6, sources: ['tc_nacional'] };

describe('Expense evolution: lectura aislada y caché explícita (DCE-14–17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    getCachedEntry.mockResolvedValue(null);
    cacheRead.mockResolvedValue();
  });

  test('ancla la petición al período y consulta exclusivamente el endpoint GET nuevo', async () => {
    const data = { generatedAt: '2026-10-31T21:00:00Z', months: [], categories: [] };
    axios.get.mockResolvedValue({ data });
    const result = await readExpenseReport(scope);
    expect(axios.get).toHaveBeenCalledWith('/api/dashboard/expense-evolution', expect.objectContaining({
      params: { endYear: 2026, endMonth: 10, months: 6, sources: 'tc_nacional', basis: 'billing' },
    }));
    expect(result).toMatchObject({ data, origin: 'network', stale: false });
    expect(axios.get.mock.calls[0][1].timeout).toBe(15000);
    expect(cacheRead).toHaveBeenCalledWith(expect.stringContaining('reader:owner'), data);
  });

  test('offline recupera solo el alcance solicitado e identifica la antigüedad', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    getCachedEntry.mockResolvedValue({ data: { months: [] }, cachedAt: 1234 });
    const result = await readExpenseReport(scope);
    expect(axios.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({ origin: 'cache', stale: true, cachedAt: 1234 });
    expect(getCachedEntry).toHaveBeenCalledWith(expect.stringContaining('2026:10:6:tc_nacional'));
  });

  test('offline sin rango descargado no convierte ausencia de caché en gasto cero', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await expect(readExpenseReport(scope)).rejects.toMatchObject({ code: 'OFFLINE_MISS' });
  });

  test('un fallo de red usa caché identificado; una revocación 403 nunca la devuelve', async () => {
    getCachedEntry.mockResolvedValue({ data: { old: true }, cachedAt: 12 });
    axios.get.mockRejectedValueOnce(new Error('Network error'));
    expect(await readExpenseReport(scope)).toMatchObject({ origin: 'cache', stale: true });
    axios.get.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(readExpenseReport(scope)).rejects.toMatchObject({ response: { status: 403 } });
  });

  test('usuario, espacio, fuente y ventana participan de la identidad de caché', async () => {
    axios.get.mockResolvedValue({ data: {} });
    await readExpenseReport(scope);
    await readExpenseReport({ ...scope, userId: 'another-reader' });
    await readExpenseReport({ ...scope, ownerId: 'another-owner' });
    await readExpenseReport({ ...scope, months: 12 });
    await readExpenseReport({ ...scope, sources: ['cuenta_corriente'] });
    const keys = cacheRead.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(5);
  });

  test('detalle conserva ID de categoría, fuente y mes de la celda elegida', async () => {
    axios.get.mockResolvedValue({ data: { transactions: [] } });
    await readExpenseTransactions({ userId: 'reader', ownerId: 'owner', year: 2026, month: 8, categoryId: '12', sources: ['tc_nacional'] });
    expect(axios.get).toHaveBeenCalledWith('/api/dashboard/expense-evolution/transactions', expect.objectContaining({
      params: { year: 2026, month: 8, categoryId: '12', sources: 'tc_nacional', basis: 'billing', limit: 100, offset: 0 },
    }));
    expect(cacheRead.mock.calls[0][0]).toContain('reader:owner');
    expect(cacheRead.mock.calls[0][0]).toContain('12');
  });

  test('las páginas de detalle usan claves separadas para conservar totales sin mezclar movimientos', async () => {
    axios.get.mockResolvedValue({ data: { transactions: [] } });
    const detail = { userId: 'reader', ownerId: 'owner', year: 2026, month: 8, categoryId: '12', sources: ['tc_nacional'] };
    await readExpenseTransactions(detail);
    await readExpenseTransactions({ ...detail, offset: 100 });
    expect(cacheRead.mock.calls[0][0]).not.toBe(cacheRead.mock.calls[1][0]);
    expect(axios.get.mock.calls[1][1].params.offset).toBe(100);
  });

  test('una lectura cancelada no escribe caché ni sustituye datos después de cambiar espacio', async () => {
    const controller = new AbortController();
    axios.get.mockImplementation(async () => { controller.abort(); return { data: { old: true } }; });
    await expect(readExpenseReport(scope, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cacheRead).not.toHaveBeenCalled();
  });

  test('liquidez usa el mismo aislamiento de identidad, timeout y metadata que la evolución', async () => {
    const data = { disponibleHoy: 123, compromisos: { total: 200 } };
    axios.get.mockResolvedValue({ data });
    const result = await readExpenseLiquidity({ userId: 'reader', ownerId: 'owner', year: 2026, month: 10 });
    expect(axios.get).toHaveBeenCalledWith('/api/dashboard/overview', expect.objectContaining({ params: { year: 2026, month: 10 }, timeout: 15000 }));
    expect(result).toMatchObject({ data, origin: 'network', stale: false, cachedAt: expect.any(Number) });
    expect(cacheRead).toHaveBeenCalledWith(expect.stringContaining('reader:owner:2026:10:billing'), data);
  });

  test.each([401, 403])('liquidez nunca devuelve datos guardados tras rechazo %s', async (status) => {
    getCachedEntry.mockResolvedValue({ data: { disponibleHoy: 123 }, cachedAt: 1000 });
    axios.get.mockRejectedValue({ response: { status } });
    await expect(readExpenseLiquidity({ userId: 'reader', ownerId: 'owner', year: 2026, month: 10 })).rejects.toMatchObject({ response: { status } });
    expect(getCachedEntry).not.toHaveBeenCalled();
  });

  test('liquidez cacheada conserva la fecha original y declara que no se pudo actualizar', async () => {
    const data = { disponibleHoy: 123 };
    getCachedEntry.mockResolvedValue({ data, cachedAt: 1000 });
    axios.get.mockRejectedValue(new Error('Network error'));
    await expect(readExpenseLiquidity({ userId: 'reader', ownerId: 'owner', year: 2026, month: 10 })).resolves.toMatchObject({ data, origin: 'cache', stale: true, cachedAt: 1000 });
  });
});
