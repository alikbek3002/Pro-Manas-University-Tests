import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const DemoLanguagePage = lazy(() => import('./pages/DemoLanguagePage'));
const DemoTestSelectionPage = lazy(() => import('./pages/DemoTestSelectionPage'));
const DemoTestPage = lazy(() => import('./pages/DemoTestPage'));

function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={(
          <div className="flex min-h-screen items-center justify-center bg-white text-sm font-medium text-stone-500">
            Загрузка...
          </div>
        )}
      >
        <Routes>
          <Route path="/" element={<DemoLanguagePage />} />
          <Route path="/select" element={<DemoTestSelectionPage />} />
          <Route path="/test/:id" element={<DemoTestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
