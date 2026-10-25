// Adresse en attente de vérification, gardée le temps de la session de l'onglet.
const KEY = 'lifebook.pendingEmail';

export function savePendingEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    /* stockage indisponible : l'adresse reste dans l'état de navigation */
  }
}

export function readPendingEmail(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearPendingEmail(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* rien à faire */
  }
}
