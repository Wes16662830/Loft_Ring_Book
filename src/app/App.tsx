import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth/AuthGate.tsx';
import { DataProvider } from '../data/store.tsx';
import { Layout } from './Layout.tsx';
import { LookupPage } from '../features/lookup/LookupPage.tsx';
import { PairingsPage } from '../features/pairings/PairingsPage.tsx';
import { PairDetailPage } from '../features/pairings/PairDetailPage.tsx';
import { PairFormPage } from '../features/pairings/PairFormPage.tsx';

export function App() {
  return (
    <AuthGate>
      {(backend) => (
        <DataProvider backend={backend}>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<LookupPage />} />
                <Route path="pairings" element={<PairingsPage />} />
                <Route path="pairings/new" element={<PairFormPage />} />
                <Route path="pairings/:id" element={<PairDetailPage />} />
                <Route path="pairings/:id/edit" element={<PairFormPage key="edit" />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DataProvider>
      )}
    </AuthGate>
  );
}
