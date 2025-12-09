const express = require('express');
const router = express.Router();
const { getDashboardData, getMonthlySummary, getCategoryBreakdown } = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.get('/', auth, getDashboardData);
router.get('/summary', auth, getMonthlySummary);
router.get('/categories', auth, getCategoryBreakdown);

module.exports = router;
