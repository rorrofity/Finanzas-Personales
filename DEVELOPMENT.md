# Guía de Desarrollo - Finanzas Personales

Esta guía proporciona información detallada sobre la arquitectura, decisiones técnicas y flujos de desarrollo del proyecto.

## 🏗️ Arquitectura del Proyecto

### Frontend

#### Estructura de Carpetas
```
src/
├── components/       # Componentes reutilizables
├── contexts/        # Contextos de React (Auth, Theme)
├── layouts/         # Layouts de la aplicación
├── pages/          # Componentes de página
└── App.js          # Componente principal
```

#### Componentes Principales
- `DashboardLayout`: Layout principal con navegación y menú
- `AuthContext`: Manejo de autenticación y estado del usuario
- `Transactions`: Gestión de transacciones financieras
- `Categories`: Administración de categorías
- `Dashboard`: Visualización de datos y análisis

### Backend

#### Estructura de Carpetas
```
backend/
├── config/         # Configuración de BD y servicios
├── controllers/    # Lógica de negocio
├── middleware/     # Middleware (auth, validación)
├── models/         # Modelos de datos
├── routes/         # Definición de rutas
├── migrations/     # Scripts SQL de migración
└── server.js       # Punto de entrada
```

#### Componentes Principales
- `transactionController`: Manejo de transacciones
- `categoryController`: Gestión de categorías
- `authController`: Autenticación y usuarios
- `Transaction`: Modelo de transacciones
- `Category`: Modelo de categorías

## 📊 Modelo de Datos

### Relaciones
```
users
  ↓
  ├── transactions
  │     ↓
  │     categories
  └── categories (user-specific)
```

### Categorías
- Pueden ser globales (user_id = NULL) o específicas de usuario
- Las transacciones pueden tener una categoría opcional
- Se mantiene integridad referencial en eliminación

## 🔄 Flujos Principales

### Gestión de Transacciones
1. CRUD básico de transacciones
2. Importación desde CSV
3. Categorización en tiempo real
4. Análisis y reportes

### Sistema de Categorías
1. Categorías predefinidas globales
2. Categorías personalizadas por usuario
3. Asignación y actualización en línea
4. Prevención de eliminación si hay transacciones asociadas

## 🛠️ Herramientas de Desarrollo

### Frontend
- React Dev Tools
- Material-UI Theme Editor
- Axios Interceptors para debugging

### Backend
- Nodemon para desarrollo
- pgAdmin 4 para gestión de BD
- Postman para pruebas de API

## 📝 Convenciones de Código

### Nombrado
- Componentes: PascalCase
- Funciones: camelCase
- SQL: snake_case
- Archivos React: PascalCase
- Otros archivos: kebab-case

### Estructura de Componentes
```jsx
// Imports
import React from 'react';
import PropTypes from 'prop-types';

// Component
const ComponentName = ({ prop1, prop2 }) => {
  // Hooks
  // Functions
  // Return/Render
};

// PropTypes
ComponentName.propTypes = {
  prop1: PropTypes.string.required,
  prop2: PropTypes.number
};

export default ComponentName;
```

## 🔒 Seguridad

### Autenticación
- JWT con expiración
- Refresh tokens
- Almacenamiento seguro en localStorage

### Autorización
- Middleware de autenticación
- Validación de propiedad de recursos
- Sanitización de entrada de datos

### Base de Datos
- Prepared statements
- Validación de tipos
- Manejo de errores consistente

## 📊 Importación CSV

### Formato Esperado
```csv
Fecha;Descripción;Monto ($);Cuotas
17/01/2024;Compra supermercado;-50000;1
```

### Proceso
1. Validación de formato
2. Normalización de datos
3. Detección de duplicados
4. Categorización automática
5. Inserción en base de datos

## 🚀 Despliegue

### Desarrollo
```bash
# Backend
cd backend
npm run dev

# Frontend
cd ../
npm start
```

