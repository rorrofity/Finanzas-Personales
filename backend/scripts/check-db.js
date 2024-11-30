const { pool } = require('../config/database');

async function checkDatabaseConnection() {
    try {
        // Intentar una consulta simple
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Conexión a la base de datos exitosa!');
        console.log('Tiempo del servidor:', result.rows[0].now);

        // Verificar la tabla users
        const usersTable = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);

        if (usersTable.rows[0].exists) {
            console.log('✅ La tabla users existe');
            
            // Contar usuarios
            const userCount = await pool.query('SELECT COUNT(*) FROM users');
            console.log(`📊 Número de usuarios en la base de datos: ${userCount.rows[0].count}`);
        } else {
            console.log('❌ La tabla users no existe');
        }

    } catch (error) {
        console.error('❌ Error conectando a la base de datos:', error.message);
        console.error('Detalles completos del error:', error);
    } finally {
        // Cerrar la conexión
        await pool.end();
    }
}

checkDatabaseConnection();
