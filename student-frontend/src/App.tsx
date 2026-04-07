import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { setOnUnauthorized } from './lib/api';
import { studentQueryClient } from './lib/queryClient';
import { clearActiveTestSnapshot } from './lib/activeTestStorage';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TestPage = lazy(() => import('./pages/TestPage'));
const MainTestSelectionPage = lazy(() => import('./pages/MainTestSelectionPage'));
const TrialTestSelectionPage = lazy(() => import('./pages/TrialTestSelectionPage'));
const TestHistoryPage = lazy(() => import('./pages/TestHistoryPage'));

const AuthLoadingScreen = () => (
  <div className="min-h-screen bg-white text-stone-500 flex items-center justify-center text-sm font-medium">
    Загрузка...
  </div>
);

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const token = useAuthStore((state) => state.token);
  const student = useAuthStore((state) => state.student);

  if (!hasHydrated) {
    return <AuthLoadingScreen />;
  }

  if (!token || !student) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const token = useAuthStore((state) => state.token);
  const student = useAuthStore((state) => state.student);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = Boolean(token && student);

  useEffect(() => {
    setOnUnauthorized((failedToken) => {
      const currentToken = useAuthStore.getState().token;
      if (currentToken && currentToken !== failedToken) {
        // A newer token exists — a concurrent request already refreshed it.
        // Ignore this stale 401.
        return;
      }
      clearActiveTestSnapshot();
      studentQueryClient.removeQueries({ queryKey: ['student'] });
      logout();
      // Soft redirect — ProtectedRoute will handle the <Navigate to="/login" />.
      // No hard reload needed; this preserves React state and avoids
      // zustand rehydration races on Android.
    });
  }, [logout]);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      studentQueryClient.removeQueries({ queryKey: ['student'] });
    }
  }, [hasHydrated, isAuthenticated]);

  return (
    <BrowserRouter>
      <Suspense
        fallback={<AuthLoadingScreen />}
      >
        <Routes>
          <Route
            path="/login"
            element={!hasHydrated ? <AuthLoadingScreen /> : isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/select/main"
            element={(
              <ProtectedRoute>
                <MainTestSelectionPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/select/trial"
            element={(
              <ProtectedRoute>
                <TrialTestSelectionPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/test/:id"
            element={(
              <ProtectedRoute>
                <TestPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/history"
            element={(
              <ProtectedRoute>
                <TestHistoryPage />
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
