import { describe, expect, it } from 'vitest';
import { carryDuration, shouldOfferReplan } from './carry';

const t = (start: string, end: string, done = false) => ({ date: '2026-10-26', start_time: start, end_time: end, done_at: done ? 'x' : null });

describe('report et réorganisation', () => {
  it('durée gardée, 1 h par défaut', () => {
    expect(carryDuration('09:00:00', '09:45:00')).toBe(45);
    expect(carryDuration(null, null)).toBe(60);
  });

  it('propose de réorganiser après 30 min de retard ou 2 reports', () => {
    expect(shouldOfferReplan([t('09:00', '10:00')], '2026-10-26', 10 * 60 + 30, 0)).toBe(false);
    expect(shouldOfferReplan([t('09:00', '10:00')], '2026-10-26', 10 * 60 + 31, 0)).toBe(true);
    expect(shouldOfferReplan([t('09:00', '10:00', true)], '2026-10-26', 12 * 60, 0)).toBe(false);
    expect(shouldOfferReplan([], '2026-10-26', 12 * 60, 2)).toBe(true);
  });
});
