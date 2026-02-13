const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// GET /api/cards — Listar tarjetas del usuario
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, last_four, network, holder, label, is_active, created_at, updated_at
       FROM credit_cards
       WHERE user_id = $1
       ORDER BY holder, network, last_four`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listando tarjetas:', error);
    res.status(500).json({ error: 'Error al obtener tarjetas' });
  }
});

// POST /api/cards — Agregar tarjeta
router.post('/', auth, async (req, res) => {
  try {
    const { last_four, network, holder, label } = req.body;

    if (!last_four || !/^\d{4}$/.test(last_four)) {
      return res.status(400).json({ error: 'Últimos 4 dígitos inválidos (debe ser exactamente 4 números)' });
    }
    if (!network || !['visa', 'mastercard'].includes(network.toLowerCase())) {
      return res.status(400).json({ error: 'Red inválida (visa o mastercard)' });
    }
    if (!holder || holder.trim().length < 2) {
      return res.status(400).json({ error: 'Titular es requerido (mínimo 2 caracteres)' });
    }

    const result = await db.query(
      `INSERT INTO credit_cards (user_id, last_four, network, holder, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, last_four, network.toLowerCase(), holder.trim(), label?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una tarjeta con esos últimos 4 dígitos' });
    }
    console.error('Error creando tarjeta:', error);
    res.status(500).json({ error: 'Error al crear tarjeta' });
  }
});

// PUT /api/cards/:id — Editar tarjeta
router.put('/:id', auth, async (req, res) => {
  try {
    const { last_four, network, holder, label, is_active } = req.body;

    if (last_four && !/^\d{4}$/.test(last_four)) {
      return res.status(400).json({ error: 'Últimos 4 dígitos inválidos' });
    }
    if (network && !['visa', 'mastercard'].includes(network.toLowerCase())) {
      return res.status(400).json({ error: 'Red inválida (visa o mastercard)' });
    }

    const result = await db.query(
      `UPDATE credit_cards
       SET last_four = COALESCE($3, last_four),
           network = COALESCE($4, network),
           holder = COALESCE($5, holder),
           label = COALESCE($6, label),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.id,
        last_four || null,
        network?.toLowerCase() || null,
        holder?.trim() || null,
        label !== undefined ? (label?.trim() || null) : undefined,
        is_active !== undefined ? is_active : null
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una tarjeta con esos últimos 4 dígitos' });
    }
    console.error('Error actualizando tarjeta:', error);
    res.status(500).json({ error: 'Error al actualizar tarjeta' });
  }
});

// GET /api/cards/mapping — Endpoint para N8N (sin auth, recibe userId como query param)
// MUST be before /:id routes to avoid Express matching 'mapping' as :id
router.get('/mapping', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }

    const result = await db.query(
      `SELECT last_four, network, holder, label
       FROM credit_cards
       WHERE user_id = $1 AND is_active = true
       ORDER BY holder, network`,
      [userId]
    );

    const mapping = {};
    for (const row of result.rows) {
      mapping[row.last_four] = {
        tipo: row.network,
        titular: row.holder,
        variante: row.label || ''
      };
    }
    res.json(mapping);
  } catch (error) {
    console.error('Error obteniendo mapping de tarjetas:', error);
    res.status(500).json({ error: 'Error al obtener mapping' });
  }
});

// DELETE /api/cards/:id — Eliminar tarjeta
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM credit_cards WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }
    res.json({ success: true, message: 'Tarjeta eliminada' });
  } catch (error) {
    console.error('Error eliminando tarjeta:', error);
    res.status(500).json({ error: 'Error al eliminar tarjeta' });
  }
});

module.exports = router;
