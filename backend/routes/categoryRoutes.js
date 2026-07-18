const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');

// Todas las rutas requieren autenticación + espacio activo (Epic 11)
const { resolveSpace } = require('../middleware/resolveSpace');
const { requireEdit, requireDelete } = require('../middleware/requirePermission');
router.use(auth);
router.use(resolveSpace);

// Rutas CRUD para categorías
router.get('/', getCategories);
router.post('/', requireEdit, createCategory);
router.put('/:id', requireEdit, updateCategory);
router.delete('/:id', requireDelete, deleteCategory);

module.exports = router;
