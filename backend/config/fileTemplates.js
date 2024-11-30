// Configuraciones para diferentes tipos de archivos de estado de cuenta
const fileTemplates = {
  'Mov_Facturado': {
    section: 'movimientos nacionales',
    columns: {
      fecha: 'fecha',
      descripcion: 'descripción',
      monto: 'monto ($)',
      cuotas: 'cuotas'
    },
    startOffset: 1,
    defaultType: 'gasto',
    montoColumn: 'direct', // Indica que el monto está en la columna especificada
    typePatterns: {
      pago: [
        'pago pap cuenta corriente',
        'pago cuenta corriente',
        'pago tarjeta',
        'abono'
      ]
    }
  },
  'Saldo_y_Mov_No_Facturado': {
    sheetName: 'Saldo y Mov No Facturado',
    section: 'movimientos nacionales',
    columns: {
      fecha: 'fecha',
      descripcion: 'descripción',
      monto: 'monto ($)',
      cuotas: 'cuotas'
    },
    startOffset: 1,
    defaultType: 'gasto',
    montoColumn: 'K', // Indica que el monto está en la columna K
    typePatterns: {
      pago: [
        'pago pap cuenta corriente',
        'pago cuenta corriente',
        'pago tarjeta',
        'abono'
      ]
    }
  }
};

// Función auxiliar para encontrar el template correcto
const findTemplate = (filename) => {
  // Primero intentamos una coincidencia exacta
  if (fileTemplates[filename]) {
    return fileTemplates[filename];
  }

  // Si no hay coincidencia exacta, buscamos por coincidencia parcial
  for (const [templateName, template] of Object.entries(fileTemplates)) {
    if (filename.toLowerCase().includes(templateName.toLowerCase())) {
      console.log('Coincidencia encontrada:', templateName, 'para archivo:', filename);
      return { ...template, matchedTemplate: templateName };
    }
  }

  console.log('No se encontró coincidencia para:', filename);
  console.log('Templates disponibles:', Object.keys(fileTemplates));
  return null;
};

module.exports = { fileTemplates, findTemplate };
