import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme';
import UncategorizedFilter, { isUncategorized } from '../UncategorizedFilter';

test.each([null,undefined,''])('sin ID de categoría (%s) permanece pendiente',category_id=>expect(isUncategorized({category_id})).toBe(true));
test.each([1,'12',0])('un ID presente (%s) no se interpreta desde el nombre legacy',category_id=>expect(isUncategorized({category_id,categoria:'Sin categorizar'})).toBe(false));
test('la ausencia de category_id se identifica sin modificar la fila',()=>{const row=Object.freeze({descripcion:'Dato ficticio',categoria:'Categoría legacy'});expect(isUncategorized(row)).toBe(true);expect(Object.keys(row)).toEqual(['descripcion','categoria'])});
test.each(['light','dark'])('botón anuncia contador y selección en tema %s',mode=>{const change=jest.fn();render(<ThemeProvider theme={createAppTheme(mode)}><UncategorizedFilter active={false} count={3} onChange={change}/></ThemeProvider>);const button=screen.getByRole('button',{name:'Sin categoría (3)',pressed:false});fireEvent.click(button);expect(change).toHaveBeenCalledWith(true);expect(change).toHaveBeenCalledTimes(1)});
test('contador cero permite activar y retirar el filtro',()=>{function Example(){const [active,setActive]=useState(false);return <UncategorizedFilter active={active} count={0} onChange={setActive}/>};render(<Example/>);const button=screen.getByRole('button',{name:'Sin categoría (0)'});expect(button).toBeEnabled();fireEvent.click(button);expect(button).toHaveAttribute('aria-pressed','true');fireEvent.click(button);expect(button).toHaveAttribute('aria-pressed','false')});
test('se puede activar y retirar con el teclado',async()=>{const user=userEvent.setup();function Example(){const [active,setActive]=useState(false);return <UncategorizedFilter active={active} count={2} onChange={setActive}/>};render(<Example/>);const button=screen.getByRole('button',{name:'Sin categoría (2)'});await user.tab();expect(button).toHaveFocus();await user.keyboard('{Enter}');expect(button).toHaveAttribute('aria-pressed','true');await user.keyboard(' ');expect(button).toHaveAttribute('aria-pressed','false')});
