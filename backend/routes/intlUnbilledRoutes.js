const express = require('express');
const { auth } = require('../middleware/auth');
const {
  listByMonth,
  summaryByMonth,
  bulkImport,
  create,
  update,
  remove
} = require('../controllers/intlUnbilledController');

const router = express.Router();
router.use(auth);

router.get('/', listByMonth);
router.get('/summary', summaryByMonth);
router.post('/import', bulkImport);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
