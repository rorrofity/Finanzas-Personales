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

// All routes protected + espacio activo (Epic 11)
const { resolveSpace } = require('../middleware/resolveSpace');
const { requireEdit, requireDelete } = require('../middleware/requirePermission');
router.use(auth);
router.use(resolveSpace);

router.get('/', listProjected);
router.post('/', requireEdit, createProjected);
router.put('/:occurrenceId', requireEdit, updateOccurrence);
router.delete('/:occurrenceId', requireDelete, deleteOccurrence);
router.delete('/template/:templateId', requireDelete, deleteTemplateForward);

module.exports = router;
