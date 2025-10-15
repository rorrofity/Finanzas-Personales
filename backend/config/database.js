const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'finanzas_personales',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // Maximum time to wait for a connection
});

// Error handling for database connection
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Function to execute queries
async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    // Solo mostrar errores críticos
    console.error('Database error:', error.message);
    throw error;
  }
}

// Graceful shutdown
async function shutdown() {
  try {
    await pool.end();
    console.log('Database pool has ended');
  } catch (err) {
    console.error('Error during database pool shutdown', err);
  }
}

// Handle application termination
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

module.exports = {
  query,
  pool
};
