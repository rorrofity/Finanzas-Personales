const express = require('express');
const { register, login, getProfile, googleAuth } = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Rutas públicas
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);

// Rutas protegidas
router.get('/profile', auth, getProfile);

module.exports = router;
