import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from '../../config/axios';
import NotificationsSettings from '../NotificationsSettings';

jest.mock('../../config/axios', () => ({ get: jest.fn(), put: jest.fn() }));
jest.mock('../../hooks/usePushNotifications', () => () => ({ supported: false }));
jest.mock('../../services/pushClient', () => ({ sendTestPush: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test.each([false, true])('comunica la ventana horaria y conserva la preferencia existente (%s)', async enabled => {
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/sync/settings' ? { autoSyncEnabled: enabled } : { runs: [] } }));
  render(<NotificationsSettings />);
  const toggle = screen.getByRole('checkbox', { name: 'Sincronizar automáticamente (cada hora de 08:00 a 00:00)' });
  await waitFor(() => expect(toggle.checked).toBe(enabled));
  expect(screen.getByText(/cada hora, de 08:00 a 00:00.*America\/Santiago/)).toBeInTheDocument();
  expect(screen.queryByText(/dos veces al día|13:00 y 22:00/)).not.toBeInTheDocument();
  expect(axios.put).not.toHaveBeenCalled();
});

test('desactivar sigue modificando solamente la preferencia de sincronización', async () => {
  axios.get.mockImplementation(path => Promise.resolve({ data: path === '/api/sync/settings' ? { autoSyncEnabled: true } : { runs: [] } }));
  axios.put.mockResolvedValue({ data: { autoSyncEnabled: false } });
  render(<NotificationsSettings />);
  const toggle = screen.getByRole('checkbox', { name: 'Sincronizar automáticamente (cada hora de 08:00 a 00:00)' });
  await waitFor(() => expect(toggle).toBeChecked());
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(axios.put).toHaveBeenCalledTimes(1);
  expect(axios.put).toHaveBeenCalledWith('/api/sync/settings', { autoSyncEnabled: false });
});
