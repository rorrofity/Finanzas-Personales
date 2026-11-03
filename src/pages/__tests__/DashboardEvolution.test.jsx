import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
import { readExpenseReport, readExpenseLiquidity } from '../../services/expenseEvolution';
import axios from '../../config/axios';
import { fetchWithCache } from '../../services/readCache';

jest.mock('../../services/expenseEvolution', () => ({ readExpenseReport: jest.fn(), readExpenseTransactions: jest.fn(), readExpenseLiquidity: jest.fn() }));
jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../services/readCache', () => ({ fetchWithCache: jest.fn((key, fn) => fn()), getCachedEntry: jest.fn() }));
jest.mock('../../contexts/PeriodContext', () => ({ usePeriod: () => ({ year: 2026, month: 10 }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reader' } }) }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: () => ({ activeSpace: { ownerId: 'owner' } }) }));
jest.mock('../../contexts/OfflineContext', () => ({ useOfflineContext: () => ({ reconnectCount: 0, isOffline: false }) }));
jest.mock('../../components/MonthPicker', () => () => <div>octubre de 2026</div>);
jest.mock('../../components/SyncButton', () => () => <button>Sincronizar Emails</button>);
jest.mock('recharts', () => ({ ResponsiveContainer: ({children}) => <div>{children}</div>, LineChart: ({children}) => <div>{children}</div>, BarChart:({children})=><div>{children}</div>, ComposedChart:({children})=><div>{children}</div>, Line:()=>null, Bar:()=>null, XAxis:()=>null, YAxis:()=>null, CartesianGrid:()=>null, Tooltip:()=>null, Legend:()=>null }));

const report = (total) => ({
  scope:{endYear:2026,endMonth:10,months:6,basis:'billing',sources:['tc_nacional']},generatedAt:'2026-10-31T12:00:00Z',
  months:[{key:'2026-10',year:2026,month:10,label:'oct 2026',status:'current',total,count:1}],
  categories:[{id:'1',name:'Alimentación',total,currentTotal:total,previousTotal:0,delta:total,deltaPct:null,values:[{month:'2026-10',total,count:1}]}],
  summary:{total,currentTotal:total,previousTotal:0,delta:total,deltaPct:null},coverage:{status:'unknown',message:'Cobertura bancaria no verificada.',warnings:[]},exclusions:{missingPeriodCount:0,missingCLPCount:0}
});
const result = (total) => ({data:report(total),origin:'network',stale:false,cachedAt:Date.now()});
const renderPage = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);
const bankDto = amount => ({ source:'fintoc',amount,available:amount,current:amount,state:'available',freshness:'current',bankUpdatedAt:'2026-10-31T12:00:00Z',queriedAt:'2026-10-31T12:01:00Z' });

describe('Dashboard: selección coordinada del alcance (DCE-14/17)',()=>{
  beforeEach(()=>{
    jest.clearAllMocks();
    fetchWithCache.mockImplementation((key, fn) => fn());
    axios.get.mockResolvedValue({data:{disponibleHoy:100,compromisos:{total:200}}});
    readExpenseReport.mockResolvedValue(result(500));
    readExpenseLiquidity.mockResolvedValue({ data: { disponibleHoy:100, checking:bankDto('100'), compromisos:{total:200} }, origin: 'network', stale:false, cachedAt:Date.UTC(2026,9,31,12) });
  });

  test('muestra evolución como contenido principal con fuente y ventana explícitas',async()=>{
    renderPage();
    expect(await screen.findByRole('heading',{name:'Evolución de gastos'})).toBeInTheDocument();
    expect(await screen.findByTestId('expense-current-total')).toHaveTextContent('$500');
    expect(readExpenseReport).toHaveBeenCalledWith(expect.objectContaining({userId:'reader',ownerId:'owner',endYear:2026,endMonth:10,months:6,sources:['tc_nacional']}),expect.any(Object));
    expect(screen.getByRole('combobox',{name:'Ventana'})).toHaveValue('6');
    expect(screen.getByRole('combobox',{name:'Fuente'})).toHaveValue('tc_nacional');
  });

  test('descarta la respuesta tardía del filtro anterior',async()=>{
    let resolveFirst;
    readExpenseReport.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce(result(900));
    renderPage();
    fireEvent.change(screen.getByRole('combobox',{name:'Ventana'}),{target:{value:'3'}});
    expect(await screen.findByTestId('expense-current-total')).toHaveTextContent('$900');
    resolveFirst(result(200));
    await waitFor(()=>expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$900'));
  });

  test('un error borra el informe anterior y permite reintentar sin inventar ceros',async()=>{
    renderPage();
    expect(await screen.findByTestId('expense-current-total')).toHaveTextContent('$500');
    readExpenseReport.mockRejectedValueOnce(new Error('unavailable'));
    fireEvent.change(screen.getByRole('combobox',{name:'Fuente'}),{target:{value:'cuenta_corriente'}});
    expect(await screen.findByText(/No pudimos cargar la evolución/)).toBeInTheDocument();
    expect(screen.queryByTestId('expense-current-total')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Reintentar'})).toBeInTheDocument();
  });

  test('identifica los datos guardados y su fecha de consulta',async()=>{
    readExpenseReport.mockResolvedValueOnce({...result(700),origin:'cache',stale:true,cachedAt:Date.UTC(2026,9,30,15)});
    renderPage();
    expect(await screen.findByText(/Mostrando una consulta guardada/)).toBeInTheDocument();
    expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$700');
  });

  test('liquidez cacheada muestra fecha de referencia y no afirma actualización en vivo', async () => {
    readExpenseLiquidity.mockResolvedValueOnce({ data: { disponibleHoy:321, checking:bankDto('321'), compromisos:{total:200} }, origin:'cache', stale:true, cachedAt:Date.UTC(2026,9,30,15) });
    renderPage();
    expect(await screen.findByText(/Liquidez consultada:/)).toBeInTheDocument();
    expect(screen.getByText(/Consulta guardada de liquidez; no se pudo actualizar/)).toBeInTheDocument();
    expect(screen.getByText('$321')).toBeInTheDocument();
  });

  test('conserva la categoría seleccionada al cambiar la ventana de comparación', async () => {
    const data = report(500);
    data.categories.push({ ...data.categories[0], id:'2', name:'Transporte' });
    readExpenseReport.mockResolvedValue({ ...result(500), data });
    renderPage();
    const selector = await screen.findByRole('combobox', { name:'Categoría' });
    fireEvent.change(selector, { target:{value:'2'} });
    expect(screen.getByTestId('expense-trend')).toHaveAttribute('aria-label','Tendencia de Transporte');
    fireEvent.change(screen.getByRole('combobox',{name:'Ventana'}),{target:{value:'3'}});
    await waitFor(()=>expect(screen.getByTestId('expense-trend')).toHaveAttribute('aria-label','Tendencia de Transporte'));
  });

  test('compromisos con USD sin convertir muestran importe parcial sin alterar los gastos históricos', async()=>{
    readExpenseLiquidity.mockResolvedValueOnce({data:{disponibleHoy:321,checking:bankDto('321'),compromisos:{total:200,conversionPendingCount:2,amountsPartial:true}},origin:'network',stale:false,cachedAt:Date.UTC(2026,9,31,12)});
    renderPage();expect(await screen.findByText(/2 movimientos USD sin conversión/)).toBeInTheDocument();expect(screen.getByRole('button',{name:/Compromisos próximos/})).toHaveTextContent('importe parcial');expect(screen.getByTestId('expense-current-total')).toHaveTextContent('$500');expect(screen.getByText('$321')).toBeInTheDocument();
  });

  test('saldo bancario ausente no convierte null en cero ni recurre a un disponible legacy', async () => {
    readExpenseLiquidity.mockResolvedValueOnce({ data: { disponibleHoy:99999, checking:{source:'fintoc',state:'unavailable',amount:null,available:null,freshness:'unknown'}, compromisos:{total:200} },origin:'network',cachedAt:Date.now() });
    renderPage();
    expect(await screen.findByText('Saldo bancario no disponible')).toBeInTheDocument();
    expect(screen.queryByText('$99.999')).not.toBeInTheDocument();
  });

  test('saldo bancario antiguo conserva fecha y no se anuncia como disponible hoy', async () => {
    readExpenseLiquidity.mockResolvedValueOnce({ data: { disponibleHoy:12345, checking:{source:'fintoc',state:'available',amount:'12345',freshness:'stale',bankUpdatedAt:'2026-10-01T12:00:00Z'}, compromisos:{total:200} },origin:'network',cachedAt:Date.now() });
    renderPage();
    expect(await screen.findByText('Último saldo bancario conocido')).toBeInTheDocument();
    expect(screen.getByText('$12.345')).toBeInTheDocument();
    expect(screen.getByText(/Actualización bancaria:/)).toBeInTheDocument();
    expect(screen.queryByText('Disponible hoy')).not.toBeInTheDocument();
  });

  test('una cifra bancaria vacía no se transforma en cero disponible', async () => {
    readExpenseLiquidity.mockResolvedValueOnce({ data:{ disponibleHoy:99999,checking:{source:'fintoc',state:'available',amount:'',freshness:'current'},compromisos:{total:200} },origin:'network',cachedAt:Date.now() });
    renderPage(); expect(await screen.findByText('Saldo bancario no disponible')).toBeInTheDocument();
  });
});
