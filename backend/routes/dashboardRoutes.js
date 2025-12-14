const express = require('express');
const router = express.Router();
const { getDashboardData, getMonthlySummary, getCategoryBreakdown, getMonthlyHistory, getCategoryEvolution } = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.get('/', auth, getDashboardData);
router.get('/summary', auth, getMonthlySummary);
router.get('/categories', auth, getCategoryBreakdown);
router.get('/monthly-history', auth, getMonthlyHistory);
router.get('/category-evolution', auth, getCategoryEvolution);

module.exports = router;
