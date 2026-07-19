const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { getVapidPublicKey, subscribe, unsubscribe, sendTest } = require('../controllers/pushController');

// Sin resolveSpace a propósito: las suscripciones push son por persona
// (req.user.id), no por espacio activo (ver pushController.js).
router.use(auth);

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);
router.post('/test', sendTest);

module.exports = router;
