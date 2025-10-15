const Transaction = require('../models/Transaction');
const db = require('../config/database');
const csv = require('csv-parse');
const { Readable } = require('stream');
const iconv = require('iconv-lite');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { fileTemplates, findTemplate } = require('../config/fileTemplates');

const transactionModel = new Transaction(db);

const parseCSV = async (fileContent) => {
  return new Promise((resolve, reject) => {
    console.log('\n=== INICIO DE PROCESAMIENTO DE ARCHIVO ===');
    console.log('Longitud del contenido:', fileContent.length, 'caracteres');

    const records = [];
    let lineCount = 0;
    let isInMovimientosNacionales = false;
    let columnIndexes = null;
    let totalMonto = 0;

    if (!fileContent || fileContent.trim() === '') {
      console.error('Error: El contenido del archivo está vacío');
      reject(new Error('El contenido del archivo está vacío'));
      return;
    }

    const lines = fileContent.split('\n');
    console.log('Total de líneas en el archivo:', lines.length);
    
    for (const line of lines) {
      lineCount++;
      const record = line.trim();

      if (!record) continue;

      // Detectar la sección de Movimientos Nacionales
      if (record.includes('Movimientos Nacionales')) {
        console.log(`\nLínea ${lineCount}: Encontrada sección de Movimientos Nacionales`);
        isInMovimientosNacionales = true;
        continue;
      }

      if (!isInMovimientosNacionales) continue;

      // Buscar el encabezado
      if (!columnIndexes) {
        const headerText = record.toLowerCase();
        
        if (headerText.includes('fecha') && headerText.includes('descripción') && headerText.includes('monto')) {
          columnIndexes = {
            fecha: headerText.indexOf('fecha'),
            descripcion: headerText.indexOf('descripción'),
            monto: headerText.indexOf('monto'),
            cuotas: headerText.indexOf('cuotas')
          };
          console.log('Encabezados encontrados:', columnIndexes);
          continue;
        }
      }

      if (columnIndexes && record.length > 10) {
        try {
          const fecha = record.substring(columnIndexes.fecha, columnIndexes.fecha + 10).trim();
          const descripcion = record.substring(columnIndexes.descripcion, columnIndexes.monto).trim();
          let monto = record.substring(columnIndexes.monto).split(' ')[0].trim();
          const cuotas = columnIndexes.cuotas !== -1 ? record.substring(columnIndexes.cuotas).trim() : '';

          if (fecha && descripcion && monto) {
            const montoOriginal = monto;
            monto = monto.replace(/\./g, '').replace(',', '.');
            monto = parseFloat(monto);

            let tipo = 'gasto';
            if (monto < 0) {
              tipo = 'pago';
            } else if (descripcion.toLowerCase().includes('abono')) {
              tipo = 'ingreso';
            }

            console.log(`\nLínea ${lineCount}:`);
            console.log('  Fecha:', fecha);
            console.log('  Descripción:', descripcion);
            console.log('  Monto Original:', montoOriginal);
            console.log('  Monto Procesado:', monto);
            console.log('  Tipo:', tipo);

            totalMonto += (tipo === 'gasto' ? monto : 0);

            if (fecha.match(/^\d{2}\/\d{2}\/\d{4}$/) && !isNaN(monto)) {
              records.push({ fecha, descripcion, monto, tipo });
            } else {
              console.log('  ⚠️ DESCARTADA: Formato inválido');
            }
          }
        } catch (error) {
          console.log(`\nError procesando línea ${lineCount}:`, error.message);
        }
      }
    }

    console.log('\n=== RESUMEN DE PROCESAMIENTO ===');
    console.log('Total de registros válidos:', records.length);
    console.log('Total monto de gastos:', totalMonto);
    console.log('=== FIN DE PROCESAMIENTO ===\n');

    resolve(records);
  });
};

const parseExcelDate = (serial) => {
  if (!serial) return null;
  
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;  
  const date_info = new Date(utc_value * 1000);
  
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
};

