import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Auth from './pages/Auth';
import AdminPage from './pages/AdminPage';
import ClientDashboard from './pages/ClientDashboard';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminGuard from './components/Admin/AdminGuard.tsx';

const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return children;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />

          {/* Admin route: requires auth + admin role */}
          <Route
            path="/admin/*"
            element={
              <RequireAuth>
                <AdminGuard>
                  <AdminPage />
                </AdminGuard>
              </RequireAuth>
            }
          />

          {/* Client dashboard: requires auth (membership checks are enforced server-side) */}
          <Route
            path="/client"
            element={
              <RequireAuth>
                <ClientDashboard />
              </RequireAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;