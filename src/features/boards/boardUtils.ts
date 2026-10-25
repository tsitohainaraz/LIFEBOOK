// Fonctions pures des tableaux : positions, erreurs, mentions, échéances.

export const POSITION_STEP = 1000;
export const MIN_GAP = 0.0001;

/**
 * Position d'un élément inséré à `index` dans une liste triée de positions (sans l'élément déplacé).
 * Entre deux voisins : la moyenne ; en tête : la moitié du premier ; en fin : le dernier + 1000.
 */
export function positionAt(sorted: number[], index: number): number {
  const prev = index > 0 ? sorted[index - 1] : undefined;
  const next = index < sorted.length ? sorted[index] : undefined;
  if (prev === undefined && next === undefined) return POSITION_STEP;
  if (prev === undefined) return (next as number) / 2;
  if (next === undefined) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** Vrai si deux positions voisines sont trop proches : il faut renuméroter la liste. */
export function needsRenumber(sorted: number[]): boolean {
  if (sorted.length && sorted[0] < MIN_GAP) return true;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < MIN_GAP) return true;
  return false;
}

/** Nouvelles positions 1000, 2000, … dans l'ordre donné. */
export function renumber(ids: string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, (i + 1) * POSITION_STEP]));
}

/**
 * Déplace un élément : renvoie sa nouvelle position et, si besoin, les positions renumérotées
 * de toute la liste cible (élément déplacé compris).
 */
export function planMove<T extends { id: string; position: number }>(
  target: T[],
  movedId: string,
  index: number,
): { position: number; renumbered: Map<string, number> | null } {
  const others = target.filter((x) => x.id !== movedId).sort((a, b) => a.position - b.position);
  const i = Math.max(0, Math.min(index, others.length));
  const position = positionAt(
    others.map((x) => x.position),
    i,
  );
  const after = [...others.slice(0, i).map((x) => x.position), position, ...others.slice(i).map((x) => x.position)];
  if (!needsRenumber(after)) return { position, renumbered: null };
  const ids = [...others.slice(0, i).map((x) => x.id), movedId, ...others.slice(i).map((x) => x.id)];
  const renumbered = renumber(ids);
  return { position: renumbered.get(movedId) as number, renumbered };
}

/** Erreur Supabase « table absente » : les tableaux ne sont pas encore activés (SQL non appliqué). */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202') return true;
  return /could not find the (table|function)|relation .* does not exist/i.test(e.message ?? '');
}

export interface MentionCandidate {
  id: string;
  name: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);

/** Personnes mentionnées (« @Prénom ») dans un texte, parmi les membres. */
export function extractMentions(body: string, members: MentionCandidate[]): string[] {
  const found = new Set<string>();
  for (const m of members) {
    const name = m.name.trim();
    if (!name) continue;
    const re = new RegExp('(^|\\s)@' + escapeRe(name) + '(?=$|[\\s.,;:!?])', 'iu');
    if (re.test(body)) found.add(m.id);
  }
  return [...found];
}

/** Mot en cours de saisie après un « @ » (pour l'autocomplétion), ou null. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{N}_-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

export type DueStatus = 'late' | 'today' | 'soon' | 'ok' | 'done';

/** Statut de l'échéance d'une carte : en retard, aujourd'hui, dans les 2 jours, plus tard, faite. */
export function cardDueStatus(card: { due_date: string | null; done_at: string | null }, today: string): DueStatus | null {
  if (card.done_at) return 'done';
  if (!card.due_date) return null;
  if (card.due_date < today) return 'late';
  if (card.due_date === today) return 'today';
  const [y, m, d] = today.split('-').map(Number);
  const in2 = new Date(y, m - 1, d + 2, 12);
  const lim = `${in2.getFullYear()}-${String(in2.getMonth() + 1).padStart(2, '0')}-${String(in2.getDate()).padStart(2, '0')}`;
  return card.due_date <= lim ? 'soon' : 'ok';
}

/** Lien d'invitation à partager. */
export function inviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/invitation/${encodeURIComponent(token)}`;
}

export const BOARD_COLORS = ['#c6f432', '#7fb2ff', '#b69cff', '#ffb23d', '#ff8fa3', '#6fd3c8'];
