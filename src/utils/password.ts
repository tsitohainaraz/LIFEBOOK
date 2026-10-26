// Règles du mot de passe : au moins 8 caractères, une majuscule, une minuscule et un chiffre.

export const PASSWORD_MIN = 8;

export interface PasswordCheck {
  key: 'length' | 'upper' | 'lower' | 'digit';
  label: string;
  ok: boolean;
}

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { key: 'length', label: `Au moins ${PASSWORD_MIN} caractères`, ok: pw.length >= PASSWORD_MIN },
    { key: 'upper', label: 'Une majuscule (A-Z)', ok: /[A-Z]/.test(pw) },
    { key: 'lower', label: 'Une minuscule (a-z)', ok: /[a-z]/.test(pw) },
    { key: 'digit', label: 'Un chiffre (0-9)', ok: /[0-9]/.test(pw) },
  ];
}

export function isStrongPassword(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.ok);
}

/** Message à afficher avant l'envoi, ou null si tout est bon. */
export function passwordError(pw: string, confirm?: string): string | null {
  if (!pw) return 'Choisis un mot de passe.';
  const missing = passwordChecks(pw).filter((c) => !c.ok);
  if (missing.length) return `Mot de passe trop faible : ${missing.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join(', ')}.`;
  if (confirm !== undefined && confirm !== pw) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}
