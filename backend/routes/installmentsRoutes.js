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

const router = express.Router();
router.use(auth);

router.get('/plans', listPlans);
router.get('/occurrences', listOccurrencesByMonth);
router.post('/plans', createPlan);
router.put('/plans/:planId', updatePlan);
router.put('/occurrences/:occurrenceId', updateOccurrence);
router.delete('/occurrences/:occurrenceId', deleteOccurrence);
router.delete('/plans/:planId', deletePlanForward);

module.exports = router;
