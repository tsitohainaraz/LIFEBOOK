// Heure de référence de LifeBook : on ne fait confiance ni à l'horloge ni au fuseau du téléphone.
// 1. L'instant exact vient du serveur : chaque réponse HTTP porte l'heure dans son en-tête « Date ».
// 2. L'heure affichée (aujourd'hui, maintenant) est calculée dans le fuseau du profil
//    (Indian/Antananarivo par défaut), pas dans celui réglé sur l'appareil.

const RESYNC_MS = 10 * 60 * 1000;
export const DEFAULT_TIME_ZONE = 'Indian/Antananarivo';

let offsetMs = 0;
let synced = false;
let appTimeZone = DEFAULT_TIME_ZONE;

/**
 * Écart (ms) entre l'heure du serveur et l'horloge locale.
 * `sentAt` et `receivedAt` encadrent la requête ; on suppose le trajet symétrique.
 * L'en-tête Date est à la seconde près : on vise le milieu de cette seconde.
 */
export function computeOffset(dateHeader: string | null, sentAt: number, receivedAt: number): number | null {
  if (!dateHeader) return null;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return null;
  const localMid = (sentAt + receivedAt) / 2;
  return server + 500 - localMid;
}

/** Décalage (ms) d'un fuseau IANA par rapport à UTC à un instant donné (ex. +3 h pour Antananarivo). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Date dont les champs locaux (getHours, getDate…) donnent l'heure murale du fuseau voulu,
 * quel que soit le fuseau réglé sur l'appareil.
 */
export function toZoned(ms: number, timeZone: string = appTimeZone): Date {
  const target = zoneOffsetMs(ms, timeZone);
  const shifted = ms + target;
  // Décalage de l'appareil à l'instant décalé (correct aussi autour d'un changement d'heure).
  const device = -new Date(shifted).getTimezoneOffset() * 60_000;
  return new Date(shifted - device);
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fuseau utilisé pour « aujourd'hui » et « maintenant » (celui du profil). */
export function setAppTimeZone(tz: string | null | undefined): void {
  appTimeZone = isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

export function getAppTimeZone(): string {
  return appTimeZone;
}

/** Instant réel (ms depuis 1970, UTC), corrigé par l'heure du serveur. À utiliser pour enregistrer. */
export function currentMs(): number {
  return Date.now() + offsetMs;
}

/** Horodatage à enregistrer en base (done_at, consent…). */
export function nowISO(): string {
  return new Date(currentMs()).toISOString();
}

/** « Maintenant » pour l'affichage et les calculs du jour : heure exacte, dans le fuseau du profil. */
export function currentDate(): Date {
  return toZoned(currentMs());
}

export function clockOffsetMs(): number {
  return offsetMs;
}

export function isClockSynced(): boolean {
  return synced;
}

/** Demande l'heure au serveur ; en cas d'échec (hors ligne), garde l'écart précédent. */
export async function syncServerTime(timeoutMs = 3000): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const sentAt = Date.now();
    const res = await fetch(`/?horloge=${sentAt}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    const receivedAt = Date.now();
    const off = computeOffset(res.headers.get('date'), sentAt, receivedAt);
    // Une réponse lente (> 5 s) donne une mesure peu fiable : on l'ignore.
    if (off != null && receivedAt - sentAt < 5000) {
      offsetMs = Math.abs(off) < 1500 ? 0 : off;
      synced = true;
    }
  } catch {
    /* hors ligne : on garde l'horloge actuelle */
  } finally {
    clearTimeout(timer);
  }
}

/** Synchronise maintenant, puis toutes les 10 minutes et au retour du réseau. */
export function startServerClock(): Promise<void> {
  setInterval(() => void syncServerTime(), RESYNC_MS);
  window.addEventListener('online', () => void syncServerTime());
  return syncServerTime();
}
