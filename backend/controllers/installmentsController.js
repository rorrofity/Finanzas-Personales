const Installments = require('../models/Installments');
const db = require('../config/database');

const model = new Installments(db);

// List plans (optionally could add filters later)
async function listPlans(req, res) {
  try {
    const plans = await model.listPlans(req.user.id);
    res.json(plans);
  } catch (e) {
    console.error('listPlans error', e);
    res.status(500).json({ error: 'Error al listar planes de cuotas' });
  }
}

// List occurrences by month for dashboard/page
async function listOccurrencesByMonth(req, res) {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Se requiere year y month' });
    const occ = await model.listOccurrencesByMonth(req.user.id, parseInt(year, 10), parseInt(month, 10));
    res.json(occ);
  } catch (e) {
    console.error('listOccurrencesByMonth error', e);
    res.status(500).json({ error: 'Error al listar cuotas del mes' });
  }
}

// Create a new installment plan and materialize future occurrences
async function createPlan(req, res) {
  try {
    const {
      brand, descripcion, amount_per_installment,
      total_installments, start_year, start_month, start_installment,
      category_id, notas
    } = req.body;

    if (!brand || !['visa','mastercard'].includes(String(brand).toLowerCase())) {
      return res.status(400).json({ error: 'Tarjeta inválida (visa/mastercard)' });
    }
    if (!descripcion || descripcion.trim().length < 3 || descripcion.trim().length > 100) {
      return res.status(400).json({ error: 'Descripción entre 3 y 100 caracteres' });
    }
    const amt = Number(amount_per_installment);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Monto por cuota debe ser > 0' });
    const ti = parseInt(total_installments, 10);
    const si = parseInt(start_installment, 10);
    const sy = parseInt(start_year, 10);
    const sm = parseInt(start_month, 10);
    if (!ti || !si || si < 1 || ti < 1 || si > ti) return res.status(400).json({ error: 'Cuota actual y total inválidos' });
    if (!sy || sy < 2000 || sy > 2100) return res.status(400).json({ error: 'Año inválido' });
    if (!sm || sm < 1 || sm > 12) return res.status(400).json({ error: 'Mes inválido' });

    const plan = await model.createPlan(req.user.id, {
      brand: brand.toLowerCase(),
      descripcion: descripcion.trim(),
      amount_per_installment: amt,
      total_installments: ti,
      start_year: sy,
      start_month: sm,
      start_installment: si,
      category_id: category_id || null,
      notas: (notas && String(notas).slice(0, 140)) || null
    });

    res.status(201).json(plan);
  } catch (e) {
    console.error('createPlan error', e);
    res.status(500).json({ error: 'Error al crear compra en cuotas' });
  }
}

async function updatePlan(req, res) {
  try {
    const { planId } = req.params;
    const updated = await model.updatePlan(req.user.id, planId, req.body || {});
    res.json(updated);
  } catch (e) {
    console.error('updatePlan error', e);
    res.status(500).json({ error: 'Error al actualizar el plan' });
  }
}

async function updateOccurrence(req, res) {
  try {
    const { occurrenceId } = req.params;
    const updated = await model.updateOccurrence(req.user.id, occurrenceId, req.body || {});
    res.json(updated);
  } catch (e) {
    console.error('updateOccurrence error', e);
    res.status(500).json({ error: 'Error al actualizar la cuota' });
  }
}

async function deleteOccurrence(req, res) {
  try {
    const { occurrenceId } = req.params;
    await model.deleteOccurrence(req.user.id, occurrenceId);
    res.json({ success: true });
  } catch (e) {
    console.error('deleteOccurrence error', e);
    res.status(500).json({ error: 'Error al eliminar la cuota' });
  }
}

async function deletePlanForward(req, res) {
  try {
    const { planId } = req.params;
    const { fromYear, fromMonth } = req.query;
    if (!fromYear || !fromMonth) return res.status(400).json({ error: 'Se requiere fromYear y fromMonth' });
    await model.deletePlanForward(req.user.id, planId, parseInt(fromYear, 10), parseInt(fromMonth, 10));
    res.json({ success: true });
  } catch (e) {
    console.error('deletePlanForward error', e);
    res.status(500).json({ error: 'Error al eliminar el plan desde el mes indicado' });
  }
}

module.exports = {
  listPlans,
  listOccurrencesByMonth,
  createPlan,
  updatePlan,
  updateOccurrence,
  deleteOccurrence,
  deletePlanForward,
};
