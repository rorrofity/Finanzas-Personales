const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { getBalance, setBalance, list, summary, create, update, remove, importFile } = require('../controllers/checkingController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(auth);

router.get('/balance', getBalance);
router.put('/balance', setBalance);
router.get('/', list);
router.get('/summary', summary);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/import-file', upload.single('file'), importFile);

module.exports = router;
