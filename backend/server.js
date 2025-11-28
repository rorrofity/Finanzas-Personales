const express = require('express');
const cors = require('cors');
// const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Configure dotenv to look for .env in the root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const projectedRoutes = require('./routes/projectedRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const installmentsRoutes = require('./routes/installmentsRoutes');
const intlUnbilledRoutes = require('./routes/intlUnbilledRoutes');
const checkingRoutes = require('./routes/checkingRoutes');
const syncRoutes = require('./routes/syncRoutes');
const suspiciousRoutes = require('./routes/suspiciousRoutes');
const financialHealthRoutes = require('./routes/financialHealthRoutes');

// Initialize Express app
const app = express();

// Middleware
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [process.env.FRONTEND_URL || 'https://finanzas.rocketflow.cl']
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (como Postman, curl, etc)
    if (!origin) return callback(null, true);
    
    // Permitir túneles SSH (localhost:8080, localhost:8081, etc)
    if (origin && origin.match(/^http:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }
    
    // En desarrollo, permitir localhost.run y lhr.life (túneles)
    if (process.env.NODE_ENV !== 'production') {
      if (origin.includes('localhost.run') || origin.includes('.lhr.life')) {
        return callback(null, true);
      }
    }
    
    // Verificar lista de orígenes permitidos
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Security headers middleware
app.use((req, res, next) => {
  // HTTPS Strict Transport Security
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com; " +
    "frame-src https://accounts.google.com;"
  );
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// Logging - Deshabilitado para reducir ruido en consola
// Solo se mostrarán errores críticos
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// }

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/projected', projectedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/installments', installmentsRoutes);
app.use('/api/intl-unbilled', intlUnbilledRoutes);
app.use('/api/checking', checkingRoutes);
app.use('/api/sync', syncRoutes); // Cambiar a /api/sync para evitar conflicto con auth middleware
app.use('/api/suspicious', suspiciousRoutes);
app.use('/api/financial-health', financialHealthRoutes);

// Serve static files from React build (only in production)
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../build');
  app.use(express.static(buildPath));
  
  // Handle React Router - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Algo salió mal',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Add health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const db = require('./config/database');
    await db.query('SELECT 1');
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Health check disponible en http://localhost:${PORT}/api/health`);
});

module.exports = app;
