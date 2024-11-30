const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

async function checkTransactions() {
  try {
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.descripcion, 
        t.monto,
        t.fecha,
        c.name as category_name
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      ORDER BY t.fecha DESC 
      LIMIT 5;
    `);

    console.log('\nÚltimas 5 transacciones:');
    console.log('------------------------');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`Descripción: ${row.descripcion}`);
      console.log(`Monto: ${row.monto}`);
      console.log(`Categoría: ${row.category_name}`);
      console.log(`Fecha: ${row.fecha.toLocaleDateString('es-CL')}`);
      console.log('------------------------');
    });

  } catch (err) {
    console.error('Error al consultar la base de datos:', err);
  } finally {
    await pool.end();
  }
}

checkTransactions();
