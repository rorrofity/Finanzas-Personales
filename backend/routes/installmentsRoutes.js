const express = require('express');
const { auth } = require('../middleware/auth');
const {
  listPlans,
  listOccurrencesByMonth,
  createPlan,
  updatePlan,
  updateOccurrence,
  deleteOccurrence,
  deletePlanForward,
} = require('../controllers/installmentsController');

const { resolveSpace } = require('../middleware/resolveSpace');
const { requireEdit, requireDelete } = require('../middleware/requirePermission');

const router = express.Router();
router.use(auth);
router.use(resolveSpace);

router.get('/plans', listPlans);
router.get('/occurrences', listOccurrencesByMonth);
router.post('/plans', requireEdit, createPlan);
router.put('/plans/:planId', requireEdit, updatePlan);
router.put('/occurrences/:occurrenceId', requireEdit, updateOccurrence);
router.delete('/occurrences/:occurrenceId', requireDelete, deleteOccurrence);
router.delete('/plans/:planId', requireDelete, deletePlanForward);

module.exports = router;
