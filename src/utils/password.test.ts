import { describe, expect, it } from 'vitest';
import { isStrongPassword, passwordChecks, passwordError } from './password';
import { authErrorMessage } from './authErrors';

describe('mot de passe', () => {
  it('majuscule, minuscule, chiffre et 8 caractères', () => {
    expect(isStrongPassword('Lifebook2026')).toBe(true);
    expect(isStrongPassword('lifebook2026')).toBe(false);
    expect(isStrongPassword('LIFEBOOK2026')).toBe(false);
    expect(isStrongPassword('Lifebook')).toBe(false);
    expect(isStrongPassword('Lb2')).toBe(false);
    expect(passwordChecks('ab').map((c) => c.ok)).toEqual([false, false, true, false]);
  });

  it('messages avant l’envoi', () => {
    expect(passwordError('')).toBe('Choisis un mot de passe.');
    expect(passwordError('abcdefgh')).toBe('Mot de passe trop faible : une majuscule (A-Z), un chiffre (0-9).');
    expect(passwordError('Lifebook2026', 'Lifebook2025')).toBe('Les deux mots de passe ne sont pas identiques.');
    expect(passwordError('Lifebook2026', 'Lifebook2026')).toBeNull();
  });

  it('erreurs Supabase traduites', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mail ou mot de passe incorrect.');
    expect(authErrorMessage({ code: 'user_already_exists', message: 'User already registered' })).toContain('existe déjà');
    expect(authErrorMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toContain('Confirme');
    expect(authErrorMessage({ code: 'weak_password', message: 'Password should contain at least one character of each' })).toContain('trop faible');
    expect(authErrorMessage({ code: 'same_password', message: 'New password should be different' })).toContain('différent');
    expect(authErrorMessage({ code: 'otp_expired', message: 'Token has expired' })).toContain('expiré');
  });
});
