const express = require('express');
const { auth } = require('../middleware/auth');
const { getBalance, setBalance, list, summary, create, update, remove } = require('../controllers/checkingController');

const router = express.Router();
router.use(auth);

router.get('/balance', getBalance);
router.put('/balance', setBalance);
router.get('/', list);
router.get('/summary', summary);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
