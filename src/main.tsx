import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigError } from './components/ConfigError';
import { startServerClock } from './lib/serverTime';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const root = createRoot(document.getElementById('root')!);
const missing = [
  !import.meta.env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter((v): v is string => !!v);

if (missing.length) {
  // Sans configuration Supabase, l'application ne peut pas démarrer : on l'explique au lieu d'un écran vide.
  root.render(<ConfigError missing={missing} />);
} else {
  // L'heure du téléphone peut être fausse : on prend celle du serveur avant le premier affichage.
  void Promise.all([import('./App'), startServerClock()]).then(([{ App }]) =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>,
    ),
  );
}
