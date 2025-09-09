const fs = require('fs').promises;
const path = require('path');

async function cleanupUploads() {
    try {
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        
        // Verificar si el directorio existe
        try {
            await fs.access(uploadsDir);
        } catch (error) {
            console.log('Directorio uploads no existe, creándolo...');
            await fs.mkdir(uploadsDir, { recursive: true });
            return;
        }

        const files = await fs.readdir(uploadsDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
        let deletedCount = 0;

        console.log(`Revisando ${files.length} archivos en uploads/`);

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = await fs.stat(filePath);
            const fileAge = now - stats.mtime.getTime();

            if (fileAge > maxAge) {
                try {
                    await fs.unlink(filePath);
                    console.log(`✓ Eliminado: ${file} (${Math.round(fileAge / (60 * 60 * 1000))}h de antigüedad)`);
                    deletedCount++;
                } catch (error) {
                    console.error(`✗ Error eliminando ${file}:`, error.message);
                }
            }
        }

        console.log(`\nLimpieza completada: ${deletedCount} archivos eliminados`);
        process.exit(0);
    } catch (error) {
        console.error('Error durante la limpieza:', error);
        process.exit(1);
    }
}

cleanupUploads();
