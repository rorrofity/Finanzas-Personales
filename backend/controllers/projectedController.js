const db = require('../config/database');
const ProjectedModel = require('../models/Projected');

const projectedModel = new ProjectedModel(db);

function lastDayOfMonth(year, month) {
  // month: 1-12
  return new Date(year, month, 0).getDate();
}

function buildDateFromDay(year, month, day) {
  const maxDay = lastDayOfMonth(year, month);
  const d = Math.min(day, maxDay);
  return new Date(year, month - 1, d);
}

// GET /api/projected?year&month
const listProjected = async (req, res) => {
  try {
    const userId = req.user.id;
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month) {
      return res.status(400).json({ error: 'Se requiere year y month' });
    }

    // Load templates and materialize occurrences for requested month
    const templates = await projectedModel.getTemplatesByUser(userId);

    // Materialize only for this month
    for (const t of templates) {
      const startsBeforeOrEqual = (t.start_year < year) || (t.start_year === year && t.start_month <= month);
      if (!startsBeforeOrEqual) continue;

      const shouldExistThisMonth = t.repeat_monthly || (t.start_year === year && t.start_month === month);
      if (!shouldExistThisMonth) continue;

      const fecha = buildDateFromDay(year, month, t.day_of_month);
      await projectedModel.upsertOccurrence(userId, t, year, month, fecha);
    }

    const items = await projectedModel.listMonth(userId, year, month);
    res.json(items);
  } catch (error) {
    console.error('Error en listProjected:', error);
    res.status(500).json({ error: 'Error al obtener transacciones proyectadas' });
  }
};

// POST /api/projected
const createProjected = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      nombre, tipo, monto, day_of_month,
      year, month,
      category_id = null, notas = null,
      repeat_monthly = true,
      active = true,
    } = req.body;

    if (!nombre || nombre.length < 3 || nombre.length > 60) return res.status(400).json({ error: 'Nombre inválido' });
    if (!['ingreso','gasto'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    const m = parseFloat(monto);
    if (!m || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
    const day = parseInt(day_of_month, 10);
    if (!day || day < 1 || day > 31) return res.status(400).json({ error: 'Día inválido' });
    const y = parseInt(year, 10);
    const mo = parseInt(month, 10);
    if (!y || !mo) return res.status(400).json({ error: 'Periodo inválido' });

    const template = await projectedModel.createTemplate(userId, {
      nombre, tipo, monto: m, day_of_month: day, start_year: y, start_month: mo,
      category_id, notas, repeat_monthly
    });

    const fecha = buildDateFromDay(y, mo, day);
    await projectedModel.createOccurrenceForMonth(userId, template.id, y, mo, {
      nombre, tipo, monto: m, category_id, notas, active, fecha
    });

    const items = await projectedModel.listMonth(userId, y, mo);
    res.status(201).json({ message: 'Proyección creada', items });
  } catch (error) {
    console.error('Error en createProjected:', error);
    res.status(500).json({ error: 'Error al crear proyección' });
  }
};

// PUT /api/projected/:occurrenceId
const updateOccurrence = async (req, res) => {
  try {
    const userId = req.user.id;
    const { occurrenceId } = req.params;
    const { nombre, tipo, monto, category_id, notas, active } = req.body;

    const payload = {};
    if (nombre !== undefined) {
      if (!nombre || nombre.length < 3 || nombre.length > 60) return res.status(400).json({ error: 'Nombre inválido' });
      payload.nombre = nombre;
    }
    if (tipo !== undefined) {
      if (!['ingreso','gasto'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      payload.tipo = tipo;
    }
    if (monto !== undefined) {
      const m = parseFloat(monto);
      if (!m || m <= 0) return res.status(400).json({ error: 'Monto inválido' });
      payload.monto = m;
    }
    if (category_id !== undefined) payload.category_id = category_id || null;
    if (notas !== undefined) {
      if (notas && notas.length > 140) return res.status(400).json({ error: 'Notas demasiado largas' });
      payload.notas = notas || null;
    }
    if (active !== undefined) payload.active = !!active;

    // Get occurrence to find template_id and current year/month
    const occurrence = await projectedModel.getOccurrenceById(userId, occurrenceId);
    if (!occurrence) {
      return res.status(404).json({ error: 'Ocurrencia no encontrada' });
    }

    // Update current occurrence
    const updated = await projectedModel.updateOccurrence(userId, occurrenceId, payload);

    // Propagate changes to template and future occurrences (except 'active' which is per-occurrence)
    const templatePayload = { ...payload };
    delete templatePayload.active; // 'active' is per-occurrence, not propagated

    if (Object.keys(templatePayload).length > 0) {
      // Update template
      await projectedModel.updateTemplate(userId, occurrence.template_id, templatePayload);
      
      // Update future occurrences (months after current)
      const futureUpdated = await projectedModel.updateFutureOccurrences(
        userId, 
        occurrence.template_id, 
        occurrence.year, 
        occurrence.month, 
        templatePayload
      );
      console.log(`[projected] Updated template and ${futureUpdated} future occurrences`);
    }

    res.json({ message: 'Proyección actualizada', occurrence: updated });
  } catch (error) {
    console.error('Error en updateOccurrence:', error);
    res.status(500).json({ error: 'Error al actualizar proyección' });
  }
};

// DELETE /api/projected/:occurrenceId
const deleteOccurrence = async (req, res) => {
  try {
    const userId = req.user.id;
    const { occurrenceId } = req.params;
    const deleted = await projectedModel.deleteOccurrence(userId, occurrenceId);
    res.json({ message: 'Proyección (mes) eliminada', occurrence: deleted });
  } catch (error) {
    console.error('Error en deleteOccurrence:', error);
    res.status(500).json({ error: 'Error al eliminar proyección' });
  }
};

// DELETE /api/projected/template/:templateId?fromYear&fromMonth
const deleteTemplateForward = async (req, res) => {
  try {
    const userId = req.user.id;
    const { templateId } = req.params;
    const y = parseInt(req.query.fromYear, 10);
    const m = parseInt(req.query.fromMonth, 10);
    if (!y || !m) return res.status(400).json({ error: 'fromYear y fromMonth requeridos' });
    const deleted = await projectedModel.deleteTemplateForward(userId, templateId, y, m);
    res.json({ message: 'Plantilla eliminada desde el mes indicado', template: deleted });
  } catch (error) {
    console.error('Error en deleteTemplateForward:', error);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
  }
};

module.exports = {
  listProjected,
  createProjected,
  updateOccurrence,
  deleteOccurrence,
  deleteTemplateForward,
};
