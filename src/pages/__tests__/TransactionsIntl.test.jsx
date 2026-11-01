import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import axios from 'axios';
import { createAppTheme } from '../../theme';
import TransactionsIntl from '../TransactionsIntl';

jest.mock('axios',()=>({get:jest.fn(),put:jest.fn(),post:jest.fn(),delete:jest.fn()}));
jest.mock('@mui/material',()=>({...jest.requireActual('@mui/material'),useMediaQuery:jest.fn()}));
jest.mock('../../contexts/PeriodContext',()=>({usePeriod:()=>({year:2030,month:5})}));
jest.mock('../../components/MonthPicker',()=>()=> <div>Período ficticio</div>);
jest.mock('../../components/SyncButton',()=>()=> <div>Sincronización ficticia</div>);
jest.mock('../../components/BillingPeriodConfig',()=>()=>null);
const pending={id:'fixture-usd',brand:'visa',fecha:'2030-04-10',descripcion:'Compra USD ficticia',amount_usd:'18.35',exchange_rate:null,amount_clp:null,tipo:'gasto',category_id:null};
const converted={...pending,id:'fixture-converted',descripcion:'Compra convertida ficticia',amount_usd:'10.00',exchange_rate:'900.0000',amount_clp:'9000.00',category_id:1};
const mount=(rows=[pending],mobile=false)=>{useMediaQuery.mockReturnValue(mobile);axios.get.mockImplementation(path=>Promise.resolve({data:path==='/api/categories'?[{id:1,name:'Comida ficticia'}]:rows}));return render(<ThemeProvider theme={createAppTheme('light')}><TransactionsIntl/></ThemeProvider>)};
beforeEach(()=>{jest.clearAllMocks();sessionStorage.clear();axios.put.mockResolvedValue({data:{}})});

test.each([false,true])('USD sin cambio muestra conversión pendiente y no una conversión $0 (%s)',async mobile=>{
 mount([pending],mobile);await screen.findByText(pending.descripcion);expect(screen.getByText('Conversión pendiente')).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('1 movimiento sin conversión');expect(screen.getAllByText('CLP pendiente').length).toBeGreaterThan(0);
 const row=screen.getByText(pending.descripcion).closest(mobile?'.MuiCard-root':'tr');expect(row).not.toHaveTextContent(/\$\s?0/);expect(row).toHaveTextContent('18.35');
});
test('mezcla de conversiones muestra total CLP parcial sin omitir los USD originales',async()=>{
 mount([pending,converted]);await screen.findByText(pending.descripcion);expect(screen.getByRole('alert')).toHaveTextContent('totales en CLP son parciales');expect(screen.getAllByText(/\$9\.000 parcial/).length).toBeGreaterThan(0);expect(screen.getByTestId('totals-row')).toHaveTextContent('$28.35');
});
test('edición de descripción con cambio pendiente no envía cero, NaN ni reescribe montos intactos',async()=>{
 mount();await screen.findByText(pending.descripcion);fireEvent.click(screen.getByRole('button',{name:/editar/i}));const dialog=screen.getByRole('dialog');expect(within(dialog).getByRole('spinbutton',{name:'Tipo de cambio'})).toHaveValue(null);
 fireEvent.change(within(dialog).getByRole('textbox',{name:'Descripción'}),{target:{value:'Descripción ficticia revisada'}});fireEvent.click(within(dialog).getByRole('button',{name:'Guardar'}));
 await waitFor(()=>expect(axios.put).toHaveBeenCalledTimes(1));const payload=axios.put.mock.calls[0][1];expect(payload.descripcion).toBe('Descripción ficticia revisada');expect(payload).not.toHaveProperty('exchange_rate');expect(payload).not.toHaveProperty('amount_usd');expect(JSON.stringify(payload)).not.toMatch(/NaN|"exchange_rate":0/);
});
test('un tipo de cambio ingresado debe ser positivo antes de guardar',async()=>{
 mount();await screen.findByText(pending.descripcion);fireEvent.click(screen.getByRole('button',{name:/editar/i}));const dialog=screen.getByRole('dialog');fireEvent.change(within(dialog).getByRole('spinbutton',{name:'Tipo de cambio'}),{target:{value:'0'}});fireEvent.click(within(dialog).getByRole('button',{name:'Guardar'}));await screen.findByText('Ingresa un tipo de cambio positivo o déjalo pendiente.');expect(axios.put).not.toHaveBeenCalled();
});
test('no cambia presentación de conversiones completas ni consulta más endpoints',async()=>{
 mount([converted]);await screen.findByText(converted.descripcion);expect(screen.queryByText('Conversión pendiente')).not.toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByText(converted.descripcion).closest('tr')).toHaveTextContent('$9.000');expect(axios.get.mock.calls.map(([path])=>path).sort()).toEqual(['/api/categories','/api/intl-unbilled']);expect(axios.put).not.toHaveBeenCalled();
});
