import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Placeholder } from './pages/Placeholder';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Placeholder title="Connexion" />} />
        <Route path="/verify" element={<Placeholder title="Vérification" />} />
        <Route path="/auth/callback" element={<Placeholder title="Connexion en cours" />} />
        <Route path="/onboarding" element={<Placeholder title="Profil" />} />
        <Route element={<AppShell />}>
          <Route index element={<Placeholder title="Accueil" />} />
          <Route path="jour" element={<Placeholder title="Ma journée" />} />
          <Route path="semaine" element={<Placeholder title="Ma semaine" />} />
          <Route path="mois" element={<Placeholder title="Mon mois" />} />
          <Route path="annee" element={<Placeholder title="Mon année" />} />
          <Route path="vie" element={<Placeholder title="Ma vie" />} />
          <Route path="precedent" element={<Placeholder title="Programme précédent" />} />
          <Route path="rapport" element={<Placeholder title="Mon rapport" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
