import axios from 'axios';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents';
import '../axios';
jest.mock('axios', () => ({ defaults: {}, interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } }));
const changed = jest.fn();
beforeEach(() => { changed.mockClear(); window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, changed); });
afterEach(() => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, changed));
const responseHandler = axios.interceptors.response.use.mock.calls[0][0];
const resolve = response => responseHandler(response);
test.each(['/api/transactions/id', '/api/intl-unbilled/id', '/api/projected/id', '/api/installments/id', '/api/checking/import-file', '/api/expense-splits/tc_nacional/id', '/api/sync/sync-emails'])('mutación financiera exitosa %s emite evento sin montos', path => {
  const response = { status: 200, config: { method: 'post', url: path }, data: { amount: 123 } }; expect(resolve(response)).toBe(response);
  expect(changed).toHaveBeenCalledTimes(1); expect(changed.mock.calls[0][0].detail).toBeUndefined();
});
test.each([{ method: 'get', url: '/api/financial-health/summary' }, { method: 'post', url: '/api/auth/login' }, { method: 'post', url: '/api/transactions-other' }])('lecturas y operaciones ajenas no crean bucles %j', config => {
  resolve({ status: 200, config }); expect(changed).not.toHaveBeenCalled();
});
