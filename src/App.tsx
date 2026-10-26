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
import { BoardsPage } from './features/boards/BoardsPage';
import { BoardPage } from './features/boards/BoardPage';
import { CardSheet } from './features/boards/CardSheet';
import { InviteGate } from './features/boards/InvitePage';
import { GuidedPage } from './features/guided/GuidedPage';
import { AssistantPage } from './features/assistant/AssistantPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';

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
          <Route path="/invitation/:token" element={<InviteGate />} />
          <Route element={<OnboardingRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/assistante" element={<AssistantPage />} />
            <Route path="/planifier-demain" element={<GuidedPage />} />
            <Route path="/assistante/:conversationId" element={<AssistantPage />} />
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
              <Route path="tableaux" element={<BoardsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="tableaux/:id" element={<BoardPage />}>
                <Route path="carte/:cardId" element={<CardSheet />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
