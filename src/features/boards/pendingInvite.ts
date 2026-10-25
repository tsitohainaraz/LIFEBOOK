// Jeton d'invitation gardé pendant la connexion et la création du profil (onglet en cours seulement).
const KEY = 'lifebook.pendingInvite';

export function savePendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* stockage indisponible : la personne devra rouvrir le lien après la connexion */
  }
}

export function readPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* rien à faire */
  }
}

/** Traduction des erreurs de accept_invite. */
export function inviteErrorMessage(message: string | undefined): string {
  if (!message) return "L'invitation n'a pas pu être acceptée. Réessaie.";
  if (message.includes('invitation_expiree')) return 'Cette invitation a expiré. Demande un nouveau lien à la personne qui t’a invité.';
  if (message.includes('invitation_utilisee')) return 'Cette invitation a déjà été utilisée par quelqu’un d’autre. Demande un nouveau lien.';
  if (message.includes('invitation_introuvable')) return 'Invitation introuvable. Vérifie le lien reçu.';
  return "L'invitation n'a pas pu être acceptée. Réessaie.";
}
