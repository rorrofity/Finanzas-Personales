import React from 'react';
import { render, screen } from '@testing-library/react';
import axios from 'axios';
import CategoryDetailDrawer from '../CategoryDetailDrawer';
jest.mock('axios', () => ({ get: jest.fn() }));
test('detalle legacy identifica parte atribuida y monto original con centavos', async () => {
  axios.get.mockResolvedValue({ data: { count:1,total:'100000.01', transactions:[{id:'split',fecha:'2030-05-01',descripcion:'Compra repartida ficticia',monto:'100000.01',originalAmount:'180000.02',isSplit:true,source:'tc_nacional'}] } });
  render(<CategoryDetailDrawer open onClose={jest.fn()} category="Calzado" year={2030} month={5} />);
  expect(await screen.findByText('Compra repartida ficticia')).toBeInTheDocument();
  expect(screen.getByText(/Total original: \$180\.000,02/)).toBeInTheDocument();
  expect(screen.getAllByText('$100.000,01')).toHaveLength(2);
});
