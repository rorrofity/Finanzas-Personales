const express = require('express');
const router = express.Router();
const { getDashboardData, getMonthlySummary, getCategoryBreakdown, getMonthlyHistory, getCategoryEvolution, getCategoryTransactions } = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.get('/', auth, getDashboardData);
router.get('/summary', auth, getMonthlySummary);
router.get('/categories', auth, getCategoryBreakdown);
router.get('/monthly-history', auth, getMonthlyHistory);
router.get('/category-evolution', auth, getCategoryEvolution);
router.get('/category-transactions', auth, getCategoryTransactions);

module.exports = router;
