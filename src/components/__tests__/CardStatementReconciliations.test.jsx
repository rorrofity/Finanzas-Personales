import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import axios from '../../config/axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSpace } from '../../contexts/SpaceContext';
import { createAppTheme } from '../../theme';
import CardStatementReconciliations from '../CardStatementReconciliations';

jest.mock('../../config/axios', () => ({ get: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../contexts/SpaceContext', () => ({ useSpace: jest.fn() }));
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const counts = { matched: 1, missing: 1, review: 1, informational: 1 };
const statement = patch => ({ id: ID, network: 'visa', statementDate: '2030-04-22', period: { since: '2030-03-23', until: '2030-04-22' }, dueDate: '2030-05-05',
  validation: { valid: true, issues: [] }, status: 'review', revisionConflict: false,
  sections: [{ scope: 'national', currency: 'CLP', totals: { previousBilled: '40000', payments: '-40000', automaticPayments: '0', purchases: '12500', installments: '2500', voluntaryServices: '0', charges: '500', billedTotal: '15500' }, validation: { valid: true, issues: [] }, counts },
    { scope: 'international', currency: 'USD', totals: { previousBilled: '0.00', payments: '0.00', purchases: '18.35', charges: '0.00', debtTotal: '18.35', credited: '0.00', transferToNational: '0.00' }, validation: { valid: true, issues: [] }, counts: { matched: 1, missing: 0, review: 0, informational: 0 } }], ...patch });
const row = (key, status, patch={}) => ({ rowKey: key, page: 1, date: '2030-04-10', description: `Comercio ficticio ${key}`, reference: `ref_${key}`, cardLastFour: '1234', kind: 'purchase', currency: 'CLP', amount: '12500', operationAmount: '12500', installmentNumber: 1, installmentTotal: 1,
  finding: { status, reason: status === 'missing' ? 'no_candidate' : status === 'review' ? 'ambiguous_candidates' : status === 'informational' ? 'payment' : 'exact_match', candidateCount: status === 'review' ? 2 : status === 'matched' ? 1 : 0, sourceType: status === 'matched' ? 'transaction' : null, sourceId: status === 'matched' ? OTHER : null, periodMismatch: false }, ...patch });
const detail = patch => { const s=statement(); return { ...s, sections: s.sections.map((section,i)=>({ ...section, items: i ? [row('dolares','matched',{currency:'USD',amount:'18.35',operationAmount:'18.35'})] : [row('ausente','missing'),row('dudoso','review'),row('existente','matched'),row('pago','informational',{kind:'payment',amount:'-40000'})] })), ...patch }; };
const deferred = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}; };
const element = (props={},mode='light') => <ThemeProvider theme={createAppTheme(mode)}><CardStatementReconciliations year={2030} month={5} {...props}/></ThemeProvider>;
const mount = (props={},mode='light') => render(element(props,mode));
function fixtures(list=statement(), result=detail()) { axios.get.mockImplementation(path=>Promise.resolve({data:path==='/api/card-statements'?{items:list===null?[]:[list]}:result})); }
beforeEach(()=>{jest.clearAllMocks();useAuth.mockReturnValue({user:{id:'owner-fixture'}});useSpace.mockReturnValue({activeSpace:{ownerId:'owner-fixture',isOwner:true}})});

test.each(['light','dark'])('separa totales CLP/USD y validación documental de cobertura en %s',async mode=>{
 fixtures();mount({},mode);const region=await screen.findByRole('region',{name:'Estado Visa del 22/04/2030'});
 expect(region).toHaveTextContent('Por revisar');expect(region).toHaveTextContent('Totales del documento validados');
 expect(region).toHaveTextContent('$15.500');expect(region).toHaveTextContent('US$ 18,35');
 expect(region).toHaveTextContent('23/03/2030 al 22/04/2030');expect(region).toHaveTextContent('05/05/2030');
 expect(region).toHaveTextContent('Nacional · CLP');expect(region).toHaveTextContent('Internacional · USD');
 expect(region).not.toHaveTextContent(/todo cuadrado|conciliación completada/i);
});
test('consulta únicamente GET privado por mes de vencimiento, sin storage ni datos bancarios extra',async()=>{
 fixtures();const write=jest.spyOn(Storage.prototype,'setItem');mount();await screen.findByText('$15.500');
 expect(axios.get).toHaveBeenCalledTimes(1);expect(axios.get).toHaveBeenCalledWith('/api/card-statements',expect.objectContaining({params:{year:2030,month:5},signal:expect.anything(),headers:{'Cache-Control':'no-store'}}));expect(write).not.toHaveBeenCalled();write.mockRestore();
});
test('listado vacío no anuncia cierre conciliado',async()=>{fixtures(null);mount();expect(await screen.findByText('No hay estados recibidos para este vencimiento.')).toBeInTheDocument();expect(screen.queryByText('Sin diferencias detectadas')).not.toBeInTheDocument()});
test('detalle muestra diferencias primero, preserva moneda, cuotas y contexto de pago',async()=>{
 fixtures();mount();await fireEvent.click(await screen.findByRole('button',{name:'Ver detalle Visa'}));const dialog=await screen.findByRole('dialog');
 expect(await within(dialog).findByText('Comercio ficticio ausente')).toBeInTheDocument();expect(within(dialog).getByText('Comercio ficticio dudoso')).toBeInTheDocument();
 expect(within(dialog).queryByText('Comercio ficticio existente')).not.toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole('button',{name:'Todos los movimientos'}));
 expect(within(dialog).getByText('Comercio ficticio existente')).toBeInTheDocument();expect(within(dialog).getByText('Comercio ficticio pago')).toBeInTheDocument();expect(within(dialog).getByText('-$40.000')).toBeInTheDocument();expect(within(dialog).getByText('US$ 18,35')).toBeInTheDocument();
 expect(axios.get.mock.calls[1][0]).toBe('/api/card-statements/'+ID);expect(dialog).not.toHaveTextContent(OTHER);
});
test('importe y cuota mensual se leen exactamente sin usar precio total como gasto del mes',async()=>{
 const s=detail();s.sections[0].items=[row('cuota','review',{kind:'installment',amount:'2500',operationAmount:'15000',installmentNumber:2,installmentTotal:6})];fixtures(statement(),s);mount();fireEvent.click(await screen.findByRole('button',{name:'Ver detalle Visa'}));const dialog=await screen.findByRole('dialog');
 expect(await within(dialog).findByText('Cuota 2 de 6')).toBeInTheDocument();expect(within(dialog).getByText('$2.500')).toBeInTheDocument();expect(within(dialog).getByText('Monto de la operación: $15.000')).toBeInTheDocument();
});
test('valores superiores a Number.MAX_SAFE_INTEGER se formatean sin perder pesos',async()=>{
 const s=statement();s.sections[0].totals.billedTotal='9007199254740993';s.sections[1].totals.debtTotal='90071992547409.93';fixtures(s);mount();expect(await screen.findByText('$9.007.199.254.740.993')).toBeInTheDocument();expect(screen.getByText('US$ 90.071.992.547.409,93')).toBeInTheDocument();
});
test('diferencia de período del registro se presenta para revisión',async()=>{const d=detail();d.sections[0].items=[row('periodo','review',{finding:{...row('x','review').finding,reason:'period_mismatch',periodMismatch:true}})];fixtures(statement(),d);mount();fireEvent.click(await screen.findByRole('button',{name:'Ver detalle Visa'}));expect(await screen.findByText('El período del cargo registrado difiere del estado.')).toBeInTheDocument()});
test('documento inválido y versión diferente no aparentan conciliación cerrada',async()=>{fixtures(statement({validation:{valid:false,issues:['TOTAL_MISMATCH']},status:'invalid',revisionConflict:true}));mount();expect(await screen.findByText('Documento con observaciones')).toBeInTheDocument();expect(screen.getByText(/otra versión del mismo estado/i)).toBeInTheDocument();expect(screen.queryByText('Totales del documento validados')).not.toBeInTheDocument()});
test('totales ausentes se muestran como no informados, nunca cero inventado',async()=>{const s=statement();s.sections[0].totals.billedTotal=null;fixtures(s);mount();expect(await screen.findByText('Total facturado: no informado')).toBeInTheDocument()});
test.each([
 {user:null,space:{ownerId:'owner-fixture',isOwner:true}},
 {user:{id:'member'},space:{ownerId:'owner-fixture',isOwner:false}},
 {user:{id:'owner-fixture'},space:{ownerId:'another',isOwner:true}},
])('otros espacios no consultan datos privados (%j)',({user,space})=>{useAuth.mockReturnValue({user});useSpace.mockReturnValue({activeSpace:space});mount();expect(axios.get).not.toHaveBeenCalled();expect(screen.getByText('Solo el titular puede consultar estos estados de tarjetas.')).toBeInTheDocument()});
test.each([401,403,500])('error HTTP %s no expone respuesta privada',async status=>{axios.get.mockRejectedValue({response:{status,data:{error:'sk_live_PRIVATE_PDF_PASSWORD'}}});mount();expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');expect(screen.queryByText('$15.500')).not.toBeInTheDocument()});
test.each([
 {items:'bad'}, {items:[statement({id:'../../private'})]}, {items:[statement({network:'other'})]},
 {items:[statement({sections:[{...statement().sections[0],currency:'USD'}]})]},
 {items:[statement({sections:[{...statement().sections[0],counts:{matched:-1,missing:0,review:0,informational:0}}]})]},
 {items:[statement({sections:[{...statement().sections[0],totals:{billedTotal:12500}}]})]},
])('respuesta inválida no se representa como estado verificado',async data=>{axios.get.mockResolvedValue({data});mount();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron verificar los estados recibidos.');expect(screen.queryByText('$15.500')).not.toBeInTheDocument()});
test('respuesta tardía de otra sesión no aparece en listado ni detalle',async()=>{
 const pending=deferred();axios.get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({data:{items:[]}});const view=mount();const oldSignal=axios.get.mock.calls[0][1].signal;
 useAuth.mockReturnValue({user:{id:'next-owner'}});useSpace.mockReturnValue({activeSpace:{ownerId:'next-owner',isOwner:true}});view.rerender(element());expect(oldSignal.aborted).toBe(true);
 await screen.findByText('No hay estados recibidos para este vencimiento.');await act(async()=>pending.resolve({data:{items:[statement()]}}));expect(screen.queryByText('$15.500')).not.toBeInTheDocument();
});
test('cambio de período cierra el detalle, aborta su respuesta y solicita el nuevo listado',async()=>{
 const pending=deferred();axios.get.mockImplementation(path=>path==='/api/card-statements'?Promise.resolve({data:{items:[statement()]}}):pending.promise);const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Ver detalle Visa'}));await waitFor(()=>expect(axios.get).toHaveBeenCalledTimes(2));const signal=axios.get.mock.calls[1][1].signal;
 view.rerender(element({month:6}));expect(signal.aborted).toBe(true);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();await act(async()=>pending.resolve({data:detail()}));expect(screen.queryByText('Comercio ficticio ausente')).not.toBeInTheDocument();await waitFor(()=>expect(axios.get).toHaveBeenCalledTimes(3));
});
test('un fallo en detalle no convierte la lista previa en otra fuente de datos',async()=>{axios.get.mockImplementation(path=>path==='/api/card-statements'?Promise.resolve({data:{items:[statement()]}}):Promise.reject({response:{data:{error:'PRIVATE'}}}));mount();fireEvent.click(await screen.findByRole('button',{name:'Ver detalle Visa'}));const dialog=await screen.findByRole('dialog');expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo consultar el detalle de este estado.');expect(dialog).not.toHaveTextContent('PRIVATE')});
test('desmontar cancela requests pendientes',()=>{const pending=deferred();axios.get.mockReturnValue(pending.promise);const view=mount();const signal=axios.get.mock.calls[0][1].signal;view.unmount();expect(signal.aborted).toBe(true)});

test('el estado sin diferencias limita su conclusión a los cargos comparados',async()=>{
 const s=statement({status:'ready'});s.sections=s.sections.map(section=>({...section,counts:{matched:1,missing:0,review:0,informational:2}}));fixtures(s);mount();
 expect(await screen.findByText('Sin diferencias en cargos')).toBeInTheDocument();expect(screen.queryByText(/saldo conciliado|todo cuadrado|deuda conciliada/i)).not.toBeInTheDocument();
});
test('validación documental fallida impide etiqueta lista aunque el servidor declare ready',async()=>{
 const s=statement({status:'ready',validation:{valid:false,issues:['TOTAL_MISMATCH']}});s.sections=s.sections.map(section=>({...section,counts:{matched:1,missing:0,review:0,informational:0}}));fixtures(s);mount();
 expect(await screen.findByText('Documento con observaciones')).toBeInTheDocument();expect(screen.queryByText('Sin diferencias en cargos')).not.toBeInTheDocument();
});

test('un archivo fallido sin cabecera se muestra como observación sin romper el listado',async()=>{
 fixtures(statement({network:null,statementDate:null,period:{since:null,until:null},dueDate:null,status:'invalid',validation:{valid:false,issues:['STATEMENT_EXTRACTION_FAILED']},sections:[]}));mount();
 expect(await screen.findByText('Documento con observaciones')).toBeInTheDocument();expect(screen.getByText('No se identificaron secciones válidas en el archivo.')).toBeInTheDocument();expect(screen.queryByText('No se pudieron verificar los estados recibidos.')).not.toBeInTheDocument();
});
