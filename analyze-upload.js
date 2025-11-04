const { pool } = require('./backend/config/database');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const USER_ID = '39e79b4f-1666-4ba2-8732-4de65b70a0b0';

async function analyzeLastUpload() {
  try {
    console.log('🔍 ANALIZANDO ÚLTIMA IMPORTACIÓN\n');
    
    // 1. Buscar el último archivo subido
    const uploadsDir = path.join(__dirname, 'uploads_history');
    if (!fs.existsSync(uploadsDir)) {
      console.log('❌ No hay archivos en uploads_history/');
      console.log('   Sube un archivo primero desde el frontend\n');
      process.exit(1);
    }
    
    const files = fs.readdirSync(uploadsDir)
      .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      console.log('❌ No hay archivos Excel/CSV en uploads_history/\n');
      process.exit(1);
    }
    
    const latestFile = files[0];
    const filePath = path.join(uploadsDir, latestFile);
    
    console.log(`📄 Último archivo: ${latestFile}\n`);
    
    // 2. Leer archivo Excel
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    
    // 3. Parsear transacciones del Excel
    const excelTransactions = [];
    let totalExcel = 0;
    
    // Buscar fila de encabezados
    let headerRow = -1;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i];
      const rowStr = JSON.stringify(row).toLowerCase();
      if (rowStr.includes('fecha') && (rowStr.includes('monto') || rowStr.includes('cargo'))) {
        headerRow = i;
        break;
      }
    }
    
    if (headerRow === -1) {
      console.log('❌ No se encontró fila de encabezados en el Excel\n');
      process.exit(1);
    }
    
    console.log(`📋 Procesando desde fila ${headerRow + 2}...\n`);
    
    // Mapeo de columnas
    const headers = rawData[headerRow].map(h => String(h).toLowerCase().trim());
    const fechaCol = headers.findIndex(h => h.includes('fecha'));
    const descripcionCol = headers.findIndex(h => h.includes('descripción') || h.includes('descripcion') || h.includes('comercio') || h.includes('glosa'));
    const montoCol = headers.findIndex(h => h.includes('monto') || h.includes('cargo') || h.includes('importe'));
    
    // Procesar filas
    for (let i = headerRow + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[fechaCol] || !row[montoCol]) continue;
      
      // Parsear fecha
      let fecha;
      const fechaStr = String(row[fechaCol]).trim();
      if (fechaStr.includes('/')) {
        const [day, month, year] = fechaStr.split('/');
        fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        fecha = fechaStr;
      }
      
      // Parsear monto
      let monto = String(row[montoCol]).replace(/[^\d.-]/g, '');
      monto = parseFloat(monto);
      
      if (isNaN(monto) || monto <= 0) continue; // Solo gastos
      
      const descripcion = String(row[descripcionCol] || '').trim();
      
      excelTransactions.push({ fecha, descripcion, monto });
      totalExcel += monto;
    }
    
    console.log(`📊 EXCEL - Transacciones: ${excelTransactions.length} | Total: $${totalExcel.toLocaleString('es-CL')}\n`);
    
    // 4. Leer transacciones de la BD
    const query = `
      SELECT fecha, descripcion, monto, tipo
      FROM transactions
      WHERE user_id = $1 AND tipo = 'gasto'
      ORDER BY fecha DESC, monto DESC
    `;
    
    const result = await pool.query(query, [USER_ID]);
    const dbTransactions = result.rows.map(tx => ({
      fecha: tx.fecha.toISOString().split('T')[0],
      descripcion: tx.descripcion.trim(),
      monto: Number(tx.monto)
    }));
    
    const totalDB = dbTransactions.reduce((sum, tx) => sum + tx.monto, 0);
    
    console.log(`💾 BD    - Transacciones: ${dbTransactions.length} | Total: $${totalDB.toLocaleString('es-CL')}\n`);
    
    // 5. Comparar
    console.log('=' . repeat(80));
    console.log('🔎 COMPARACIÓN\n');
    
    const diff = totalDB - totalExcel;
    console.log(`📊 Diferencia: ${dbTransactions.length - excelTransactions.length} transacciones | $${diff.toLocaleString('es-CL')}\n`);
    
    // Crear mapas para comparación
    const excelMap = new Map();
    excelTransactions.forEach(tx => {
      const key = `${tx.fecha}|${tx.monto}`;
      if (!excelMap.has(key)) excelMap.set(key, []);
      excelMap.get(key).push(tx.descripcion);
    });
    
    const dbMap = new Map();
    dbTransactions.forEach(tx => {
      const key = `${tx.fecha}|${tx.monto}`;
      if (!dbMap.has(key)) dbMap.set(key, []);
      dbMap.get(key).push(tx.descripcion);
    });
    
    // Encontrar en BD pero NO en Excel
    console.log('⚠️  TRANSACCIONES EN BD QUE NO ESTÁN EN EXCEL:\n');
    let foundExtra = false;
    for (const [key, dbDescs] of dbMap.entries()) {
      const [fecha, montoStr] = key.split('|');
      const monto = parseFloat(montoStr);
      const excelDescs = excelMap.get(key) || [];
      
      if (dbDescs.length > excelDescs.length) {
        const extra = dbDescs.length - excelDescs.length;
        console.log(`   ${fecha} | $${monto.toLocaleString('es-CL').padStart(10)} | ${extra} extra${extra > 1 ? 's' : ''}`);
        dbDescs.forEach((desc, i) => {
          const isExtra = i >= excelDescs.length ? '❌' : '✓';
          console.log(`      ${isExtra} ${desc.substring(0, 60)}`);
        });
        console.log('');
        foundExtra = true;
      }
    }
    
    if (!foundExtra) {
      console.log('   ✅ No hay transacciones extras en BD\n');
    }
    
    // Encontrar en Excel pero NO en BD
    console.log('⚠️  TRANSACCIONES EN EXCEL QUE NO ESTÁN EN BD:\n');
    let foundMissing = false;
    for (const [key, excelDescs] of excelMap.entries()) {
      const [fecha, montoStr] = key.split('|');
      const monto = parseFloat(montoStr);
      const dbDescs = dbMap.get(key) || [];
      
      if (excelDescs.length > dbDescs.length) {
        const missing = excelDescs.length - dbDescs.length;
        console.log(`   ${fecha} | $${monto.toLocaleString('es-CL').padStart(10)} | ${missing} faltante${missing > 1 ? 's' : ''}`);
        excelDescs.forEach((desc, i) => {
          const isMissing = i >= dbDescs.length ? '❌' : '✓';
          console.log(`      ${isMissing} ${desc.substring(0, 60)}`);
        });
        console.log('');
        foundMissing = true;
      }
    }
    
    if (!foundMissing) {
      console.log('   ✅ No hay transacciones faltantes en BD\n');
    }
    
    console.log('=' . repeat(80));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeLastUpload();
