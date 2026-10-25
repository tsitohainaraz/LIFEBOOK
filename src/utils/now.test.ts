import { describe, expect, it } from 'vitest';
import { freeMinutesBeforeNext, phraseText, pickNow, startsWithInfinitive, taskEnd, type NowTask } from './now';

const D = '2026-10-26';
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m, 0);
let n = 0;
const task = (start: string | null, end: string | null, done = false, date = D, title = 'Tâche'): NowTask => ({
  id: String(++n),
  date,
  title,
  start_time: start,
  end_time: end,
  done_at: done ? '2026-10-26T08:00:00Z' : null,
});

describe('taskEnd', () => {
  it('prend début + 1 h sans heure de fin', () => {
    expect(taskEnd({ start_time: '09:00', end_time: null })).toBe(600);
    expect(taskEnd({ start_time: '09:00', end_time: '08:00' })).toBe(600);
    expect(taskEnd({ start_time: '09:00:00', end_time: '09:30:00' })).toBe(570);
  });
});

describe('pickNow', () => {
  it('now : la tâche en cours', () => {
    const r = pickNow([task('08:00', '10:00'), task('11:00', '12:00')], at(9));
    expect(r.mode).toBe('now');
    expect(r.start).toBe(480);
    expect(r.end).toBe(600);
  });
  it('now compte aussi les tâches en retard', () => {
    const r = pickNow([task('06:00', '07:00'), task('08:00', '10:00')], at(9));
    expect(r.mode).toBe('now');
    expect(r.lateCount).toBe(1);
  });
  it('late : la dernière tâche dont la fin est passée', () => {
    const a = task('06:00', '07:00');
    const b = task('07:00', '08:00');
    const r = pickNow([a, b, task('12:00', '13:00')], at(9));
    expect(r.mode).toBe('late');
    expect(r.task?.id).toBe(b.id);
    expect(r.lateCount).toBe(2);
  });
  it('next : la prochaine tâche', () => {
    const r = pickNow([task('12:00', '13:00'), task('10:00', null)], at(9));
    expect(r.mode).toBe('next');
    expect(r.start).toBe(600);
    expect(freeMinutesBeforeNext(r)).toBe(60);
  });
  it('done : tout est fait', () => {
    expect(pickNow([task('08:00', '09:00', true), task(null, null, true)], at(9)).mode).toBe('done');
  });
  it('free : rien de prévu, ou seulement des tâches sans heure', () => {
    expect(pickNow([], at(9)).mode).toBe('free');
    expect(pickNow([task(null, null)], at(9)).mode).toBe('free');
  });
  it('ignore les tâches d’un autre jour et les tâches faites', () => {
    const r = pickNow([task('08:00', '10:00', false, '2026-10-25'), task('08:00', '10:00', true)], at(9));
    expect(r.mode).toBe('done');
  });
  it('fin par défaut : début + 1 h', () => {
    expect(pickNow([task('08:30', null)], at(9, 20)).mode).toBe('now');
    expect(pickNow([task('08:30', null)], at(9, 31)).mode).toBe('late');
  });
});

describe('phrase', () => {
  it('reconnaît un verbe à l’infinitif', () => {
    expect(startsWithInfinitive('Prier')).toBe(true);
    expect(startsWithInfinitive('Lire 20 pages')).toBe(true);
    expect(startsWithInfinitive('Courir au parc')).toBe(true);
    expect(startsWithInfinitive('Réunion d’équipe')).toBe(false);
    expect(startsWithInfinitive('Le footing')).toBe(false);
  });
  it('construit la phrase « maintenant »', () => {
    expect(phraseText('Prier', 'now')).toBe('Tu devrais être en train de prier maintenant');
    expect(phraseText('Écrire le rapport', 'now')).toBe('Tu devrais être en train d’écrire le rapport maintenant');
    expect(phraseText('Réunion d’équipe', 'now')).toBe('Maintenant, place à : Réunion d’équipe');
  });
  it('construit les phrases de retard et de suite', () => {
    expect(phraseText('Prier', 'late')).toBe('Tu devais prier');
    expect(phraseText('Réunion', 'next')).toBe('À suivre : Réunion');
  });
});
