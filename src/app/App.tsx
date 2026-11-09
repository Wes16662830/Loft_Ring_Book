import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth/AuthGate.tsx';
import { DataProvider } from '../data/store.tsx';
import { Layout } from './Layout.tsx';
import { LookupPage } from '../features/lookup/LookupPage.tsx';

export function App() {
  return (
    <AuthGate>
      {(backend) => (
        <DataProvider backend={backend}>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<LookupPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DataProvider>
      )}
    </AuthGate>
  );
}
