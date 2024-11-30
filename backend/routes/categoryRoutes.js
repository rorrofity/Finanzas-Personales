const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');

// Todas las rutas requieren autenticación
router.use(auth);

// Rutas CRUD para categorías
router.get('/', getCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
