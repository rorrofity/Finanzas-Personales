const express = require('express');
const router = express.Router();
const { getDashboardData, getMonthlySummary, getCategoryBreakdown, getMonthlyHistory, getCategoryEvolution, getCategoryTransactions, getOverview } = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');
const { resolveSpace } = require('../middleware/resolveSpace');

// Autenticación + espacio activo (Epic 11) — todas son lecturas
router.use(auth);
router.use(resolveSpace);

router.get('/', getDashboardData);
router.get('/overview', getOverview);
router.get('/summary', getMonthlySummary);
router.get('/categories', getCategoryBreakdown);
router.get('/monthly-history', getMonthlyHistory);
router.get('/category-evolution', getCategoryEvolution);
router.get('/category-transactions', getCategoryTransactions);

module.exports = router;