async function processExcelFile(filePath, userId, originalFilename) {
  try {
    const workbook = xlsx.readFile(filePath);
    console.log('Nombres de hojas disponibles:', workbook.SheetNames);

    // Usar el nombre original del archivo en lugar del nombre temporal
    console.log('Buscando template para:', originalFilename);
    const template = findTemplate(originalFilename);
    if (!template) {
      throw new Error(`No se encontró template para el archivo: ${originalFilename}`);
    }

    // Usar el nombre de la hoja especificado en el template o la primera hoja
    const sheetName = template.sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`No se encontró la hoja: ${sheetName}`);
    }

    // Convertir la hoja a JSON
    const rawData = xlsx.utils.sheet_to_json(worksheet, { 
      header: 'A',
      raw: true,
      defval: null
    });

    console.log('\nAnalizando estructura del archivo:');
    // Mostrar las primeras 10 filas para diagnóstico
    rawData.slice(0, 10).forEach((row, index) => {
      console.log(`Fila ${index}:`, row);
    });
    
    // Encontrar el índice donde comienzan los datos
    let startIndex = 0;
    let headerFound = false;

    if (template.section) {
      console.log('\nBuscando sección:', template.section);
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row) continue;

        // Convertir todos los valores de la fila a string y unirlos
        const rowText = Object.values(row)
          .filter(val => val !== null && val !== undefined)
          .map(val => String(val).toLowerCase())
          .join(' ');

        console.log(`Fila ${i} texto:`, rowText);

        if (rowText.includes(template.section.toLowerCase())) {
          console.log('Sección encontrada en fila:', i);
          startIndex = i + (template.startOffset || 1);
          headerFound = true;
          break;
        }
      }
    }

    if (!headerFound) {
      console.log('\nBuscando encabezados directamente...');
      // Si no encontramos la sección, buscar directamente los encabezados
      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (!row) continue;

        const rowValues = Object.values(row)
          .filter(val => val !== null && val !== undefined)
          .map(val => String(val).toLowerCase());

        console.log(`Fila ${i} valores:`, rowValues);

        // Verificar si esta fila contiene los encabezados esperados
        const matchCount = Object.values(template.columns)
          .filter(colName => 
            rowValues.some(val => val.includes(colName.toLowerCase()))
          ).length;

        if (matchCount >= Object.keys(template.columns).length / 2) {
          console.log('Encabezados encontrados en fila:', i);
          startIndex = i;
          headerFound = true;
          break;
        }
      }
    }

    if (!headerFound) {
      throw new Error('No se encontró la sección ni los encabezados en el archivo');
    }

    // Obtener el mapeo de columnas
    const headerRow = rawData[startIndex];
    if (!headerRow) {
      console.log('Contenido en startIndex:', startIndex, headerRow);
      throw new Error('No se encontró la fila de encabezados');
    }

    console.log('\nFila de encabezados encontrada:', headerRow);

    // Mapear las columnas
    const columnMap = {};
    for (const [key, value] of Object.entries(template.columns)) {
      // Para el monto, usar la configuración específica del template
      if (key === 'monto') {
        if (template.montoColumn === 'K') {
          columnMap[key] = 'K';
          continue;
        }
      }

      const columnIndex = Object.entries(headerRow).find(([_, cellValue]) => 
        cellValue && String(cellValue).toLowerCase().includes(value.toLowerCase())
      );
      
      if (columnIndex) {
        columnMap[key] = columnIndex[0];
      }
    }

    console.log('\nMapeo de columnas encontrado:', columnMap);
    console.log('Usando template:', template.matchedTemplate || 'template genérico');

    if (Object.keys(columnMap).length !== Object.keys(template.columns).length) {
      console.error('Columnas encontradas:', columnMap);
      console.error('Columnas requeridas:', template.columns);
      throw new Error('No se encontraron todas las columnas necesarias');
    }

    const transactions = [];
    const existingTransactionsInDB = new Set();
    const existingTransactionsInFile = new Set();
    let totalAmount = 0;
    let transactionLog = [];
    let skippedDuplicates = 0;

    // Obtener transacciones existentes para el usuario usando nuestro modelo personalizado
    try {
      const existing = await transactionModel.getAllTransactions(userId);
      
      // Crear un Set de transacciones existentes para búsqueda rápida
      const dbTransactionCounters = new Map();
      existing.forEach(t => {
        // Asegurarse de que la fecha sea un objeto Date
        const fecha = t.fecha instanceof Date ? 
          t.fecha : 
          new Date(t.fecha);

        const monto = t.monto;
        const tipo = monto < 0 ? 'pago' : 'gasto';
        const montoStr = Math.abs(monto).toString().padStart(20, '0');
        const dbFechaStr = fecha.toISOString().split('T')[0];
        const baseKey = `${dbFechaStr}-${t.descripcion}-${tipo}-${montoStr}`;
        
        // Incrementar el contador para esta transacción base en la DB
        const count = (dbTransactionCounters.get(baseKey) || 0) + 1;
        dbTransactionCounters.set(baseKey, count);
        
        // Añadir el contador a la clave final
        const key = `${baseKey}-${count}`;
        existingTransactionsInDB.add(key);
      });
      
      console.log('Transacciones existentes en DB:', existingTransactionsInDB.size);
    } catch (error) {
      console.error('Error al obtener transacciones existentes:', error);
      // Continuar con un Set vacío si hay error
    }

    // Primera pasada: recolectar todas las transacciones únicas del archivo
    const fileTransactions = [];
    let totalRowsProcessed = 0;
    let invalidRows = 0;
    const transactionCounters = new Map(); // Contador para transacciones similares

    console.log('\n=== INICIO DE PROCESAMIENTO DE FILAS ===');
    console.log('Número total de filas en el archivo:', rawData.length);
    console.log('Índice de inicio:', startIndex + 1);

    for (let i = startIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      totalRowsProcessed++;

      if (!row) {
        console.log(`Fila ${i}: Vacía`);
        invalidRows++;
        continue;
      }

      // Log de la fila actual para diagnóstico
      console.log(`\nProcesando fila ${i}:`);
      console.log('Fecha:', row[columnMap.fecha]);
      console.log('Descripción:', row[columnMap.descripcion]);
      console.log('Monto:', row[columnMap.monto]);

      if (!row[columnMap.fecha] || !row[columnMap.descripcion] || !row[columnMap.monto]) {
        console.log('Fila descartada: Faltan campos requeridos');
        invalidRows++;
        continue;
      }

      try {
        let fecha;
        const rawFechaStr = row[columnMap.fecha];
        
        if (rawFechaStr instanceof Date) {
          fecha = rawFechaStr;
        } else if (typeof rawFechaStr === 'number') {
          fecha = parseExcelDate(rawFechaStr);
        } else if (typeof rawFechaStr === 'string') {
          const [day, month, year] = rawFechaStr.split('/').map(num => parseInt(num, 10));
          fecha = new Date(year, month - 1, day);
        } else {
          console.warn('Formato de fecha no reconocido:', rawFechaStr);
          continue;
        }

        let monto = row[columnMap.monto];
        if (typeof monto === 'string') {
          monto = monto.replace(/[^\d.-]/g, '');
        }
        monto = parseFloat(monto);

        if (isNaN(monto)) {
          console.warn('Monto inválido:', monto, 'en fila:', i + 1);
          continue;
        }

        const descripcion = String(row[columnMap.descripcion]).trim();
        const currentFechaStr = fecha.toISOString().split('T')[0];
        const tipo = monto < 0 ? 'pago' : 'gasto';
        const montoStr = Math.abs(monto).toString().padStart(20, '0');
        const baseKey = `${currentFechaStr}-${descripcion}-${tipo}-${montoStr}`;
        
        // Incrementar el contador para esta transacción base
        const count = (transactionCounters.get(baseKey) || 0) + 1;
        transactionCounters.set(baseKey, count);
        
        // Añadir el contador a la clave final
        const transactionKey = `${baseKey}-${count}`;

        // Solo verificar duplicados dentro del archivo
        if (existingTransactionsInFile.has(transactionKey)) {
          console.log('\n=== DUPLICADO ENCONTRADO ===');
          console.log('Fila:', i);
          console.log('Fecha:', currentFechaStr);
          console.log('Descripción:', descripcion);
          console.log('Monto:', monto);
          console.log('Clave de transacción:', transactionKey);
          console.log('===========================\n');
          skippedDuplicates++;
          continue;
        }

        existingTransactionsInFile.add(transactionKey);

        // Determinar el tipo de transacción
        let tipoTransaccion = template.defaultType;
        if (template.typePatterns) {
          const descripcionLower = descripcion.toLowerCase();
          for (const [tipoPattern, patterns] of Object.entries(template.typePatterns)) {
            if (patterns.some(pattern => descripcionLower.includes(pattern))) {
              tipoTransaccion = tipoPattern;
              break;
            }
          }
        }

        const transaction = {
          fecha: fecha,
          descripcion: descripcion,
          monto: monto,
          cuotas: row[columnMap.cuotas] ? String(row[columnMap.cuotas]).split('/')[0] : '01',
          tipo: monto < 0 ? 'pago' : tipoTransaccion,
          user_id: userId
        };

        totalAmount += Math.abs(monto);
        transactionLog.push({ descripcion, monto, tipo: tipoTransaccion });
        fileTransactions.push(transaction);
      } catch (error) {
        console.error('Error procesando fila:', error);
        console.error('Datos de la fila:', row);
        continue;
      }
    }

    console.log('\n=== ESTADÍSTICAS DE PROCESAMIENTO ===');
    console.log('Total de filas procesadas:', totalRowsProcessed);
    console.log('Filas inválidas o vacías:', invalidRows);
    console.log('Transacciones válidas encontradas:', fileTransactions.length);
    console.log('Duplicados en el archivo:', skippedDuplicates);

    // Segunda pasada: filtrar las transacciones que ya existen en la base de datos
    let dbDuplicates = 0;
    const newTransactionCounters = new Map();
    
    transactions.push(...fileTransactions.filter(t => {
      const monto = t.monto;
      const tipo = monto < 0 ? 'pago' : 'gasto';
      const montoStr = Math.abs(monto).toString().padStart(20, '0');
      const baseKey = `${t.fecha.toISOString().split('T')[0]}-${t.descripcion}-${tipo}-${montoStr}`;
      
      // Incrementar el contador para esta nueva transacción
      const count = (newTransactionCounters.get(baseKey) || 0) + 1;
      newTransactionCounters.set(baseKey, count);
      
      // Añadir el contador a la clave final
      const transactionKey = `${baseKey}-${count}`;
      const exists = existingTransactionsInDB.has(transactionKey);
      if (exists) {
        console.log('\n=== DUPLICADO ENCONTRADO ===');
        console.log('Fecha:', t.fecha.toISOString().split('T')[0]);
        console.log('Descripción:', t.descripcion);
        console.log('Monto:', t.monto);
        console.log('Clave de transacción:', transactionKey);
        console.log('===========================\n');
        dbDuplicates++;
      }
      return !exists;
    }));

    console.log('\n=== RESUMEN DE TRANSACCIONES ===');
    console.log('Número total de filas en el archivo:', rawData.length);
    console.log('Filas procesadas:', totalRowsProcessed);
    console.log('Filas inválidas o vacías:', invalidRows);
    console.log('Transacciones válidas encontradas:', fileTransactions.length);
    console.log('Duplicados encontrados en el archivo:', skippedDuplicates);
    console.log('Duplicados encontrados en base de datos:', dbDuplicates);
    console.log('Transacciones únicas a insertar:', transactions.length);
    console.log('Monto total:', totalAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }));
    console.log('\nDetalle de transacciones:');
    transactionLog.forEach((t, i) => {
      console.log(`${i + 1}. ${t.descripcion}: ${t.monto.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })} (${t.tipo})`);
    });
    console.log('\n==============================\n');

    return {
      transactions,
      stats: {
        totalRowsInFile: rawData.length,
        rowsProcessed: totalRowsProcessed,
        invalidRows,
        validInFile: fileTransactions.length,
        duplicatesInFile: skippedDuplicates,
        duplicatesInDB: dbDuplicates,
        toInsert: transactions.length,
        totalAmount
      }
    };
  } catch (error) {
    console.error('Error procesando archivo Excel:', error);
    throw error;
  }
}

