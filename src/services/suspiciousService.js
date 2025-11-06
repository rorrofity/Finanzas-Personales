import api from './api';

/**
 * Obtiene el conteo de transacciones sospechosas pendientes
 */
export const getSuspiciousCount = async () => {
  const response = await api.get('/suspicious/count');
  return response.data.count;
};

/**
 * Obtiene todas las transacciones sospechosas pendientes
 */
export const getSuspiciousTransactions = async () => {
  const response = await api.get('/suspicious');
  return response.data.suspicious;
};

/**
 * Resuelve un duplicado sospechoso
 * @param {string} suspiciousId - ID del registro sospechoso
 * @param {string} action - 'delete' o 'keep_both'
 * @param {string} transactionIdToDelete - ID de la transacción a eliminar (requerido si action='delete')
 */
export const resolveSuspicious = async (suspiciousId, action, transactionIdToDelete = null) => {
  const response = await api.post(`/suspicious/${suspiciousId}/resolve`, {
    action,
    transactionIdToDelete
  });
  return response.data;
};
