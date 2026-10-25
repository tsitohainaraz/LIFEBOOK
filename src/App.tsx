import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { GuestRoute, OnboardingRoute, ProtectedRoute } from './components/RouteGuards';
import { LoginPage } from './pages/auth/LoginPage';
import { VerifyPage } from './pages/auth/VerifyPage';
import { CallbackPage } from './pages/auth/CallbackPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { HomePage } from './pages/home/HomePage';
import { DayPage } from './pages/day/DayPage';
import { WeekPage } from './pages/period/WeekPage';
import { MonthPage } from './pages/period/MonthPage';
import { YearPage } from './pages/period/YearPage';
import { LifePage } from './pages/life/LifePage';
import { PastPage } from './pages/past/PastPage';
import { ReportPage } from './pages/report/ReportPage';
import { HealthPage } from './pages/health/HealthPage';

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
              <Route path="jour" element={<DayPage />} />
              <Route path="semaine" element={<WeekPage />} />
              <Route path="mois" element={<MonthPage />} />
              <Route path="annee" element={<YearPage />} />
              <Route path="vie" element={<LifePage />} />
              <Route path="precedent" element={<PastPage />} />
              <Route path="rapport" element={<ReportPage />} />
              <Route path="sante" element={<HealthPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
