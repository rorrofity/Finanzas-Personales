const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

async function runMigrations() {
    try {
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        const files = await fs.readdir(migrationsDir);
        
        // Ordenar los archivos de migración
        const migrationFiles = files
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log('Ejecutando migraciones...');

        for (const file of migrationFiles) {
            console.log(`\nEjecutando migración: ${file}`);
            const filePath = path.join(migrationsDir, file);
            const sql = await fs.readFile(filePath, 'utf8');
            
            try {
                await db.query(sql);
                console.log(`✓ Migración ${file} ejecutada exitosamente`);
            } catch (error) {
                // Permitir que migraciones idempotentes continúen si los objetos ya existen
                const benignCodes = new Set([
                    '42P07', // duplicate_table
                    '42710', // duplicate_object (constraint/index)
                    '23505', // unique_violation (posibles índices únicos)
                ]);
                const benignMessages = [
                    'already exists',
                    'relation',
                    'duplicate key value violates unique constraint',
                ];

                if (benignCodes.has(error.code) || benignMessages.some(m => (error.message || '').toLowerCase().includes(m))) {
                    console.warn(`! Aviso: ${file} omitida parcialmente por objeto existente (${error.code || 'no-code'}). Continuando...`);
                    continue;
                }

                console.error(`✗ Error ejecutando migración ${file}:`, error.message);
                throw error;
            }
        }

        console.log('\n¡Migraciones completadas exitosamente!');
        process.exit(0);
    } catch (error) {
        console.error('Error ejecutando migraciones:', error);
        process.exit(1);
    }
}

runMigrations();
