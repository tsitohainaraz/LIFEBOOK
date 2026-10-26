import { describe, expect, it } from 'vitest';
import {
  buildScript,
  ENERGY_AUTO_ADVANCE_MS,
  fallbackItems,
  freeAnswersForAi,
  guidedPriorities,
  MAX_QUESTIONS,
  mergeItems,
  parseFixed,
  parseTime,
  planningStreak,
  splitFreeText,
  structuredItems,
  type ScriptInput,
} from './script';
import { addDays } from '../../utils/insights';

const base: ScriptInput = {
  isToday: false,
  known: {},
  defaultWake: '06:30',
  mustSuggestions: ['Rapport', 'Rapport', 'Banque'],
  postponed: [],
  urgentGoals: [],
  goalSteps: [{ goalId: 'g1', goalTitle: 'Semi-marathon', title: 'Courir 5 km' }],
  sportWeekMin: 40,
  healthGuard: false,
};

describe('planification guidée : scénario', () => {
  it('6 questions de base, dans l’ordre', () => {
    const q = buildScript(base);
    expect(q.map((x) => x.id)).toEqual(['energy', 'must', 'fixed', 'dream', 'sport', 'wake']);
    expect(q[0].autoAdvanceMs).toBe(ENERGY_AUTO_ADVANCE_MS);
    expect(q[0].autoAdvanceMs).toBe(300);
    expect(q[1].suggestions).toEqual(['Rapport', 'Banque']);
    expect(q[3].steps?.[0].title).toBe('Courir 5 km');
    expect(q[4].hint).toBe('40 min sur 150 cette semaine.');
    expect(q[5].defaultValue).toBe('06:30');
  });

  it('ne demande jamais ce qui est connu', () => {
    const q = buildScript({ ...base, known: { energy: 'top', sportPlanned: true, wake: '07:00' } });
    expect(q.map((x) => x.id)).toEqual(['must', 'fixed', 'dream']);
    expect(buildScript({ ...base, isToday: true }).some((x) => x.id === 'wake')).toBe(false);
  });

  it('questions ajoutées : tâche reportée 3 fois, objectif urgent sans tâche ; 8 au maximum', () => {
    const q = buildScript({
      ...base,
      postponed: [
        { id: 't1', title: 'Déclarer les impôts', count: 4 },
        { id: 't2', title: 'Trier', count: 2 },
      ],
      urgentGoals: [
        { id: 'g2', title: 'Permis', hasTaskThisWeek: true },
        { id: 'g3', title: 'Dossier bourse', hasTaskThisWeek: false },
      ],
    });
    expect(q.map((x) => x.id)).toEqual(['energy', 'must', 'fixed', 'dream', 'sport', 'blocker', 'urgent_goal', 'wake']);
    expect(q.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(q[5].title).toBe('« Déclarer les impôts » a été reporté 4 fois. Qu\'est-ce qui bloque ?');
    expect(q[6].subject?.id).toBe('g3');
  });

  it('garde-fou santé : mouvement doux et renvoi vers un médecin', () => {
    const sport = buildScript({ ...base, healthGuard: true }).find((x) => x.id === 'sport')!;
    expect(sport.options?.map((o) => o.value)).toEqual(['0', '15', '20']);
    expect(sport.hint).toContain('médecin');
  });
});

describe('planification guidée : réponses', () => {
  it('découpe le texte libre et lit les heures', () => {
    expect(splitFreeText('appeler maman, banque et courses\nlire')).toEqual(['Appeler maman', 'Banque', 'Courses', 'Lire']);
    expect(parseTime('dentiste à 14 h')).toBe('14:00');
    expect(parseTime('rdv 9h30')).toBe('09:30');
    expect(parseTime('sans heure')).toBeNull();
    expect(parseFixed('Dentiste à 14 h, banque 16h30')).toEqual([
      { title: 'Dentiste', time: '14:00' },
      { title: 'Banque', time: '16:30' },
    ]);
  });

  it('sans IA : chaque réponse libre devient une tâche d’1 h', () => {
    const items = fallbackItems({ must: 'rapport, appeler maman', fixed: 'dentiste à 14 h', dreamText: 'lire 20 pages' });
    expect(items.map((i) => `${i.title}|${i.duration_min}|${i.priority}|${i.fixed_time ?? ''}`)).toEqual([
      'Rapport|60|must|',
      'Appeler maman|60|must|',
      'Dentiste|60|must|14:00',
      'Lire 20 pages|60|should|',
    ]);
  });

  it('éléments structurés, fusion sans doublon, priorités, réponses pour l’IA', () => {
    const s = structuredItems({
      dreamSteps: [{ goalId: 'g1', title: 'Courir 5 km' }],
      sportMin: 30,
      urgentGoal: { id: 'g3', title: 'Dossier bourse', minutes: 60 },
      blocker: { id: 't1', title: 'Impôts', choice: 'decouper' },
    });
    expect(s.map((i) => `${i.title}|${i.duration_min}`)).toEqual(['Courir 5 km|60', 'Sport|30', 'Avancer : Dossier bourse|60', 'Impôts|30']);
    expect(s[3].key).toBe('task:t1');
    const merged = mergeItems([{ title: 'sport', category: 'sport', duration_min: 45, priority: 'must' }], s);
    expect(merged.length).toBe(4);
    expect(guidedPriorities(merged)).toEqual(['sport', 'Avancer : Dossier bourse', 'Impôts']);
    const q = buildScript(base);
    expect(freeAnswersForAi(q, { must: ' rapport ', fixed: '', dreamText: 'lire' }).map((x) => x.answer)).toEqual(['rapport', 'lire']);
  });

  it('série de jours planifiés', () => {
    const set = new Set(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-23']);
    expect(planningStreak(set, '2026-10-27', addDays)).toBe(3);
    expect(planningStreak(set, '2026-10-28', addDays)).toBe(0);
  });
});
