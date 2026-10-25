import { describe, expect, it } from 'vitest';
import { buildAutoSummary, defaultDoneText, reportMessage, teamProgress } from './reportUtils';

const dayOf = (iso: string) => iso.slice(0, 10);

describe('buildAutoSummary', () => {
  const input = {
    me: 'u1',
    day: '2026-10-26',
    dayOf,
    cards: [
      { id: 'c1', title: 'Affiche', list_id: 'todo', done_at: null },
      { id: 'c2', title: 'Budget', list_id: 'done', done_at: '2026-10-26T09:00:00Z' },
      { id: 'c3', title: 'Salle', list_id: 'doing', done_at: null },
    ],
    doneListIds: ['done'],
    assignedToMe: ['c1', 'c2', 'c3'],
    checklist: [
      { id: 'k1', card_id: 'c1', text: 'Logo', done_at: '2026-10-26T08:00:00Z', done_by: 'u1' },
      { id: 'k2', card_id: 'c1', text: 'Texte', done_at: '2026-10-25T08:00:00Z', done_by: 'u1' },
      { id: 'k3', card_id: 'c3', text: 'Devis', done_at: '2026-10-26T08:00:00Z', done_by: 'u2' },
      { id: 'k4', card_id: 'c3', text: 'Visite', done_at: null, done_by: null },
    ],
    doneByMe: [{ card_id: 'c2', created_at: '2026-10-26T09:00:00Z' }],
  };
  it('garde seulement mes coches du jour, mes cartes terminées et en cours', () => {
    const s = buildAutoSummary(input);
    expect(s.checked).toEqual(['Logo (Affiche)']);
    expect(s.doneCards).toEqual(['Budget']);
    expect(s.inProgress).toEqual(['Affiche', 'Salle']);
  });
  it('avancement = éléments cochés / total', () => {
    expect(buildAutoSummary(input).progressPct).toBe(75);
    expect(buildAutoSummary({ ...input, checklist: [] }).progressPct).toBe(0);
  });
  it('propose un texte « Fait aujourd’hui »', () => {
    expect(defaultDoneText(buildAutoSummary(input))).toBe('Carte terminée : Budget\n✓ Logo (Affiche)');
  });
});

describe('reportMessage et teamProgress', () => {
  it('compose le message publié', () => {
    expect(reportMessage({ progressPct: 40, done: 'Logo', blockers: '', tomorrow: 'Imprimer' })).toBe(
      "Avancement du tableau : 40 %\n\nFait aujourd'hui :\nLogo\n\nDemain :\nImprimer",
    );
  });
  it('fait la moyenne des rapports envoyés', () => {
    expect(
      teamProgress([
        { progress_pct: 40, posted_at: 'x' },
        { progress_pct: 60, posted_at: 'x' },
        { progress_pct: 90, posted_at: null },
      ]),
    ).toBe(50);
    expect(teamProgress([])).toBeNull();
  });
});
