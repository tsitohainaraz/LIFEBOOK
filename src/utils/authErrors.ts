// Traduction en français des erreurs renvoyées par Supabase Auth.

export interface AuthLikeError {
  message?: string;
  code?: string;
  status?: number;
}

export function authErrorMessage(err: AuthLikeError | null | undefined): string {
  if (!err) return '';
  const code = (err.code ?? '').toLowerCase();
  const msg = (err.message ?? '').toLowerCase();

  if (code === 'otp_expired' || msg.includes('expired')) {
    return 'Code incorrect ou expiré. Vérifie les 6 chiffres ou demande un nouveau code.';
  }
  if (code.includes('rate_limit') || err.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return 'Trop de tentatives. Attends une minute avant de réessayer.';
  }
  if (msg.includes('for security purposes')) {
    return 'Trop de tentatives. Attends une minute avant de réessayer.';
  }
  if (code === 'invalid_otp' || msg.includes('invalid') || msg.includes('token')) {
    return 'Code incorrect. Vérifie les 6 chiffres reçus par e-mail.';
  }
  if (code === 'email_address_invalid' || msg.includes('email address')) {
    return 'Cette adresse e-mail ne semble pas valide.';
  }
  if (code === 'validation_failed' && msg.includes('provider')) {
    return "La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail.";
  }
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider')) {
    return "La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail.";
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Pas de connexion internet. Vérifie ton réseau et réessaie.';
  }
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
