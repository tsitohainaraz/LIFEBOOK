import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Placeholder } from "./pages/Placeholder";
import { AppShell } from './components/AppShell';
import { GuestRoute, OnboardingRoute, ProtectedRoute } from './components/RouteGuards';
import { LoginPage } from './pages/auth/LoginPage';
import { VerifyPage } from './pages/auth/VerifyPage';
import { CallbackPage } from './pages/auth/CallbackPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { HomePage } from './pages/home/HomePage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify" element={<VerifyPage />} />
          </Route>
          <Route path="/auth/callback" element={<CallbackPage />} />
          <Route element={<OnboardingRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="jour" element={<Placeholder title="Ma journée" />} />
              <Route path="semaine" element={<Placeholder title="Ma semaine" />} />
              <Route path="mois" element={<Placeholder title="Mon mois" />} />
              <Route path="annee" element={<Placeholder title="Mon année" />} />
              <Route path="vie" element={<Placeholder title="Ma vie" />} />
              <Route path="precedent" element={<Placeholder title="Programme précédent" />} />
              <Route path="rapport" element={<Placeholder title="Mon rapport" />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
