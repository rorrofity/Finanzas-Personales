const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  listProjected,
  createProjected,
  updateOccurrence,
  deleteOccurrence,
  deleteTemplateForward,
} = require('../controllers/projectedController');

// All routes protected
router.use(auth);

router.get('/', listProjected);
router.post('/', createProjected);
router.put('/:occurrenceId', updateOccurrence);
router.delete('/:occurrenceId', deleteOccurrence);
router.delete('/template/:templateId', deleteTemplateForward);

module.exports = router;
