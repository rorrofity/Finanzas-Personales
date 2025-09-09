const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Crear una ruta absoluta para el directorio de uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Asegurarse de que el directorio de uploads exista
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configurar multer para manejar la carga de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    // Solo guardar en disco los archivos Excel
    if (ext === '.xls' || ext === '.xlsx') {
      cb(null, uploadsDir);
    } else {
      cb(null, null); // Los archivos CSV se guardarán en memoria
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  const allowedExtensions = ['.csv', '.xls', '.xlsx'];
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no soportado. Use CSV o Excel (.xls, .xlsx)'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // Límite de 5MB
  }
}).single('file');

// Middleware para manejar errores de multer
const handleUpload = (req, res, next) => {
  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // Error de multer
      return res.status(400).json({
        message: 'Error al subir el archivo: ' + err.message
      });
    } else if (err) {
      // Otro tipo de error
      return res.status(400).json({
        message: err.message
      });
    }
    // Todo bien
    next();
  });
};

// Aplicar middleware de autenticación a todas las rutas
router.use(auth);

// Rutas CRUD básicas
router.post('/', transactionController.createTransaction);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);
router.get('/', transactionController.getAllTransactions);

// Rutas especializadas
router.post('/import', handleUpload, transactionController.importTransactions);
router.get('/summary', transactionController.getTransactions);
router.get('/category-analysis', transactionController.getCategoryAnalysis);
router.delete('/', transactionController.deleteMultipleTransactions);
router.put('/:id/category', transactionController.updateTransactionCategory);
router.post('/fix-dates', auth, transactionController.fixTransactionDates);

// Ruta para debugging de transacciones
router.get('/debug-last-import', async (req, res) => {
  try {
    const db = require('../config/database');
    // Obtener las últimas transacciones importadas (ajusta el rango de fechas según necesites)
    const result = await db.query(`
      SELECT 
        fecha,
        descripcion,
        monto,
        tipo,
        created_at
      FROM transactions 
      WHERE user_id = $1 
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY fecha ASC, descripcion ASC
    `, [req.user.id]);

    // Calcular totales
    const totals = await db.query(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END) as total_gastos,
        SUM(CASE WHEN tipo = 'pago' THEN ABS(monto) ELSE 0 END) as total_pagos,
        COUNT(CASE WHEN tipo = 'gasto' THEN 1 END) as num_gastos,
        COUNT(CASE WHEN tipo = 'pago' THEN 1 END) as num_pagos
      FROM transactions 
      WHERE user_id = $1 
      AND created_at >= NOW() - INTERVAL '1 hour'
    `, [req.user.id]);

    res.json({
      transactions: result.rows,
      summary: totals.rows[0]
    });
  } catch (error) {
    console.error('Error en debug-last-import:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
