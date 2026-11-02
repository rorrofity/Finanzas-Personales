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
jest.mock('../../contexts/SpaceContext',()=>({useSpace:()=>({activeSpace:{isOwner:true,canEdit:true,canDelete:true}})}));
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


const filterButton = count => screen.getByRole('button', { name: new RegExp('^Sin categoría.*' + count) });
const assertNoWrites = () => { expect(axios.put).not.toHaveBeenCalled(); expect(axios.post).not.toHaveBeenCalled(); expect(axios.delete).not.toHaveBeenCalled(); };
test.each([false,true])('UCF: un clic muestra solo filas sin category_id y vuelve a todas (%s)',async mobile=>{
 const absent={...pending,id:'fixture-absent',descripcion:'Ausente ficticio'};delete absent.category_id;
 const empty={...pending,id:'fixture-empty',descripcion:'Vacío ficticio',category_id:'',categoria:'Nombre legacy no clasifica'};
 mount([pending,converted,absent,empty],mobile);await screen.findByText(converted.descripcion);const reads=axios.get.mock.calls.length;
 expect(filterButton(3)).toHaveAttribute('aria-pressed','false');fireEvent.click(filterButton(3));
 expect(filterButton(3)).toHaveAttribute('aria-pressed','true');expect(screen.queryByText(converted.descripcion)).not.toBeInTheDocument();
 expect(screen.getByText(pending.descripcion)).toBeInTheDocument();expect(screen.getByText(absent.descripcion)).toBeInTheDocument();expect(screen.getByText(empty.descripcion)).toBeInTheDocument();
 expect(axios.get).toHaveBeenCalledTimes(reads);assertNoWrites();fireEvent.click(filterButton(3));expect(screen.getByText(converted.descripcion)).toBeInTheDocument();assertNoWrites();
});
test('UCF: combina tarjeta y desestimados con contador del conjunto visible',async()=>{
 const mc={...pending,id:'fixture-mc',brand:'mastercard',descripcion:'Mastercard sin categoría'};
 const dismissed={...pending,id:'fixture-dismissed',descripcion:'Desestimado sin categoría',tipo:'desestimar'};
 mount([pending,converted,mc,dismissed]);await screen.findByText(mc.descripcion);expect(filterButton(3)).toBeInTheDocument();
 fireEvent.mouseDown(screen.getByRole('combobox',{name:'Tarjeta'}));fireEvent.click(await screen.findByRole('option',{name:'Visa'}));
 expect(filterButton(2)).toBeInTheDocument();fireEvent.click(screen.getByRole('checkbox',{name:'Ocultar desestimados en tabla'}));expect(filterButton(1)).toBeInTheDocument();
 fireEvent.click(filterButton(1));expect(screen.queryByText(converted.descripcion)).not.toBeInTheDocument();expect(screen.queryByText(mc.descripcion)).not.toBeInTheDocument();expect(screen.queryByText(dismissed.descripcion)).not.toBeInTheDocument();expect(screen.getByText(pending.descripcion)).toBeInTheDocument();assertNoWrites();
});
test('UCF: filtra antes de paginar y restablece la primera página',async()=>{
 const assigned=Array.from({length:10},(_,i)=>({...converted,id:'fixture-assigned-'+i,descripcion:'Asignado ficticio '+i}));
 mount([...assigned,pending]);await screen.findByText(assigned[0].descripcion);fireEvent.click(screen.getByRole('button',{name:/next page/i}));await screen.findByText(pending.descripcion);
 fireEvent.click(filterButton(1));expect(screen.getByText(pending.descripcion)).toBeInTheDocument();expect(screen.getByRole('button',{name:/next page/i})).toBeDisabled();expect(screen.getByRole('button',{name:/previous page/i})).toBeDisabled();assertNoWrites();
});
test('UCF: seleccionar todos afecta solo filas filtradas y limpiar filtro retira selección oculta',async()=>{
 mount([pending,converted]);await screen.findByText(converted.descripcion);fireEvent.click(filterButton(1));fireEvent.click(screen.getAllByRole('checkbox')[1]);
 expect(screen.getByRole('button',{name:'Eliminar seleccionadas (1)'})).toBeInTheDocument();expect(screen.getAllByRole('checkbox').filter(input=>input.checked)).toHaveLength(2);
 fireEvent.click(filterButton(1));await waitFor(()=>expect(screen.queryByRole('button',{name:/Eliminar seleccionadas/})).not.toBeInTheDocument());assertNoWrites();
});
test('UCF: al categorizar explícitamente la fila desaparece y el filtro vacío puede desactivarse',async()=>{
 mount();await screen.findByText(pending.descripcion);fireEvent.click(filterButton(1));const row=screen.getByText(pending.descripcion).closest('tr');
 fireEvent.mouseDown(within(row).getAllByRole('combobox')[1]);fireEvent.click(await screen.findByRole('option',{name:'Comida ficticia'}));
 await waitFor(()=>expect(axios.put).toHaveBeenCalledWith('/api/intl-unbilled/'+pending.id,{category_id:1}));
 await waitFor(()=>expect(screen.queryByText(pending.descripcion)).not.toBeInTheDocument());expect(screen.getByText('No hay transacciones internacionales sin categoría con estos filtros.')).toBeInTheDocument();expect(filterButton(0)).toHaveAttribute('aria-pressed','true');expect(filterButton(0)).toBeEnabled();fireEvent.click(filterButton(0));expect(screen.getByText(pending.descripcion)).toBeInTheDocument();expect(axios.put).toHaveBeenCalledTimes(1);expect(axios.post).not.toHaveBeenCalled();expect(axios.delete).not.toHaveBeenCalled();
});
test('UCF: categorizar en la última página limita la página y retira la selección que ya no es visible',async()=>{
 const warnings=jest.spyOn(console,'error').mockImplementation(()=>{});
 try {
 const rows=Array.from({length:11},(_,i)=>({...pending,id:'fixture-pending-'+i,descripcion:'Pendiente ficticio '+i}));
 mount(rows);await screen.findByText(rows[0].descripcion);fireEvent.click(filterButton(11));fireEvent.click(screen.getByRole('button',{name:/next page/i}));await screen.findByText(rows[10].descripcion);
 const row=screen.getByText(rows[10].descripcion).closest('tr');fireEvent.click(within(row).getByRole('checkbox'));expect(screen.getByRole('button',{name:'Eliminar seleccionadas (1)'})).toBeInTheDocument();
 fireEvent.mouseDown(within(row).getAllByRole('combobox')[1]);fireEvent.click(await screen.findByRole('option',{name:'Comida ficticia'}));
 await waitFor(()=>expect(axios.put).toHaveBeenCalledWith('/api/intl-unbilled/'+rows[10].id,{category_id:1}));await screen.findByText(rows[0].descripcion);
 expect(screen.queryByText(rows[10].descripcion)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/previous page/i})).toBeDisabled();expect(screen.queryByRole('button',{name:/Eliminar seleccionadas/})).not.toBeInTheDocument();expect(filterButton(10)).toHaveAttribute('aria-pressed','true');
 expect(warnings.mock.calls.flat().join(' ')).not.toContain('out of range');
 } finally { warnings.mockRestore(); }
});