const importTransactions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    console.log('Archivo recibido:', req.file);

    // Validar metadata de importación
    const providerRaw = (req.body?.provider || '').toLowerCase().trim();
    const networkRaw = (req.body?.network || '').toLowerCase().trim();

    const allowedProviders = new Set(['banco_chile', 'banco_cencosud']);
    if (!allowedProviders.has(providerRaw)) {
      return res.status(400).json({ error: 'Debes seleccionar un banco válido: Banco de Chile o Banco Cencosud' });
    }

    let network = null;
    if (providerRaw === 'banco_chile') {
      const allowedNetworks = new Set(['visa', 'mastercard']);
      if (!allowedNetworks.has(networkRaw)) {
        return res.status(400).json({ error: 'Para Banco de Chile debes seleccionar Visa o Mastercard' });
      }
      network = networkRaw;
    }

    const provider = providerRaw;

    // Periodo de estado de cuenta (opcional en v1, recomendado)
    let periodYear = null;
    let periodMonth = null;
    if (req.body?.periodYear) {
      const py = parseInt(req.body.periodYear, 10);
      if (!Number.isInteger(py) || py < 2000 || py > 2100) {
        return res.status(400).json({ error: 'periodYear inválido' });
      }
      periodYear = py;
    }
    if (req.body?.periodMonth) {
      const pm = parseInt(req.body.periodMonth, 10);
      if (!Number.isInteger(pm) || pm < 1 || pm > 12) {
        return res.status(400).json({ error: 'periodMonth inválido' });
      }
      periodMonth = pm;
    }

    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Validar el tipo de archivo
    if (!['.csv', '.xls', '.xlsx'].includes(fileExtension)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Tipo de archivo no soportado. Por favor, sube un archivo CSV o Excel.' 
      });
    }

    let transactions;
    let excelStats = null;

    if (fileExtension === '.csv') {
      // Para archivos CSV, usar el buffer en memoria
      if (!req.file.buffer) {
        return res.status(400).json({ error: 'Error al leer el archivo CSV' });
      }
      const fileContent = req.file.buffer.toString('utf8');
      transactions = await parseCSV(fileContent);
    } else {
      // Para archivos Excel, usar el archivo guardado en disco
      if (!req.file.path) {
        return res.status(400).json({ error: 'Error al leer el archivo Excel' });
      }
      const result = await processExcelFile(req.file.path, req.user.id, req.file.originalname);
      // Limpiar el archivo después de procesarlo
      fs.unlinkSync(req.file.path);
      if (result && Array.isArray(result.transactions)) {
        transactions = result.transactions;
        excelStats = result.stats || null;
      } else {
        transactions = result;
      }
    }

    if (!Array.isArray(transactions)) {
      console.error('Error: transactions no es un array:', typeof transactions, transactions);
      
      if (transactions && typeof transactions === 'object') {
        const possibleArray = Object.values(transactions).find(value => Array.isArray(value));
        if (possibleArray) {
          transactions = possibleArray;
        } else {
          return res.status(400).json({ error: 'Error en el formato de las transacciones' });
        }
      } else {
        return res.status(400).json({ error: 'Error en el formato de las transacciones' });
      }
    }

    if (transactions.length === 0) {
      // Caso típico: re-subida del mismo archivo, todo duplicado en DB
      return res.status(200).json({
        success: true,
        message: 'No se insertaron nuevas transacciones: todas ya existen en la base de datos',
        stats: {
          detected: excelStats?.validInFile ?? 0,
          inserted: 0,
          skippedDuplicatesInDB: excelStats?.duplicatesInDB ?? 0,
          skippedDuplicatesInFile: excelStats?.duplicatesInFile ?? 0
        }
      });
    }

    console.log(`Se encontraron ${transactions.length} transacciones para procesar`);
    console.log('Primeras 3 transacciones:', transactions.slice(0, 3));

    const processedTransactions = transactions.map(record => {
      try {
        const fecha = record.fecha instanceof Date ? 
          record.fecha : 
          new Date(record.fecha);

        const monto = typeof record.monto === 'number' ? 
          record.monto : 
          parseFloat(record.monto);

        if (isNaN(monto)) {
          throw new Error(`Monto inválido: ${record.monto}`);
        }

        if (!(fecha instanceof Date) || isNaN(fecha)) {
          throw new Error(`Fecha inválida: ${record.fecha}`);
        }

        return {
          fecha: fecha,
          monto: monto,
          cuotas: record.cuotas || '01',
          descripcion: record.descripcion,
          tipo: record.tipo || 'gasto'
        };
      } catch (error) {
        console.error('Error procesando registro:', error);
        console.error('Registro problemático:', record);
        throw error;
      }
    });

    console.log(`Se encontraron ${processedTransactions.length} transacciones para procesar`);
    console.log('Primeras 3 transacciones:', processedTransactions.slice(0, 3));

    // =============================
    // Dedupe por (brand, fecha_local, monto signed) con control de multiplicidad
    // =============================

    // Helper para formatear fecha local America/Santiago a YYYY-MM-DD
    const formatLocalDate = (date) => {
      const parts = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      const dd = parts.find(p => p.type === 'day')?.value;
      const mm = parts.find(p => p.type === 'month')?.value;
      const yyyy = parts.find(p => p.type === 'year')?.value;
      return `${yyyy}-${mm}-${dd}`;
    };

    // brand/network viene validado más arriba cuando provider === 'banco_chile'
    const brand = network; // 'visa' | 'mastercard' (para otras fuentes podría ser null)

    // Armar buckets por signature dentro del archivo
    const fileBuckets = new Map(); // signature -> array de tx
    const fileCounts = new Map();  // signature -> N en archivo
    for (const tx of processedTransactions) {
      const fechaLocal = formatLocalDate(tx.fecha);
      const montoSigned = Number(tx.monto);
      const signature = `${brand || 'unknown'}|${fechaLocal}|${montoSigned}`;
      if (!fileBuckets.has(signature)) fileBuckets.set(signature, []);
      fileBuckets.get(signature).push({ ...tx, _signature: signature });
      fileCounts.set(signature, (fileCounts.get(signature) || 0) + 1);
    }

    // Leer multiplicidad actual en DB por signature (brand, fecha, monto) para el usuario
    const dbCounts = new Map();
    try {
      if (brand) {
        const dbCountQuery = `
          SELECT i.network as brand, t.fecha::date as fecha_local, t.monto as monto_signed, COUNT(*) as cnt
          FROM transactions t
          LEFT JOIN imports i ON t.import_id = i.id
          WHERE t.user_id = $1
            AND i.product_type = 'credit_card'
            AND i.network = $2
          GROUP BY i.network, t.fecha::date, t.monto
        `;
        const dbCountRes = await db.query(dbCountQuery, [req.user.id, brand]);
        for (const row of dbCountRes.rows) {
          const signature = `${row.brand}|${row.fecha_local.toISOString().slice(0,10)}|${Number(row.monto_signed)}`;
          dbCounts.set(signature, Number(row.cnt));
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener conteos de DB para dedupe por signature. Continuando sin dedupe específico.', e.message);
    }

    // Seleccionar exactamente (FILE_count - DB_count) por signature
    const toInsertBySignature = [];
    let rejectedByMultiplicity = 0;
    for (const [signature, items] of fileBuckets.entries()) {
      const fileN = fileCounts.get(signature) || 0;
      const dbN = dbCounts.get(signature) || 0;
      const need = Math.max(fileN - dbN, 0);
      if (need > 0) {
        toInsertBySignature.push(...items.slice(0, need));
      } else {
        rejectedByMultiplicity += items.length;
      }
    }

    console.log('[dedupe] firmas en archivo:', fileCounts.size);
    console.log('[dedupe] a insertar tras multiplicidad:', toInsertBySignature.length);
    if (rejectedByMultiplicity > 0) {
      console.log('[dedupe] rechazadas por multiplicidad (ya existen en DB):', rejectedByMultiplicity);
    }

    // Reemplazar el conjunto a insertar por el dedupe calculado
    const transactionsForInsert = toInsertBySignature;

    // Crear registro de importación
    let importId = null;
    try {
      const importInsert = await db.query(
        `INSERT INTO imports (user_id, provider, network, product_type, original_filename, period_year, period_month)
         VALUES ($1, $2, $3, 'credit_card', $4, $5, $6)
         RETURNING id`,
        [req.user.id, provider, network, req.file.originalname, periodYear, periodMonth]
      );
      importId = importInsert.rows[0]?.id || null;
    } catch (e) {
      console.error('Error creando registro de importación:', e);
      // No abortamos, pero seguimos sin importId
    }

    const transactionModel = new Transaction(db);
    const importResult = await transactionModel.importFromCSV(req.user.id, transactionsForInsert, importId);

    // Actualizar métricas de importación si se creó el registro
    if (importId) {
      try {
        await db.query(
          `UPDATE imports
           SET detected_rows = $1,
               inserted_count = $2,
               skipped_count = $3
           WHERE id = $4`,
          [processedTransactions.length, importResult.stats.inserted, importResult.stats.skipped, importId]
        );
      } catch (e) {
        console.error('Error actualizando métricas de importación:', e);
      }
    }

    res.status(201).json({
      success: true,
      message: importResult.message,
      stats: {
        ...importResult.stats,
        dedupe: {
          signaturesInFile: fileCounts.size,
          insertedAfterMultiplicity: transactionsForInsert.length,
          rejectedByMultiplicity
        }
      },
      transactions: importResult.insertedTransactions,
      import: {
        id: importId,
        provider,
        network,
        periodYear,
        periodMonth
      }
    });

  } catch (error) {
    console.error('Error en importTransactions:', error);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error al eliminar archivo:', unlinkError);
      }
    }
    res.status(400).json({ error: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Se requieren fechas de inicio y fin' });
    }

    const transactions = await transactionModel.getTransactionsSummary(
      req.user.id,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      transactions
    });
  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
  }
};

