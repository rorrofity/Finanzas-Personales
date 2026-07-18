// @ts-check
/**
 * Acceso directo a la BD local para setup/limpieza de las pruebas de API.
 * Usa las mismas credenciales del backend (raíz .env).
 * SOLO para uso en tests — nunca en código de producción.
 */
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'finanzas_personales',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
});

const query = (text, params) => pool.query(text, params);

/**
 * Borra membresías de espacio que involucren a los emails de prueba
 * (como dueño, miembro o invitación pendiente).
 * @param {string[]} emails
 */
async function cleanSpaceMemberships(emails) {
  await query(
    `DELETE FROM space_members
     WHERE invited_email = ANY($1)
        OR owner_user_id IN (SELECT id FROM users WHERE email = ANY($1))
        OR member_user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails]
  );
}

/** Borra transacciones de prueba por prefijo de descripción. */
async function cleanTestTransactions(prefix) {
  await query(`DELETE FROM transactions WHERE descripcion LIKE $1`, [`${prefix}%`]);
}

/** Borra un usuario de prueba por email (y sus datos en cascada). */
async function deleteUserByEmail(email) {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
}

async function closeDb() {
  await pool.end();
}

module.exports = { query, cleanSpaceMemberships, cleanTestTransactions, deleteUserByEmail, closeDb };
