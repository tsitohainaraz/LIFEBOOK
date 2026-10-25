import { describe, expect, it } from 'vitest';
import { extensionOf, findLinks, fitSize, formatBytes, kindOf, storagePath, validateFile } from './fileRules';

const MB = 1024 * 1024;

describe('kindOf et extensionOf', () => {
  it('reconnaît photos, vidéos et documents', () => {
    expect(kindOf({ type: 'image/heic', name: 'a.heic' })).toBe('image');
    expect(kindOf({ type: 'video/mp4', name: 'a.mp4' })).toBe('video');
    expect(kindOf({ type: 'application/pdf', name: 'a.pdf' })).toBe('document');
    expect(kindOf({ type: '', name: 'Rapport.DOCX' })).toBe('document');
    expect(kindOf({ type: 'application/zip', name: 'a.zip' })).toBeNull();
  });
  it('extension en minuscules', () => {
    expect(extensionOf('Photo.JPG')).toBe('jpg');
    expect(extensionOf('sans-extension')).toBe('');
  });
});

describe('validateFile', () => {
  it('refuse une vidéo de plus de 50 Mo avec le message prévu', () => {
    expect(validateFile({ type: 'video/mp4', name: 'v.mp4', size: 51 * MB })).toBe(
      'Vidéo trop lourde (50 Mo max). Envoie plutôt un lien YouTube ou Google Drive.',
    );
    expect(validateFile({ type: 'video/mp4', name: 'v.mp4', size: 49 * MB })).toBeNull();
  });
  it('limite les documents à 20 Mo', () => {
    expect(validateFile({ type: 'application/pdf', name: 'a.pdf', size: 21 * MB })).toMatch(/20 Mo/);
    expect(validateFile({ type: 'application/pdf', name: 'a.pdf', size: 2 * MB })).toBeNull();
  });
  it('refuse les types inconnus', () => {
    expect(validateFile({ type: 'application/x-msdownload', name: 'a.exe', size: 10 })).toMatch(/non pris en charge/);
  });
});

describe('storagePath et fitSize', () => {
  it('range le fichier dans le dossier du tableau', () => {
    expect(storagePath('b1', 'u1', 'JPG')).toBe('b1/u1.jpg');
    expect(storagePath('b1', 'u1', '')).toBe('b1/u1.bin');
  });
  it('réduit à 1600 px en gardant les proportions', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(1200, 3000)).toEqual({ width: 640, height: 1600 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('formatBytes et findLinks', () => {
  it('affiche les tailles en français', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(5.5 * MB)).toBe('5,5 Mo');
  });
  it('trouve les liens collés', () => {
    expect(findLinks('Vidéo : https://youtu.be/abc123. Et https://drive.google.com/x?id=1')).toEqual([
      'https://youtu.be/abc123',
      'https://drive.google.com/x?id=1',
    ]);
  });
});
