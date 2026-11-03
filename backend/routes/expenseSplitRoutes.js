const express = require('express');
function createExpenseSplitRouter(options = {}) {
  const router = express.Router();
  const controller = options.controller || require('../controllers/expenseSplitController');
  router.use(options.authMiddleware || require('../middleware/auth').auth);
  router.use(options.spaceMiddleware || require('../middleware/resolveSpace').resolveSpace);
  const edit = options.editMiddleware || require('../middleware/requirePermission').requireEdit;
  router.get('/:source/:id', controller.get);
  router.put('/:source/:id', edit, controller.put);
  router.delete('/:source/:id', edit, controller.remove);
  return router;
}
module.exports = { createExpenseSplitRouter };
