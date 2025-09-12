const IntlUnbilled = require('../models/IntlUnbilled');
const db = require('../config/database');

const model = new IntlUnbilled(db);

async function listByMonth(req, res) {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Se requiere year y month' });
    const rows = await model.listByMonth(req.user.id, parseInt(year, 10), parseInt(month, 10));
    res.json(rows);
  } catch (e) {
    console.error('intl list error', e);
    res.status(500).json({ error: 'Error al listar transacciones internacionales' });
  }
}

async function summaryByMonth(req, res) {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Se requiere year y month' });
    const rows = await model.summaryByMonth(req.user.id, parseInt(year, 10), parseInt(month, 10));
    res.json(rows);
  } catch (e) {
    console.error('intl summary error', e);
    res.status(500).json({ error: 'Error al obtener resumen internacional' });
  }
}

async function bulkImport(req, res) {
  try {
    const { brand, exchange_rate, rows } = req.body || {};
    if (!rows || !Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Sin filas para importar' });
    const result = await model.bulkImport(req.user.id, { brand, exchange_rate, rows });
    res.status(201).json(result);
  } catch (e) {
    console.error('intl bulk import error', e);
    res.status(400).json({ error: e.message || 'Error al importar internacionales' });
  }
}

async function create(req, res) {
  try {
    const created = await model.create(req.user.id, req.body || {});
    res.status(201).json(created);
  } catch (e) {
    console.error('intl create error', e);
    res.status(400).json({ error: e.message || 'Error al crear' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const updated = await model.update(req.user.id, id, req.body || {});
    res.json(updated);
  } catch (e) {
    console.error('intl update error', e);
    res.status(400).json({ error: e.message || 'Error al actualizar' });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    await model.delete(req.user.id, id);
    res.json({ success: true });
  } catch (e) {
    console.error('intl delete error', e);
    res.status(400).json({ error: e.message || 'Error al eliminar' });
  }
}

module.exports = { listByMonth, summaryByMonth, bulkImport, create, update, remove };
