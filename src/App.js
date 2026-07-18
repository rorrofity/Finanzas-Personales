import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { Box, CircularProgress } from '@mui/material';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PeriodProvider } from './contexts/PeriodContext';
import { OfflineProvider } from './contexts/OfflineContext';
import theme from './theme';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// PWA
import UpdateBanner from './components/UpdateBanner';
import InstallPrompt from './components/InstallPrompt';

// Pages (lazy: code-splitting por ruta — Req 9.5 / tarea 5.4).
// Los chunks quedan precacheados por el Service Worker (Workbox).
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Categories = lazy(() => import('./pages/Categories'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectedTransactions = lazy(() => import('./pages/ProjectedTransactions'));
const TransactionsIntl = lazy(() => import('./pages/TransactionsIntl'));
const Installments = lazy(() => import('./pages/Installments'));
const Checking = lazy(() => import('./pages/Checking'));
const ReviewDuplicates = lazy(() => import('./pages/ReviewDuplicates'));
const FinancialHealth = lazy(() => import('./pages/FinancialHealth'));

const PageLoader = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
    <CircularProgress />
  </Box>
);

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {/* Safe-area iOS/Android en modo standalone (Req 9.11) */}
        <GlobalStyles
          styles={{
            body: {
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            },
          }}
        />
        <UpdateBanner />
        <InstallPrompt />
        <AuthProvider>
          <PeriodProvider>
            <OfflineProvider>
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="financial-health" element={<FinancialHealth />} />
                  <Route path="transactions" element={<Transactions />} />
                  <Route path="transactions-intl" element={<TransactionsIntl />} />
                  <Route path="installments" element={<Installments />} />
                  <Route path="checking" element={<Checking />} />
                  <Route path="projected-transactions" element={<ProjectedTransactions />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="review-duplicates" element={<ReviewDuplicates />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
              </Suspense>
            </OfflineProvider>
          </PeriodProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