const getCategoryAnalysis = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Se requiere año y mes para el análisis' });
    }

    const categoryBreakdown = await transactionModel.getCategoryBreakdown(
      req.user.id,
      parseInt(year),
      parseInt(month)
    );

    res.json({
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error en análisis por categoría:', error);
    res.status(500).json({ error: 'Error al obtener análisis por categoría' });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderBy, orderDirection, startDate, endDate, periodYear, periodMonth } = req.query;
    
    const transactions = await transactionModel.getAllTransactions(
      userId,
      orderBy,
      orderDirection,
      startDate || null,
      endDate || null,
      periodYear ? parseInt(periodYear, 10) : null,
      periodMonth ? parseInt(periodMonth, 10) : null
    );
    res.json(transactions);
  } catch (error) {
    console.error('Error en getAllTransactions:', error);
    res.status(500).json({ error: error.message });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Se requiere el ID de la transacción' });
    }

    const deletedTransaction = await transactionModel.deleteTransaction(
      req.user.id,
      id
    );

    res.json({
      message: 'Transacción eliminada exitosamente',
      transaction: deletedTransaction
    });

  } catch (error) {
    console.error('Error al eliminar transacción:', error);
    res.status(error.message.includes('no encontrada') ? 404 : 500).json({ error: 'Error al eliminar la transacción' });
  }
};

