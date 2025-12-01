import axios from '../config/axios';

/**
 * Obtiene el conteo de transacciones sospechosas pendientes
 */
export const getSuspiciousCount = async () => {
  const response = await axios.get('/api/suspicious/count');
  return response.data.count;
};

/**
 * Obtiene todas las transacciones sospechosas pendientes
 */
export const getSuspiciousTransactions = async () => {
  const response = await axios.get('/api/suspicious');
  return response.data.suspicious;
};

/**
 * Resuelve un duplicado sospechoso
 * @param {string} suspiciousId - ID del registro sospechoso
 * @param {string} action - 'delete' o 'keep_both'
 * @param {string} transactionIdToDelete - ID de la transacción a eliminar (requerido si action='delete')
 * @param {string} type - 'national' o 'intl' para indicar el tipo de duplicado
 */
export const resolveSuspicious = async (suspiciousId, action, transactionIdToDelete = null, type = 'national') => {
  const response = await axios.post(`/api/suspicious/${suspiciousId}/resolve`, {
    action,
    transactionIdToDelete,
    type
  });
  return response.data;
};
