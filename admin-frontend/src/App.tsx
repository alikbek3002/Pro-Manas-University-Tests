import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAdminAuthStore } from "./store/authStore";

const AdminLogin = lazy(() => import("./pages/Login"));
const AdminLayout = lazy(() => import("./components/layout/AdminLayout"));
const StudentsPage = lazy(() => import("./pages/Dashboard/Students"));
const TestsPage = lazy(() => import("./pages/Dashboard/Tests"));
const BlockedStudentsPage = lazy(() => import("./pages/Dashboard/BlockedStudents"));
const VideosPage = lazy(() => import("./pages/Dashboard/Videos"));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAdmin = useAdminAuthStore((state) => Boolean(state.token));
  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  const isAdmin = useAdminAuthStore((state) => Boolean(state.token));

  return (
    <Router>
      <Suspense
        fallback={(
          <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center text-sm font-medium">
            Загрузка...
          </div>
        )}
      >
        <Routes>
          <Route path="/" element={<Navigate to={isAdmin ? "/dashboard" : "/login"} replace />} />
          <Route path="/login" element={isAdmin ? <Navigate to="/dashboard" replace /> : <AdminLogin />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="students" replace />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="tests" element={<TestsPage />} />
            <Route path="videos" element={<VideosPage />} />
            <Route path="blocked" element={<BlockedStudentsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
