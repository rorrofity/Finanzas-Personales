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
    const records = [];
    
    if (!fileContent || fileContent.trim() === '') {
      console.error('Error: El contenido del archivo está vacío');
      reject(new Error('El contenido del archivo está vacío'));
      return;
    }

    const lines = fileContent.split('\n');
    
    let lineCount = 0;
    let isInMovimientosNacionales = false;
    let columnIndexes = null;

    for (const line of lines) {
      lineCount++;
      const record = line.trim();

      if (!record) continue;

      // Detectar la sección de Movimientos Nacionales
      if (record.includes('Movimientos Nacionales')) {
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
            // Procesar el monto
            monto = monto.replace(/\./g, '').replace(',', '.');
            monto = parseFloat(monto);

            // Determinar el tipo basado en el monto y la descripción
            let tipo = 'gasto';
            if (monto < 0) {
              tipo = 'pago';
            } else if (descripcion.toLowerCase().includes('abono')) {
              tipo = 'ingreso';
            }

            const transaction = {
              fecha,
              descripcion,
              monto,
              tipo
            };

            if (transaction.fecha && transaction.descripcion && !isNaN(transaction.monto)) {
              records.push(transaction);
            }
          }
        } catch (error) {
          // Ignorar errores de parseo de líneas individuales
        }
      }
    }

    console.log(`\nParseo completado. ${records.length} registros válidos encontrados.`);
    console.log('Registros finales:', records);
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
    const existingTransactions = new Set();
    let totalAmount = 0;
    let transactionLog = [];

    // Obtener transacciones existentes para el usuario usando nuestro modelo personalizado
    try {
      const existing = await transactionModel.getAllTransactions(userId);
      
      // Crear un Set de transacciones existentes para búsqueda rápida
      existing.forEach(t => {
        // Asegurarse de que la fecha sea un objeto Date
        const fecha = t.fecha instanceof Date ? t.fecha : new Date(t.fecha);
        const key = `${fecha.toISOString()}_${t.descripcion}_${t.monto}`;
        existingTransactions.add(key);
      });
    } catch (error) {
      console.error('Error al obtener transacciones existentes:', error);
      // Continuar con un Set vacío si hay error
    }

    for (let i = startIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;

      if (!row[columnMap.fecha] || !row[columnMap.descripcion] || !row[columnMap.monto]) continue;

      try {
        let fecha;
        const fechaStr = row[columnMap.fecha];
        
        if (fechaStr instanceof Date) {
          fecha = fechaStr;
        } else if (typeof fechaStr === 'number') {
          fecha = parseExcelDate(fechaStr);
        } else if (typeof fechaStr === 'string') {
          // Convertir el formato dd/mm/yyyy a Date
          const [day, month, year] = fechaStr.split('/').map(num => parseInt(num, 10));
          fecha = new Date(year, month - 1, day);
        } else {
          console.warn('Formato de fecha no reconocido:', fechaStr);
          continue;
        }

        let monto = row[columnMap.monto];
        if (typeof monto === 'string') {
          // Limpiar el monto de caracteres no numéricos
          monto = monto.replace(/[^\d.-]/g, '');
        }
        monto = parseFloat(monto);

        // Solo validar que el monto sea un número
        if (isNaN(monto)) {
          console.warn('Monto inválido:', monto, 'en fila:', i + 1);
          continue;
        }

        const descripcion = String(row[columnMap.descripcion]).trim();
        
        // Verificar si la transacción ya existe
        const transactionKey = `${fecha.toISOString()}_${descripcion}_${monto}`;
        if (existingTransactions.has(transactionKey)) {
          console.log('Transacción duplicada omitida:', { fecha, descripcion, monto });
          continue;
        }

        // Determinar el tipo de transacción basado en los patrones
        let tipo = template.defaultType;
        if (template.typePatterns) {
          const descripcionLower = descripcion.toLowerCase();
          for (const [tipoPattern, patterns] of Object.entries(template.typePatterns)) {
            if (patterns.some(pattern => descripcionLower.includes(pattern))) {
              tipo = tipoPattern;
              break;
            }
          }
        }

        const transaction = {
          fecha: fecha,
          descripcion: descripcion,
          monto: monto,
          cuotas: row[columnMap.cuotas] ? String(row[columnMap.cuotas]).split('/')[0] : '01',
          tipo: monto < 0 ? 'pago' : tipo, // Si el monto es negativo, es un pago
          user_id: userId
        };

        // Guardar el monto original para el log
        totalAmount += Math.abs(monto);

        // Agregar a la suma total y al log
        transactionLog.push({
          descripcion,
          monto,
          tipo
        });

        transactions.push(transaction);
        existingTransactions.add(transactionKey);
      } catch (error) {
        console.error('Error procesando fila:', error);
        console.error('Datos de la fila:', row);
        continue;
      }
    }

    console.log('\n=== RESUMEN DE TRANSACCIONES ===');
    console.log('Número total de transacciones:', transactions.length);
    console.log('Monto total:', totalAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }));
    console.log('\nDetalle de transacciones:');
    transactionLog.forEach((t, i) => {
      console.log(`${i + 1}. ${t.descripcion}: ${t.monto.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })} (${t.tipo})`);
    });
    console.log('\n==============================\n');

    return transactions;
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

    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Validar el tipo de archivo
    if (!['.csv', '.xls', '.xlsx'].includes(fileExtension)) {
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Tipo de archivo no soportado. Por favor, sube un archivo CSV o Excel.' 
      });
    }

    let transactions;

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
      transactions = await processExcelFile(req.file.path, req.user.id, req.file.originalname);
      // Limpiar el archivo después de procesarlo
      fs.unlinkSync(req.file.path);
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
      return res.status(400).json({ error: 'No se encontraron transacciones válidas en el archivo' });
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

    const transactionModel = new Transaction(db);
    const importResult = await transactionModel.importFromCSV(req.user.id, processedTransactions);

    res.status(201).json({
      success: true,
      message: importResult.message,
      stats: importResult.stats,
      transactions: importResult.insertedTransactions
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
    const transactions = await transactionModel.getAllTransactions(req.user.id);
    res.json(transactions);
  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
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
