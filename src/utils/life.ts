// Temps de vie restant : fonctions pures (aucune dépendance au réseau ni à l'horloge implicite).

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export interface LifeParams {
  birthDate: string; // AAAA-MM-JJ
  lifeExpectancy: number; // années
  sleepHours: number; // heures par nuit
  workHours: number; // heures par semaine
  retireAge: number; // années
}

function birthAt(birthDate: string): Date {
  const [y, m, d] = birthDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addYears(d: Date, years: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}

/** Date de fin : naissance + espérance de vie. */
export function lifeEnd(p: Pick<LifeParams, 'birthDate' | 'lifeExpectancy'>): Date {
  return addYears(birthAt(p.birthDate), p.lifeExpectancy);
}

export function ageAt(birthDate: string, now: Date): number {
  const b = birthAt(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  const birthday = new Date(b);
  birthday.setFullYear(now.getFullYear());
  if (now < birthday) age--;
  return age;
}

/** Semaines vécues et restantes, sur une grille de 52 semaines par an. */
export function weeksLivedAndLeft(p: Pick<LifeParams, 'birthDate' | 'lifeExpectancy'>, now: Date) {
  const total = p.lifeExpectancy * 52;
  const lived = Math.min(total, Math.max(0, Math.floor((now.getTime() - birthAt(p.birthDate).getTime()) / WEEK_MS)));
  return { total, lived, left: Math.max(0, total - lived) };
}

/** Jours épuisés depuis la naissance et jours restants jusqu'à la fin. */
export function daysUsedAndLeft(p: Pick<LifeParams, 'birthDate' | 'lifeExpectancy'>, now: Date) {
  const used = Math.max(0, Math.floor((now.getTime() - birthAt(p.birthDate).getTime()) / DAY_MS));
  const left = Math.max(0, Math.ceil((lifeEnd(p).getTime() - now.getTime()) / DAY_MS));
  return { used, left, total: Math.max(1, used + left) };
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Compte à rebours jusqu'à naissance + espérance de vie. */
export function lifeCountdown(p: Pick<LifeParams, 'birthDate' | 'lifeExpectancy'>, now: Date): Countdown {
  let s = Math.max(0, Math.floor((lifeEnd(p).getTime() - now.getTime()) / 1000));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { days, hours, minutes, seconds: s - minutes * 60 };
}

/** Semaines restantes à dormir : semaines restantes × heures de sommeil / 24. */
export function sleepWeeksLeft(weeksLeft: number, sleepHours: number): number {
  return (weeksLeft * sleepHours) / 24;
}

/** Semaines restantes à travailler : semaines jusqu'à la retraite × heures de travail / 168. */
export function workWeeksLeft(p: Pick<LifeParams, 'birthDate' | 'retireAge' | 'workHours'>, now: Date): number {
  const retire = addYears(birthAt(p.birthDate), p.retireAge);
  const weeksToRetire = Math.max(0, (retire.getTime() - now.getTime()) / WEEK_MS);
  return (weeksToRetire * p.workHours) / 168;
}

export interface LifeSummary {
  age: number;
  totalWeeks: number;
  livedWeeks: number;
  leftWeeks: number;
  sleepWeeks: number;
  workWeeks: number;
  /** Temps libre restant : semaines restantes moins sommeil et travail. */
  freeWeeks: number;
  daysUsed: number;
  daysLeft: number;
  yearsLeft: number;
}

export function lifeSummary(p: LifeParams, now: Date): LifeSummary {
  const w = weeksLivedAndLeft(p, now);
  const d = daysUsedAndLeft(p, now);
  const sleepWeeks = sleepWeeksLeft(w.left, p.sleepHours);
  const workWeeks = workWeeksLeft(p, now);
  const age = ageAt(p.birthDate, now);
  return {
    age,
    totalWeeks: w.total,
    livedWeeks: w.lived,
    leftWeeks: w.left,
    sleepWeeks,
    workWeeks,
    freeWeeks: Math.max(0, w.left - sleepWeeks - workWeeks),
    daysUsed: d.used,
    daysLeft: d.left,
    yearsLeft: Math.max(0, p.lifeExpectancy - age),
  };
}
