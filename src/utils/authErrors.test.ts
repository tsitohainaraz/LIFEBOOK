import { describe, expect, it } from 'vitest';
import { authErrorMessage, isValidEmail } from './authErrors';

describe('authErrorMessage', () => {
  it('traduit un code expiré', () => {
    expect(authErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/expiré/);
  });
  it('traduit trop de tentatives', () => {
    expect(authErrorMessage({ status: 429, message: 'Email rate limit exceeded' })).toMatch(/Trop de tentatives/);
  });
  it('traduit un code incorrect', () => {
    expect(authErrorMessage({ message: 'Invalid token' })).toMatch(/Code incorrect/);
  });
  it('traduit Google non configuré', () => {
    expect(authErrorMessage({ message: 'Unsupported provider: provider is not enabled' })).toMatch(/Google/);
  });
  it('renvoie une chaîne vide sans erreur', () => {
    expect(authErrorMessage(null)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('accepte une adresse correcte', () => {
    expect(isValidEmail('rakoto@exemple.mg')).toBe(true);
  });
  it('refuse une adresse incomplète', () => {
    expect(isValidEmail('rakoto@exemple')).toBe(false);
    expect(isValidEmail('rakoto')).toBe(false);
  });
});
