const Checking = require('../models/Checking');
const db = require('../config/database');
const XLSX = require('xlsx');

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
    const { year, month, recent } = req.query;
    
    // Si se pide recent=true, traer últimos 6 meses
    if (recent === 'true') {
      const rows = await model.listRecentMonths(req.user.id, 6);
      const total = rows.length;
      return res.json({ items: rows, total });
    }
    
    // Si se especifica año/mes, filtrar por ese período
    if (year && month) {
      const { y, m } = ensureValidPeriod(year, month);
      const rows = await model.list(req.user.id, y, m);
      return res.json(rows);
    }
    
    // Default: últimos 6 meses
    const rows = await model.listRecentMonths(req.user.id, 6);
    return res.json({ items: rows, total: rows.length });
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

async function globalBalance(req, res) {
  try {
    const result = await model.globalBalance(req.user.id);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message || 'Error al obtener saldo global' }); }
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

/**
 * Importar cartola Banco de Chile desde archivo Excel
 * Formato esperado:
 * - Encabezados en fila 23: Fecha, Descripción, Canal, Cargos, Abonos, Saldo
 * - Datos desde fila 24
 */
async function importFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    console.log(`[checking] Sheet '${sheetName}' rows: ${data.length}`);

    // Buscar fila de encabezados (contiene "Fecha", "Descripción", "Cargos", "Abonos")
    let headerRowIdx = -1;
    let colMap = {};
    
    for (let i = 0; i < Math.min(data.length, 50); i++) {
      const row = data[i];
      const rowStr = row.map(c => String(c).toLowerCase()).join('|');
      
      if (rowStr.includes('fecha') && rowStr.includes('descripci') && 
          (rowStr.includes('cargo') || rowStr.includes('abono'))) {
        headerRowIdx = i;
        
        // Mapear columnas
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j]).toLowerCase();
          if (cell.includes('fecha') && !colMap.fecha) colMap.fecha = j;
          if (cell.includes('descripci') && !colMap.descripcion) colMap.descripcion = j;
          if (cell.includes('cargo') && !colMap.cargos) colMap.cargos = j;
          if (cell.includes('abono') && !colMap.abonos) colMap.abonos = j;
          if (cell.includes('saldo') && !colMap.saldo) colMap.saldo = j;
        }
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).json({ 
        error: 'No se encontró la fila de encabezados. Asegúrate de que el archivo tenga columnas: Fecha, Descripción, Cargos, Abonos' 
      });
    }

    console.log(`[checking] Header row: ${headerRowIdx}, colMap:`, colMap);

    // Extraer transacciones y saldo actual
    const transactions = [];
    let saldoActual = null; // Saldo de la primera transacción (más reciente)
    
    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i];
      
      // Obtener fecha
      let fecha = row[colMap.fecha];
      if (!fecha) continue;
      
      // Convertir fecha DD/MM/YYYY a YYYY-MM-DD
      if (typeof fecha === 'string' && fecha.includes('/')) {
        const parts = fecha.split('/');
        if (parts.length === 3) {
          fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      } else if (fecha instanceof Date) {
        fecha = fecha.toISOString().slice(0, 10);
      }
      
      // Validar que la fecha sea válida
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      
      const descripcion = String(row[colMap.descripcion] || '').trim();
      if (!descripcion || descripcion.length < 2) continue;
      
      const cargos = Number(row[colMap.cargos]) || 0;
      const abonos = Number(row[colMap.abonos]) || 0;
      const saldo = colMap.saldo !== undefined ? Number(row[colMap.saldo]) || 0 : null;
      
      // Tomar el saldo de la primera transacción (la más reciente)
      if (saldoActual === null && saldo !== null && saldo > 0) {
        saldoActual = saldo;
        console.log(`[checking] Saldo actual extraído de cartola: $${saldo}`);
      }
      
      // Si tiene cargo, es tipo 'cargo'. Si tiene abono, es tipo 'abono'
      if (cargos > 0) {
        transactions.push({
          fecha,
          descripcion,
          tipo: 'cargo',
          amount: cargos
        });
      } else if (abonos > 0) {
        transactions.push({
          fecha,
          descripcion,
          tipo: 'abono',
          amount: abonos
        });
      }
    }

    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No se encontraron transacciones válidas en el archivo' });
    }

    console.log(`[checking] Parsed ${transactions.length} transactions, saldo actual: $${saldoActual}`);

    // Importar con detección de duplicados
    const result = await model.bulkImport(req.user.id, transactions);
    
    // Guardar saldo conocido si se extrajo
    if (saldoActual !== null && transactions.length > 0) {
      const fechaMasReciente = transactions[0].fecha; // Primera transacción = más reciente
      await model.setKnownBalance(req.user.id, saldoActual, fechaMasReciente);
      console.log(`[checking] Saldo conocido guardado: $${saldoActual} al ${fechaMasReciente}`);
    }
    
    res.json({
      inserted: result.inserted,
      skipped: result.skipped,
      total: transactions.length,
      saldoActual: saldoActual
    });

  } catch (e) {
    console.error('Error importando cartola:', e);
    res.status(500).json({ error: e.message || 'Error al importar archivo' });
  }
}

module.exports = { getBalance, setBalance, list, summary, globalBalance, create, update, remove, importFile };
