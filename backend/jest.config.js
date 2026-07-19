// @ts-check
/**
 * Config Jest para pruebas UNITARIAS del backend (Epic 13).
 *
 * Separada de react-scripts test (frontend): corre solo sobre backend/**.
 * Uso: npm run test:backend
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  clearMocks: true,
};
