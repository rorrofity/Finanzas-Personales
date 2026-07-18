const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { getBalance, setBalance, list, summary, globalBalance, create, update, remove, importFile } = require('../controllers/checkingController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const { resolveSpace } = require('../middleware/resolveSpace');
const { requireEdit, requireDelete } = require('../middleware/requirePermission');

router.use(auth);
router.use(resolveSpace);

router.get('/balance', getBalance);
router.put('/balance', requireEdit, setBalance);
router.get('/global-balance', globalBalance);
router.get('/', list);
router.get('/summary', summary);
router.post('/', requireEdit, create);
router.put('/:id', requireEdit, update);
router.delete('/:id', requireDelete, remove);
router.post('/import-file', requireEdit, upload.single('file'), importFile);

module.exports = router;
