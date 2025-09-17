import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PeriodProvider } from './contexts/PeriodContext';
import theme from './theme';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Profile from './pages/Profile';
import ProjectedTransactions from './pages/ProjectedTransactions';
import TransactionsIntl from './pages/TransactionsIntl';
import Installments from './pages/Installments';
import Checking from './pages/Checking';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <PeriodProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="transactions-intl" element={<TransactionsIntl />} />
            <Route path="installments" element={<Installments />} />
            <Route path="checking" element={<Checking />} />
            <Route path="projected-transactions" element={<ProjectedTransactions />} />
            <Route path="categories" element={<Categories />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
        </PeriodProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
