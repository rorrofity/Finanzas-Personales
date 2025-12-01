const express = require('express');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  listByMonth,
  summaryByMonth,
  bulkImport,
  create,
  update,
  remove,
  importFile,
  getSuspiciousDuplicates,
  resolveSuspiciousDuplicate,
  countSuspiciousDuplicates
} = require('../controllers/intlUnbilledController');

const router = express.Router();
router.use(auth);

// Configure uploads directory (same approach as transactions)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xls' || ext === '.xlsx') {
      cb(null, uploadsDir);
    } else {
      cb(null, null); // CSV in memory
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'intl-' + uniqueSuffix + path.extname(file.originalname));
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
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('file');

const handleUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: 'Error al subir el archivo: ' + err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.get('/', listByMonth);
router.get('/summary', summaryByMonth);
// JSON bulk (opcional)
router.post('/import', bulkImport);
// File upload (misma UX que nacionales)
router.post('/import-file', handleUpload, importFile);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

// Duplicados sospechosos
router.get('/suspicious', getSuspiciousDuplicates);
router.get('/suspicious/count', countSuspiciousDuplicates);
router.post('/suspicious/:id/resolve', resolveSuspiciousDuplicate);

module.exports = router;
