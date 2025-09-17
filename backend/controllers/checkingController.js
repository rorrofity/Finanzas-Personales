const Checking = require('../models/Checking');
const db = require('../config/database');

const model = new Checking(db);

function ensureValidPeriod(year, month) {
  const y = parseInt(year, 10); const m = parseInt(month, 10);
  if (!y || y < 2000 || y > 2100) throw new Error('Año inválido');
  if (!m || m < 1 || m > 12) throw new Error('Mes inválido');
  return { y, m };
}

async function getBalance(req, res) {
  try {
    const { year, month } = req.query; if (!year || !month) return res.status(400).json({ error: 'Se requiere year y month' });
    const { y, m } = ensureValidPeriod(year, month);
    const initial = await model.getInitialBalance(req.user.id, y, m);
    res.json({ initial_balance: Number(initial) });
  } catch (e) { res.status(400).json({ error: e.message || 'Error al obtener saldo' }); }
}

async function setBalance(req, res) {
  try {
    const { year, month, amount } = req.body || {};
    const { y, m } = ensureValidPeriod(year, month);
    const a = Number(amount); if (Number.isNaN(a) || a < 0) return res.status(400).json({ error: 'Monto inválido (>= 0)' });
    const out = await model.setInitialBalance(req.user.id, y, m, a);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message || 'Error al guardar saldo' }); }
}

async function list(req, res) {
  try {
    const { year, month, page, pageSize } = req.query;
    if (year && month) {
      const { y, m } = ensureValidPeriod(year, month);
      const rows = await model.list(req.user.id, y, m);
      return res.json(rows);
    }
    // Full history with pagination
    const p = Number.isFinite(parseInt(page, 10)) ? parseInt(page, 10) : 0;
    const ps = Number.isFinite(parseInt(pageSize, 10)) ? parseInt(pageSize, 10) : 10;
    const total = await model.countAll(req.user.id);
    const rows = await model.listPaged(req.user.id, ps, p * ps);
    return res.json({ items: rows, total });
  } catch (e) { res.status(400).json({ error: e.message || 'Error al listar movimientos' }); }
}

async function summary(req, res) {
  try {
    const { year, month } = req.query; if (!year || !month) return res.status(400).json({ error: 'Se requiere year y month' });
    const { y, m } = ensureValidPeriod(year, month);
    const s = await model.summary(req.user.id, y, m);
    res.json(s);
  } catch (e) { res.status(400).json({ error: e.message || 'Error al resumen' }); }
}

function ensureMovementValid(body) {
  const { fecha, descripcion, tipo, amount } = body;
  if (!fecha) throw new Error('Fecha requerida');
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida');
  if (!descripcion || descripcion.trim().length < 3 || descripcion.trim().length > 60) throw new Error('Descripción entre 3 y 60');
  if (!['abono','cargo'].includes(String(tipo).toLowerCase())) throw new Error('Tipo inválido (abono/cargo)');
  const a = Number(amount); if (!a || a <= 0) throw new Error('Monto debe ser > 0');
}

async function create(req, res) {
  try {
    ensureMovementValid(req.body);
    const d = new Date(req.body.fecha);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const created = await model.create(req.user.id, { ...req.body, year: y, month: m, tipo: String(req.body.tipo).toLowerCase() });
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message || 'Error al crear movimiento' }); }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const patch = { ...req.body };
    if (patch.fecha) {
      const d = new Date(patch.fecha);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
      // Derivar periodo desde la nueva fecha
      patch.year = d.getFullYear();
      patch.month = d.getMonth() + 1;
    }
    if (patch.tipo) patch.tipo = String(patch.tipo).toLowerCase();
    if (patch.amount !== undefined) { const a = Number(patch.amount); if (!a || a <= 0) return res.status(400).json({ error: 'Monto debe ser > 0' }); }
    const updated = await model.update(req.user.id, id, patch);
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message || 'Error al actualizar movimiento' }); }
}

async function remove(req, res) {
  try {
    const { id } = req.params; await model.delete(req.user.id, id); res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message || 'Error al eliminar movimiento' }); }
}

module.exports = { getBalance, setBalance, list, summary, create, update, remove };
