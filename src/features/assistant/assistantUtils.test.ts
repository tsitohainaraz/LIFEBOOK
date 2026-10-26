import { describe, expect, it } from 'vitest';
import { appliedBanner, countChanges, isAutoApplicable, previewDay, remainingLabel, resolveRefs, type ProposedAction } from './assistantUtils';

const tasks = [
  { id: 'a', title: 'Banque', category: 'autre', date: '2026-10-27', start: '10:00', end: '11:00' },
  { id: 'b', title: 'Réunion', category: 'travail', date: '2026-10-27', start: '14:00', end: '15:00' },
];

describe('assistante', () => {
  it('textes du compteur et du bandeau', () => {
    expect(remainingLabel(28)).toBe('28 messages restants aujourd’hui');
    expect(remainingLabel(1)).toBe('1 message restant aujourd’hui');
    expect(remainingLabel(0)).toBe('Plus de message aujourd’hui');
    expect(appliedBanner(3)).toBe('3 changements appliqués');
    expect(appliedBanner(1)).toBe('1 changement appliqué');
  });

  it('aperçu : nouveau, déplacé, retiré', () => {
    const rows = previewDay(
      tasks,
      [
        { op: 'create', ref: 'n1', task: { title: 'Courir', category: 'sport', date: '2026-10-27', start: '06:30', end: '07:00' } },
        { op: 'move', id: 'a', start: '16:00', end: '17:00' },
        { op: 'delete', id: 'b' },
      ],
      '2026-10-27',
    );
    expect(rows.map((r) => `${r.start} ${r.title} ${r.state}`)).toEqual(['06:30 Courir new', '14:00 Réunion removed', '16:00 Banque moved']);
  });

  it('mode automatique : seulement les tâches ; nombre de changements', () => {
    const a: ProposedAction = { type: 'task_ops', tool: 'move_task', label: 'x', details: [], date: null, ops: [{ op: 'delete', id: 'a' }], inverse: [] };
    const g: ProposedAction = { type: 'remember', tool: 'remember', label: 'x', kind: 'preference', text: 'y' };
    expect(isAutoApplicable(a)).toBe(true);
    expect(isAutoApplicable(g)).toBe(false);
    expect(countChanges([a, g, a])).toBe(2);
  });

  it('références remplacées par les vrais identifiants', () => {
    expect(resolveRefs({ op: 'delete', id: 'new-1' }, new Map([['new-1', 'uuid']]))).toEqual({ op: 'delete', id: 'uuid' });
  });
});
