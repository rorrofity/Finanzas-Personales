const express = require('express');
const router = express.Router();
const { getDashboardData, getMonthlySummary } = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.get('/', auth, getDashboardData);
router.get('/summary', auth, getMonthlySummary);

module.exports = router;
