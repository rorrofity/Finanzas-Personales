const IntlUnbilled = require('../models/IntlUnbilled');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const model = new IntlUnbilled(db);

// Helpers to normalize headers and values
const stripDiacritics = (s='') => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');
const normalizeKey = (k='') => stripDiacritics(String(k)).trim().toLowerCase().replaceAll(/\s+/g, ' ');
const possibleHeaders = {
  fecha: ['fecha', 'date', 'fecha operación', 'fecha operacion'],
  descripcion: ['descripcion', 'descripción', 'description', 'detalle'],
  amount_usd: ['monto usd', 'monto (usd)', 'usd', 'amount usd', 'monto', 'monto(en usd)'],
  tipo_tarjeta: ['tipo de tarjeta', 'tarjeta', 'card type'],
  tipo: ['tipo'],
  categoria: ['categoryid', 'categoria', 'category_id']
};
const matchHeader = (obj, keys) => {
  const entries = Object.keys(obj || {});
  for (const k of entries) {
    const nk = normalizeKey(k);
    if (keys.includes(nk)) return k;
    // partial includes e.g., 'monto (usd)'
    if (keys.some(target => nk.includes(target))) return k;
  }
  return null;
};
const parseAmountUSD = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  // Handle parentheses for negatives
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  // Remove currency symbols and spaces
  s = s.replace(/[^0-9,.-]/g, '');
  // If both comma and dot exist, assume comma = thousands, dot = decimal
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    // comma as decimal
    s = s.replace(/\./g, '');
    s = s.replace(',', '.');
  }
  let num = parseFloat(s);
  if (isNaN(num)) return null;
  if (negative) num = -Math.abs(num);
  return num;
};
const parseDateFlexible = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') {
    // excel serial
    const utcDays = Math.floor(raw - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  const s = String(raw).trim();
  // try dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10);
    const yyyy = y < 100 ? (2000 + y) : y;
    return new Date(yyyy, mm, d);
  }
  // try ISO yyyy-mm-dd
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2;
  return null;
};

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
    if (!brand || !exchange_rate || !Array.isArray(rows)) return res.status(400).json({ error: 'brand, exchange_rate y rows requeridos' });
    const periodYear = parseInt(req.body.periodYear, 10);
    const periodMonth = parseInt(req.body.periodMonth, 10);
    const result = await model.bulkImport(req.user.id, { brand, exchange_rate, rows, periodYear, periodMonth });
    res.status(201).json(result);
  } catch (e) {
    console.error('intl bulk import error', e);
    res.status(400).json({ error: e.message || 'Error al importar' });
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

async function importFile(req, res) {
  try {
    const { brand, exchange_rate } = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    const b = String(brand || '').toLowerCase();
    const rate = Number(exchange_rate);
    if (!['visa','mastercard'].includes(b)) return res.status(400).json({ error: 'Tarjeta inválida (visa/mastercard)' });
    if (!rate || rate <= 0) return res.status(400).json({ error: 'Tipo de cambio inválido (> 0)' });

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let rows = [];
    if (fileExt === '.csv') {
      // Parse CSV with header detection
      const text = req.file.buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l && l.trim().length > 0);
      if (lines.length === 0) return res.status(400).json({ error: 'Archivo vacío' });
      const headerLine = lines[0];
      const delimiter = headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
      const header = headerLine.split(delimiter);
      const headerMap = header.reduce((acc, h, idx) => { acc[idx] = h; return acc; }, {});
      const H = {
        fecha: matchHeader(headerMap, possibleHeaders.fecha.map(normalizeKey)),
        descripcion: matchHeader(headerMap, possibleHeaders.descripcion.map(normalizeKey)),
        amount: matchHeader(headerMap, possibleHeaders.amount_usd.map(normalizeKey)),
        tipo: matchHeader(headerMap, possibleHeaders.tipo.map(normalizeKey)),
        categoria: matchHeader(headerMap, possibleHeaders.categoria.map(normalizeKey)),
        card: matchHeader(headerMap, possibleHeaders.tipo_tarjeta.map(normalizeKey))
      };
      for (const line of lines.slice(1)) {
        const parts = line.split(delimiter);
        const row = {};
        header.forEach((h, i) => { row[h] = parts[i]; });
        const fechaRaw = H.fecha ? row[H.fecha] : undefined;
        const descRaw = H.descripcion ? row[H.descripcion] : undefined;
        const amtRaw = H.amount ? row[H.amount] : undefined;
        const tipoRaw = H.tipo ? row[H.tipo] : undefined;
        const catRaw = H.categoria ? row[H.categoria] : undefined;
        const amount_usd = parseAmountUSD(amtRaw);
        const fecha = parseDateFlexible(fechaRaw);
        if (!fecha || !descRaw || amount_usd === null) continue;
        const tipo = (tipoRaw ? String(tipoRaw).toLowerCase() : (amount_usd < 0 ? 'pago' : 'gasto'));
        rows.push({
          fecha: fecha.toISOString().slice(0,10),
          descripcion: String(descRaw).trim().slice(0,255),
          amount_usd,
          tipo,
          category_id: catRaw ? Number(catRaw) : null
        });
      }
    } else if (fileExt === '.xls' || fileExt === '.xlsx') {
      const wb = xlsx.readFile(req.file.path);
      let rowsFound = [];
      for (const sheetName of wb.SheetNames) {
        try {
          const ws = wb.Sheets[sheetName];
          const rawData = xlsx.utils.sheet_to_json(ws, { header: 'A', raw: true, defval: null });
          console.log(`[intl] Sheet '${sheetName}' rows:`, rawData.length);
          // Search section
          let startIndex = 0;
          for (let i = 0; i < Math.min(rawData.length, 200); i++) {
            const row = rawData[i];
            const rowText = stripDiacritics(Object.values(row || {})
              .filter(v => v !== null && v !== undefined)
              .map(v => String(v).toLowerCase())
              .join(' '));
            if (rowText.includes('movimientos internacionales')) {
              startIndex = i + 1;
              break;
            }
          }
          // Header detection
          let headerRow = null;
          let headerIdx = startIndex;
          for (let i = startIndex; i < Math.min(startIndex + 40, rawData.length); i++) {
            const row = rawData[i];
            const values = Object.values(row || {}).filter(v => v !== null && v !== undefined).map(v => normalizeKey(v));
            const hasFecha = values.some(v => v.includes('fecha'));
            const hasMontoUsd = values.some(v => v.includes('monto') && v.includes('usd')) || values.some(v => v.trim() === 'usd');
            if (hasFecha && hasMontoUsd) { headerRow = row; headerIdx = i; break; }
          }
          if (!headerRow) {
            for (let i = 0; i < Math.min(80, rawData.length); i++) {
              const row = rawData[i];
              const values = Object.values(row || {}).filter(v => v !== null && v !== undefined).map(v => normalizeKey(v));
              const hasFecha = values.some(v => v.includes('fecha'));
              const hasMontoUsd = values.some(v => v.includes('monto') && v.includes('usd')) || values.some(v => v.trim() === 'usd');
              if (hasFecha && hasMontoUsd) { headerRow = row; headerIdx = i; break; }
            }
          }
          if (!headerRow) continue;
          const colMap = {};
          for (const [col, label] of Object.entries(headerRow)) {
            const nk = normalizeKey(label);
            if (!colMap.fecha && possibleHeaders.fecha.map(normalizeKey).some(k => nk.includes(k))) colMap.fecha = col;
            if (!colMap.descripcion && possibleHeaders.descripcion.map(normalizeKey).some(k => nk.includes(k))) colMap.descripcion = col;
            if (!colMap.monto && possibleHeaders.amount_usd.map(normalizeKey).some(k => nk.includes(k))) colMap.monto = col;
          }
          if (!colMap.descripcion) {
            const cols = Object.keys(headerRow);
            const fechaIdx = cols.indexOf(colMap.fecha);
            if (fechaIdx >= 0 && cols[fechaIdx + 2]) colMap.descripcion = cols[fechaIdx + 2];
          }
          console.log('[intl] colMap:', colMap);
          for (let i = headerIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row) continue;
            const fechaVal = colMap.fecha ? row[colMap.fecha] : null;
            const descVal = colMap.descripcion ? row[colMap.descripcion] : '';
            const montoVal = colMap.monto ? row[colMap.monto] : null;
            const fecha = parseDateFlexible(fechaVal);
            const amount_usd = parseAmountUSD(montoVal);
            if (!fecha || amount_usd === null) continue;
            const descripcion = String(descVal || '').trim();
            if (!descripcion) continue;
            const tipo = amount_usd < 0 ? 'pago' : 'gasto';
            rowsFound.push({
              fecha: fecha.toISOString().slice(0,10),
              descripcion: descripcion.slice(0,255),
              amount_usd,
              tipo,
              category_id: null
            });
          }
          if (rowsFound.length) break; // stop at first sheet with data
        } catch (sheetErr) {
          console.warn('[intl] Error leyendo hoja', sheetName, sheetErr.message);
          continue;
        }
      }
      rows = rowsFound;
      // Limpiar archivo físico
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    } else {
      return res.status(400).json({ error: 'Tipo de archivo no soportado. Use CSV o Excel.' });
    }

    if (!rows.length) return res.status(400).json({ error: 'Archivo sin filas válidas' });
    const periodYear = parseInt(req.body.periodYear, 10);
    const periodMonth = parseInt(req.body.periodMonth, 10);
    const result = await model.bulkImport(req.user.id, { brand: b, exchange_rate: rate, rows, periodYear, periodMonth });
    return res.status(201).json(result);
  } catch (e) {
    console.error('intl importFile error', e);
    res.status(400).json({ error: e.message || 'Error al importar archivo' });
  }
}

module.exports = { listByMonth, summaryByMonth, bulkImport, create, update, remove, importFile };
