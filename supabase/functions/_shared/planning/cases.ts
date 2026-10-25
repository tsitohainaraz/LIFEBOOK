// Cas de test du planificateur, exécutés à la fois par Vitest (src/utils/planning.test.ts)
// et par Deno (planning_test.ts) : une seule source pour les deux.
import { getFreeSlots, sleepFromHours } from './freeSlots.ts';
import { computeInsights, EMPTY_AGGREGATES, rangeOf } from './insights.ts';
import { applyOps, describeOp, type PlanTask } from './planOps.ts';
import { proposeDayPlan, splitDuration } from './scheduler.ts';
import { calendar, gaps, mergeIntervals, toMin } from './time.ts';

export interface Case {
  name: string;
  run: () => void;
}

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${e}`);
}
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const SLEEP = { wake: '06:00', bed: '22:30' };
const D = '2026-10-27';

export const cases: Case[] = [
  {
    name: 'temps : calendrier en français, intervalles',
    run: () => {
      const c = calendar('2026-10-26', 14);
      eq(c.length, 14);
      eq(c[0].label, "aujourd'hui, lun. 26 oct. 2026");
      eq(c[1].label, 'demain, mar. 27 oct. 2026');
      eq(c[6].date, '2026-11-01');
      eq(mergeIntervals([{ start: 10, end: 20 }, { start: 15, end: 30 }, { start: 40, end: 50 }]), [{ start: 10, end: 30 }, { start: 40, end: 50 }]);
      eq(gaps({ start: 0, end: 100 }, [{ start: 10, end: 20 }]), [{ start: 0, end: 10 }, { start: 20, end: 100 }]);
    },
  },
  {
    name: 'créneaux libres : réveil, coucher, tâches, éléments fixes, rendez-vous',
    run: () => {
      const slots = getFreeSlots(
        [{ date: D, start: '08:00', end: '12:00' }],
        [{ date: D, start: '13:00', end: '14:00' }],
        SLEEP,
        { start: '21:00', end: '21:15' },
        D,
        D,
        30,
      );
      eq(
        slots.map((s) => `${s.start}-${s.end}`),
        ['06:00-08:00', '12:00-13:00', '14:00-21:00', '21:15-22:30'],
      );
    },
  },
  {
    name: 'créneaux libres : aujourd’hui, rien avant maintenant ; durée minimale',
    run: () => {
      const slots = getFreeSlots([], [], SLEEP, null, D, '2026-10-28', 60, { date: D, minutes: 20 * 60 + 2 });
      eq(slots.map((s) => `${s.date} ${s.start}-${s.end}`), ['2026-10-27 20:05-22:30', '2026-10-28 06:00-22:30']);
      eq(getFreeSlots([{ date: D, start: '06:20', end: '22:00' }], [], SLEEP, null, D, D, 30).length, 1);
    },
  },
  {
    name: 'sommeil : réveil calculé depuis les heures de sommeil',
    run: () => {
      eq(sleepFromHours(8), { wake: '06:30', bed: '22:30' });
      eq(sleepFromHours(7, '23:00'), { wake: '06:00', bed: '23:00' });
    },
  },
  {
    name: 'planificateur : découpe des longues tâches',
    run: () => {
      eq(splitDuration(60), [60]);
      eq(splitDuration(90), [90]);
      eq(splitDuration(120), [40, 40, 40]);
      eq(splitDuration(100), [50, 50]);
      ok(splitDuration(181).every((d) => d >= 25 && d <= 50), 'séances de 25 à 50 min');
    },
  },
  {
    name: 'planificateur : heure fixe, puis must dans la meilleure tranche, should, nice',
    run: () => {
      const p = proposeDayPlan(
        D,
        [
          { title: 'Lecture', category: 'etudes', duration_min: 30, priority: 'nice' },
          { title: 'Banque', category: 'autre', duration_min: 30, priority: 'should', fixed_time: '15:00' },
          { title: 'Rapport', category: 'travail', duration_min: 60, priority: 'must' },
          { title: 'Courses', category: 'autre', duration_min: 45, priority: 'should' },
        ],
        [{ date: D, start: '06:00', end: '07:00' }],
        { bestRanges: ['09-12', '06-09'], sportWeekMin: 200 },
        { sleep: SLEEP },
        'normal',
      );
      const by = Object.fromEntries(p.placed.map((x) => [x.title, `${x.start}-${x.end}`]));
      eq(by['Banque'], '15:00-15:30', 'heure fixe respectée');
      eq(by['Rapport'], '09:00-10:00', 'must dans la meilleure tranche');
      eq(by['Courses'], '10:05-10:50', 'should ensuite, avec 5 min de pause');
      ok(by['Lecture'], 'nice placé');
      eq(p.nonPlaces.length, 0);
      eq(p.ops.length, 4);
    },
  },
  {
    name: 'planificateur : sport ajouté sous 150 min, sauf garde-fou de santé',
    run: () => {
      const a = proposeDayPlan(D, [], [], { sportWeekMin: 40 }, { sleep: SLEEP, sportMinutes: 30 }, 'normal');
      eq(a.placed.map((x) => x.title), ['Sport']);
      const b = proposeDayPlan(D, [], [], { sportWeekMin: 40 }, { sleep: SLEEP, healthGuard: true }, 'normal');
      eq(b.placed.length, 0);
      const c = proposeDayPlan(D, [], [], { sportWeekMin: 160 }, { sleep: SLEEP }, 'normal');
      eq(c.placed.length, 0);
    },
  },
  {
    name: 'planificateur : séances avec pause, charge maximale selon l’énergie, non placés',
    run: () => {
      const p = proposeDayPlan(D, [{ title: 'Mémoire', category: 'etudes', duration_min: 120, priority: 'must' }], [], { bestRanges: ['09-12'], sportWeekMin: 200 }, { sleep: SLEEP }, 'normal');
      eq(p.placed.map((x) => `${x.title} ${x.start}-${x.end}`), ['Mémoire (1/3) 09:00-09:40', 'Mémoire (2/3) 09:50-10:30', 'Mémoire (3/3) 10:40-11:20']);
      const items = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, category: 'travail', duration_min: 60, priority: 'must' as const }));
      const tired = proposeDayPlan(D, items, [], { sportWeekMin: 200 }, { sleep: SLEEP }, 'fatigue');
      eq(tired.loadMin, 7 * 60, 'fatigué : 7 h');
      eq(tired.nonPlaces.length, 3);
      const top = proposeDayPlan(D, items, [], { sportWeekMin: 200 }, { sleep: SLEEP }, 'top');
      eq(top.loadMin, 10 * 60, 'au top : 10 h');
    },
  },
  {
    name: 'planificateur : 15 % de marge et tâches fixes respectées',
    run: () => {
      // 06:00 – 14:00 éveillé = 8 h ; 85 % = 6 h 48
      const p = proposeDayPlan(
        D,
        Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, category: 'travail', duration_min: 60, priority: 'should' as const })),
        [{ date: D, start: '10:00', end: '11:00' }],
        { sportWeekMin: 200 },
        { sleep: { wake: '06:00', bed: '14:00' } },
        'top',
      );
      ok(p.capMin === 408, `capacité ${p.capMin}`);
      ok(p.loadMin <= 408, 'marge gardée');
      ok(p.placed.every((x) => toMin(x.end) <= 10 * 60 - 5 || toMin(x.start) >= 11 * 60 + 5), 'tâche fixe respectée');
    },
  },
  {
    name: 'planificateur : reste de la journée à partir de maintenant',
    run: () => {
      const p = proposeDayPlan(D, [{ title: 'Appel', category: 'travail', duration_min: 30, priority: 'must' }], [], { sportWeekMin: 200 }, { sleep: SLEEP, startMin: 16 * 60 + 2 }, 'normal');
      eq(p.placed[0].start, '16:05', 'pas avant maintenant (arrondi aux 5 min)');
      const late = proposeDayPlan(D, [{ title: 'Appel', category: 'travail', duration_min: 30, priority: 'must' }], [], { bestRanges: ['06-09'], sportWeekMin: 200 }, { sleep: SLEEP, startMin: 16 * 60 + 2 }, 'normal');
      eq(late.placed[0].start, '16:05', 'meilleure tranche passée : premier créneau restant');
    },
  },
  {
    name: 'opérations : création, déplacement, chevauchement, sommeil, annulation',
    run: () => {
      const tasks: PlanTask[] = [{ id: 't1', title: 'Banque', category: 'autre', date: D, start: '10:00', end: '11:00' }];
      const r = applyOps(
        tasks,
        [
          { op: 'create', task: { title: 'Marche rapide', category: 'sport', date: D, start: '06:30', end: '07:00' } },
          { op: 'move', id: 't1', start: '16:00', end: '17:00' },
          { op: 'create', task: { title: 'Conflit', category: 'travail', date: D, start: '16:30', end: '17:30' } },
          { op: 'create', task: { title: 'Nuit', category: 'travail', date: D, start: '23:00', end: '23:30' } },
          { op: 'create', task: { title: 'Bizarre', category: 'inconnue', date: D, start: '12:00', end: '12:30' } },
          { op: 'create', task: { title: 'Hors calendrier', category: 'autre', date: '2027-01-01', start: '12:00', end: '12:30' } },
        ],
        { sleep: SLEEP, allowedDates: [D] },
      );
      eq(r.ok, false);
      eq(r.errors.length, 4);
      ok(r.errors[0].includes('chevauche « Banque »'), r.errors[0]);
      ok(r.errors[1].includes('sommeil'), r.errors[1]);
      ok(r.errors[2].includes('Catégorie inconnue'), r.errors[2]);
      ok(r.errors[3].includes('hors du calendrier'), r.errors[3]);
      eq(r.tasks.find((t) => t.id === 't1')?.start, '16:00');
      // Annulation : retour exact à l'état initial
      const undo = applyOps(r.tasks, r.inverse, { sleep: SLEEP });
      eq(undo.ok, true);
      eq(undo.tasks, tasks);
    },
  },
  {
    name: 'opérations : suppression, modification et leur annulation ; textes lisibles',
    run: () => {
      const tasks: PlanTask[] = [{ id: 't1', title: 'Banque', category: 'autre', date: D, start: '10:00', end: '11:00', goal_id: null }];
      const r = applyOps(tasks, [{ op: 'update', id: 't1', fields: { title: 'Banque BNI' } }, { op: 'resize', id: 't1', end: '11:30' }]);
      eq(r.tasks[0].title, 'Banque BNI');
      eq(r.tasks[0].end, '11:30');
      eq(applyOps(r.tasks, r.inverse).tasks, tasks);
      const d = applyOps(tasks, [{ op: 'delete', id: 't1' }]);
      eq(d.tasks.length, 0);
      eq(applyOps(d.tasks, d.inverse).tasks.map((t) => t.title), ['Banque']);
      eq(describeOp({ op: 'create', task: { title: 'Marche rapide', category: 'sport', date: '2026-10-28', start: '06:30', end: '07:00' } }, tasks), 'Ajouter : Marche rapide · mer. 28 oct. 2026 · 06:30 – 07:00');
      eq(describeOp({ op: 'move', id: 't1', start: '16:00', end: '17:00' }, tasks), 'Déplacer : Banque → 16:00');
    },
  },
  {
    name: 'analyses : meilleures tranches, surcharge, reports, sport, humeur',
    run: () => {
      const i = computeInsights({
        ...EMPTY_AGGREGATES,
        ranges: [
          { range: '06-09', planned: 10, done: 9 },
          { range: '14-17', planned: 10, done: 3 },
          { range: '20-23', planned: 2, done: 0 },
        ],
        weekdays: [
          { dow: 1, planned: 8, done: 7 },
          { dow: 5, planned: 8, done: 2 },
        ],
        daily: [
          { date: '2026-10-20', planned_min: 600, done_min: 240 },
          { date: '2026-10-21', planned_min: 540, done_min: 300 },
          { date: '2026-10-22', planned_min: 600, done_min: 300 },
        ],
        postponed: [{ title: 'Ranger le bureau', count: 4 }],
        sport_week_min: 40,
        mood: { with_sport: { days: 6, avg: 4.2 }, without_sport: { days: 8, avg: 3.1 } },
      });
      eq(i.bestRanges, ['06-09', '14-17'], 'tranches avec au moins 3 tâches');
      eq(i.worstRange, '14-17');
      ok(i.sentences.some((s) => s.includes('entre 06 h et 09 h')), 'meilleure tranche');
      ok(i.sentences.some((s) => s.includes('lundi') && s.includes('vendredi')), 'jours');
      ok(i.sentences.some((s) => s.includes('surchargées')), 'surcharge');
      ok(i.sentences.some((s) => s.includes('Ranger le bureau')), 'reports');
      ok(i.sentences.some((s) => s.includes('40 min de sport')), 'sport');
      ok(i.sentences.some((s) => s.includes('humeur est meilleure')), 'humeur');
      eq(rangeOf(7 * 60), '06-09');
      eq(rangeOf(23 * 60 + 30), null);
    },
  },
];
