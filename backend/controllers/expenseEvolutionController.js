const service = require('../services/expenseEvolutionService');

const read = (method) => async (req, res) => {
  try {
    return res.json(await method(req.user.id, req.query));
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    // Do not include SQL, financial rows or credentials in the response/log.
    console.error('[expense-evolution] No se pudo completar la lectura');
    return res.status(500).json({ error: 'No se pudieron consultar los gastos. Intenta nuevamente.' });
  }
};

module.exports = {
  getExpenseEvolution: read(service.getEvolution),
  getExpenseTransactions: read(service.getTransactions),
};