### Producción
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd ../
npm run build
serve -s build
```

## 🔄 Flujo de Git

### Ramas
- `main`: Producción
- `develop`: Desarrollo principal
- `feature/*`: Nuevas características
- `hotfix/*`: Correcciones urgentes

### Commits
```
feat: Añadir sistema de categorías
fix: Corregir validación de fechas
docs: Actualizar README
style: Formatear código
refactor: Reorganizar estructura de carpetas
```

## 📈 Monitoreo y Logging

### Frontend
- Error Boundaries
- Analytics
- Performance monitoring

### Backend
- Winston para logging
- Morgan para HTTP logging
- Error handling centralizado

## 🐛 Debugging

### Frontend
1. React Developer Tools
2. Console logging estratégico
3. Error Boundaries

### Backend
1. Node.js debugger
2. Winston logging
3. SQL query logging

## 📚 Recursos

- [Material-UI Documentation](https://mui.com/)
- [React Documentation](https://reactjs.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Arquitectura del Sistema

### Sistema de Importación de Transacciones

El sistema de importación de transacciones está diseñado para ser flexible y extensible, permitiendo procesar diferentes formatos de estados de cuenta bancarios.

#### Componentes Principales

1. **Sistema de Templates (`/backend/config/fileTemplates.js`)**
   ```javascript
   {
     'Mov_Facturado': {
       section: 'movimientos nacionales',
       columns: {
         fecha: 'fecha',
         descripcion: 'descripción',
         monto: 'monto ($)',
         cuotas: 'cuotas'
       },
       montoColumn: 'direct'
     }
   }
   ```
   - Define la estructura esperada de cada tipo de archivo
   - Configura el mapeo de columnas
   - Especifica reglas de procesamiento específicas

2. **Controlador de Transacciones (`/backend/controllers/transactionController.js`)**
   - Procesa archivos Excel y CSV
   - Implementa la lógica de detección y mapeo
   - Maneja la validación y transformación de datos

#### Flujo de Importación

1. **Detección de Formato**
   - El sistema analiza el nombre del archivo
   - Busca coincidencias en los templates disponibles
   - Aplica la configuración específica del formato

2. **Procesamiento de Datos**
   - Lectura del archivo usando `xlsx`
   - Mapeo de columnas según el template
   - Validación de datos requeridos
   - Transformación de fechas y montos

3. **Prevención de Duplicados**
   - Generación de claves únicas por transacción
   - Verificación contra transacciones existentes
   - Actualización de registros duplicados

4. **Validación y Transformación**
   ```javascript
   // Ejemplo de procesamiento de fecha
   const [day, month, year] = fechaStr.split('/').map(num => parseInt(num, 10));
   fecha = new Date(year, month - 1, day);

   // Ejemplo de procesamiento de monto
   monto = monto.replace(/[^\d.-]/g, '');
   monto = parseFloat(monto);
   ```

#### Agregar Nuevo Formato

Para agregar soporte para un nuevo formato de archivo:

1. **Crear Template**
   ```javascript
   // En fileTemplates.js
   'Nuevo_Formato': {
     section: 'nombre_seccion',
     columns: {
       fecha: 'nombre_columna_fecha',
       descripcion: 'nombre_columna_descripcion',
       monto: 'nombre_columna_monto'
     },
     montoColumn: 'direct|K|otra_columna',
     startOffset: 1,
     typePatterns: {
       // Patrones para detectar tipos
     }
   }
   ```

2. **Configurar Procesamiento**
   - Definir reglas de mapeo de columnas
   - Especificar transformaciones necesarias
   - Agregar validaciones específicas

3. **Probar Importación**
   - Verificar detección correcta del formato
   - Validar procesamiento de datos
   - Confirmar prevención de duplicados

## Guías de Contribución

### Estándares de Código

- Usar ES6+ features
- Mantener consistencia en el estilo
- Documentar funciones y componentes
- Agregar logging apropiado

### Pruebas

1. **Pruebas Unitarias**
   - Validación de templates
   - Procesamiento de datos
   - Transformaciones

2. **Pruebas de Integración**
   - Flujo completo de importación
   - Manejo de errores
   - Casos límite

### Logging y Depuración

El sistema incluye logging detallado para facilitar la depuración:

```javascript
console.log('\nAnalizando estructura del archivo:');
rawData.slice(0, 10).forEach((row, index) => {
  console.log(`Fila ${index}:`, row);
});
```

### Seguridad

- Validar tipos de archivo
- Sanitizar datos de entrada
- Manejar errores apropiadamente
- Proteger rutas con autenticación

## Roadmap

1. **Mejoras Planificadas**
   - Soporte para más formatos de archivo
   - UI para configuración de templates
   - Mejoras en la detección de duplicados
   - Optimización de rendimiento

2. **Bugs Conocidos**
   - Documentar y trackear issues
   - Priorizar correcciones
   - Mantener registro de cambios

## Arquitectura del Sistema

### Sistema de Importación de Transacciones

El sistema de importación de transacciones está diseñado para ser flexible y extensible, permitiendo procesar diferentes formatos de estados de cuenta bancarios.

#### Procesamiento de Transacciones

1. **Detección de Tipo de Transacción**
   ```javascript
   // Determinación automática del tipo de transacción
   let tipo = 'gasto';  // Por defecto
   if (monto < 0) {
     tipo = 'pago';     // Montos negativos son pagos
   } else if (descripcion.toLowerCase().includes('abono')) {
     tipo = 'ingreso';  // Abonos son ingresos
   }
   ```

2. **Cálculo de Deuda Total**
   ```sql
   -- Cálculo de deuda mensual
   SELECT 
     COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) as total_gastos,
     COALESCE(SUM(CASE WHEN tipo = 'pago' THEN ABS(monto) ELSE 0 END), 0) as total_pagos,
     (
       COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN tipo = 'pago' THEN ABS(monto) ELSE 0 END), 0)
     ) as deuda_total
   ```

3. **Validación de Datos**
   - Verificación de formato de fecha (DD/MM/YYYY)
   - Validación de montos numéricos
   - Detección de transacciones duplicadas
   - Normalización de descripciones

#### Dashboard y Visualización

1. **Cálculo de Totales**
   - Gastos: Suma de todas las transacciones tipo 'gasto'
   - Pagos: Suma del valor absoluto de transacciones tipo 'pago'
   - Deuda: Diferencia entre gastos totales y pagos totales

2. **Gráficos y Tendencias**
   - Visualización mensual de gastos vs pagos
   - Tendencia de deuda a lo largo del tiempo
   - Distribución de gastos por categoría

#### Templates Soportados Actualmente

El sistema actualmente soporta dos formatos específicos de archivos Excel:

1. **Movimientos Facturados**
   ```javascript
   'Mov_Facturado': {
     section: 'movimientos nacionales',
     columns: {
       fecha: 'fecha',
       descripcion: 'descripción',
       monto: 'monto ($)',
       cuotas: 'cuotas'
     },
     montoColumn: 'direct', // Usa el monto directamente de la columna mapeada
     defaultType: 'gasto',
     typePatterns: {
       pago: [
         'pago pap cuenta corriente',
         'pago cuenta corriente',
         'pago tarjeta',
         'abono'
       ]
     }
   }
   ```

2. **Movimientos No Facturados**
   ```javascript
   'Saldo_y_Mov_No_Facturado': {
     sheetName: 'Saldo y Mov No Facturado',
     section: 'movimientos nacionales',
     columns: {
       fecha: 'fecha',
       descripcion: 'descripción',
       monto: 'monto ($)',
       cuotas: 'cuotas'
     },
     montoColumn: 'K', // Usa específicamente la columna K para montos
     defaultType: 'gasto',
     typePatterns: {
       pago: [
         'pago pap cuenta corriente',
         'pago cuenta corriente',
         'pago tarjeta',
         'abono'
       ]
     }
   }
   ```

#### Diferencias Clave Entre Templates

1. **Movimientos Facturados**:
   - Usa el monto directamente de la columna mapeada (`montoColumn: 'direct'`)
   - No requiere una hoja específica
   - Procesamiento estándar de columnas

2. **Movimientos No Facturados**:
   - Usa específicamente la columna K para montos (`montoColumn: 'K'`)
   - Requiere la hoja "Saldo y Mov No Facturado"
   - Procesamiento especial para la estructura del archivo

#### Flujo de Importación

1. **Detección de Formato**
   - El sistema analiza el nombre del archivo
   - Busca coincidencias en los templates disponibles
   - Aplica la configuración específica del formato

2. **Procesamiento de Datos**
   - Lectura del archivo usando `xlsx`
   - Mapeo de columnas según el template
   - Validación de datos requeridos
   - Transformación de fechas y montos

3. **Prevención de Duplicados**
   - Generación de claves únicas por transacción
   - Verificación contra transacciones existentes
   - Actualización de registros duplicados

4. **Validación y Transformación**
   ```javascript
   // Ejemplo de procesamiento de fecha
   const [day, month, year] = fechaStr.split('/').map(num => parseInt(num, 10));
   fecha = new Date(year, month - 1, day);

   // Ejemplo de procesamiento de monto
   monto = monto.replace(/[^\d.-]/g, '');
   monto = parseFloat(monto);
   ```

#### Agregar Nuevo Formato

Para agregar soporte para un nuevo formato de archivo:

1. **Crear Template**
   ```javascript
   // En fileTemplates.js
   'Nuevo_Formato': {
     section: 'nombre_seccion',
     columns: {
       fecha: 'nombre_columna_fecha',
       descripcion: 'nombre_columna_descripcion',
       monto: 'nombre_columna_monto'
     },
     montoColumn: 'direct|K|otra_columna',
     startOffset: 1,
     typePatterns: {
       // Patrones para detectar tipos
     }
   }
   ```

2. **Configurar Procesamiento**
   - Definir reglas de mapeo de columnas
   - Especificar transformaciones necesarias
   - Agregar validaciones específicas

3. **Probar Importación**
   - Verificar detección correcta del formato
   - Validar procesamiento de datos
   - Confirmar prevención de duplicados
