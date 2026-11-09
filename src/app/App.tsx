import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth/AuthGate.tsx';
import { DataProvider } from '../data/store.tsx';
import { Layout } from './Layout.tsx';
import { LookupPage } from '../features/lookup/LookupPage.tsx';
import { PairingsPage } from '../features/pairings/PairingsPage.tsx';
import { PairDetailPage } from '../features/pairings/PairDetailPage.tsx';
import { PairFormPage } from '../features/pairings/PairFormPage.tsx';
import { BirdPage } from '../features/birds/BirdPage.tsx';
import { BirdFormPage } from '../features/birds/BirdFormPage.tsx';
import { StatsPage } from '../features/stats/StatsPage.tsx';
import { BoxesPage, MorePage, SeasonsPage, SequencesPage } from '../features/settings/SettingsPages.tsx';
import { ImportExportPage } from '../features/importExport/ImportExportPage.tsx';

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
                <Route path="birds/new" element={<BirdFormPage />} />
                <Route path="birds/:id" element={<BirdPage />} />
                <Route path="birds/:id/edit" element={<BirdFormPage key="edit" />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="boxes" element={<BoxesPage />} />
                <Route path="seasons" element={<SeasonsPage />} />
                <Route path="sequences" element={<SequencesPage />} />
                <Route path="import-export" element={<ImportExportPage />} />
                <Route path="*" element={<p className="py-10 text-center">Page not found.</p>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DataProvider>
      )}
    </AuthGate>
  );
}