const deleteMultipleTransactions = async (req, res) => {
  try {
    const { transactionIds } = req.body;
    
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs de transacciones' });
    }

    const deletedTransactions = await transactionModel.deleteMultipleTransactions(
      req.user.id,
      transactionIds
    );

    res.json({
      message: 'Transacciones eliminadas exitosamente',
      count: deletedTransactions.length,
      transactions: deletedTransactions
    });

  } catch (error) {
    console.error('Error al eliminar transacciones:', error);
    res.status(error.message.includes('no encontradas') ? 404 : 500).json({ error: 'Error al eliminar las transacciones' });
  }
};

const createTransaction = async (req, res) => {
  try {
    const { fecha, descripcion, monto, category_id, tipo } = req.body;
    const userId = req.user.id;

    const query = `
      INSERT INTO transactions (user_id, fecha, descripcion, monto, category_id, tipo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, 
        (SELECT name FROM categories WHERE id = category_id) as category_name
    `;

    const result = await db.query(query, [userId, fecha, descripcion, monto, category_id, tipo]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Error al crear la transacción' });
  }
};

const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, descripcion, monto, category_id, tipo } = req.body;
    const userId = req.user.id;

    const query = `
      UPDATE transactions 
      SET fecha = $1, descripcion = $2, monto = $3, category_id = $4, tipo = $5
      WHERE id = $6 AND user_id = $7
      RETURNING *, 
        (SELECT name FROM categories WHERE id = category_id) as category_name
    `;

    const result = await db.query(query, [fecha, descripcion, monto, category_id, tipo, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Error al actualizar la transacción' });
  }
};

const updateTransactionCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id } = req.body;
    const userId = req.user.id;

    const query = `
      UPDATE transactions 
      SET category_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING *, 
        (SELECT name FROM categories WHERE id = category_id) as category_name
    `;

    const result = await db.query(query, [category_id, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction category:', error);
    res.status(500).json({ error: 'Error al actualizar la categoría de la transacción' });
  }
};

const fixTransactionDates = async (req, res) => {
    const userId = req.user.id;
    
    try {
        // Obtener todas las transacciones con fechas futuras
        const findFutureQuery = `
            SELECT id, fecha, descripcion
            FROM transactions
            WHERE user_id = $1
            AND fecha > CURRENT_DATE
            AND EXTRACT(YEAR FROM fecha) > EXTRACT(YEAR FROM CURRENT_DATE)
        `;
        
        const futureTransactions = await db.query(findFutureQuery, [userId]);
        
        if (futureTransactions.rows.length > 0) {
            // Corregir las fechas cambiando solo el año a 2023
            const updateQuery = `
                UPDATE transactions
                SET fecha = fecha - interval '1 year'
                WHERE id = ANY($1::uuid[])
                RETURNING id, fecha, descripcion
            `;
            
            const transactionIds = futureTransactions.rows.map(t => t.id);
            const updatedTransactions = await db.query(updateQuery, [transactionIds]);
            
            console.log('Transacciones corregidas:', updatedTransactions.rows);
            
            res.json({
                message: `Se corrigieron ${updatedTransactions.rows.length} transacciones con fechas futuras`,
                correctedTransactions: updatedTransactions.rows
            });
        } else {
            res.json({
                message: 'Se corrigieron 0 transacciones con fechas futuras',
                correctedTransactions: []
            });
        }
    } catch (error) {
        console.error('Error al corregir fechas:', error);
        res.status(500).json({ 
            error: 'Error al corregir fechas de transacciones',
            details: error.message
        });
    }
};

module.exports = {
    importTransactions,
    getTransactions,
    getCategoryAnalysis,
    getAllTransactions,
    deleteTransaction,
    deleteMultipleTransactions,
    createTransaction,
    updateTransaction,
    updateTransactionCategory,
    fixTransactionDates
};
