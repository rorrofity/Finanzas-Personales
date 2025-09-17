const db = require('../config/database');

// Obtener todas las categorías del usuario
const getCategories = async (req, res) => {
    try {
        const userId = req.user.id;
        // Prefer user-specific category over global when there is a name collision
        // DISTINCT ON(name) keeps the first row per name according to ORDER BY
        const query = `
            SELECT DISTINCT ON (name) id, name, description, created_at
            FROM categories
            WHERE user_id = $1 OR user_id IS NULL
            ORDER BY name, CASE WHEN user_id IS NULL THEN 1 ELSE 0 END, created_at DESC
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
};

// Crear una nueva categoría
const createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        const query = `
            INSERT INTO categories (name, description, user_id)
            VALUES ($1, $2, $3)
            RETURNING id, name, description, created_at
        `;
        const result = await db.query(query, [name, description, userId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Error de duplicado
            res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        } else {
            console.error('Error al crear categoría:', error);
            res.status(500).json({ error: 'Error al crear categoría' });
        }
    }
};

// Actualizar una categoría
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const userId = req.user.id;

        const query = `
            UPDATE categories
            SET name = $1, description = $2
            WHERE id = $3 AND user_id = $4
            RETURNING id, name, description, created_at
        `;
        const result = await db.query(query, [name, description, id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        } else {
            console.error('Error al actualizar categoría:', error);
            res.status(500).json({ error: 'Error al actualizar categoría' });
        }
    }
};

// Eliminar una categoría
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verificar si hay transacciones usando esta categoría
        const checkQuery = `
            SELECT COUNT(*) 
            FROM transactions 
            WHERE category_id = $1
        `;
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows[0].count > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar la categoría porque tiene transacciones asociadas' 
            });
        }

        const query = `
            DELETE FROM categories
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `;
        const result = await db.query(query, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        res.json({ message: 'Categoría eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar categoría:', error);
        res.status(500).json({ error: 'Error al eliminar categoría' });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
