// Rapport du jour d'équipe : résumé automatique et texte publié dans la discussion.

export interface SummaryInput {
  me: string;
  /** Jour local AAAA-MM-JJ. */
  day: string;
  /** Convertit un horodatage en jour local (fuseau du profil). */
  dayOf: (iso: string) => string;
  cards: { id: string; title: string; list_id: string; done_at: string | null; archived_at?: string | null }[];
  doneListIds: string[];
  assignedToMe: string[];
  checklist: { id: string; card_id: string; text: string; done_at: string | null; done_by: string | null }[];
  /** Cartes terminées par moi (journal d'activité). */
  doneByMe: { card_id: string; created_at: string }[];
}

export interface AutoSummary {
  checked: string[];
  doneCards: string[];
  inProgress: string[];
  progressPct: number;
  [key: string]: string[] | number;
}

export function buildAutoSummary(i: SummaryInput): AutoSummary {
  const title = new Map(i.cards.map((c) => [c.id, c.title]));
  const checked = i.checklist
    .filter((c) => c.done_by === i.me && c.done_at && i.dayOf(c.done_at) === i.day)
    .map((c) => `${c.text}${title.get(c.card_id) ? ` (${title.get(c.card_id)})` : ''}`);
  const doneIds = new Set(i.doneByMe.filter((a) => i.dayOf(a.created_at) === i.day).map((a) => a.card_id));
  const doneCards = i.cards.filter((c) => doneIds.has(c.id)).map((c) => c.title);
  const mine = new Set(i.assignedToMe);
  const inProgress = i.cards
    .filter((c) => mine.has(c.id) && !c.done_at && !c.archived_at && !i.doneListIds.includes(c.list_id))
    .map((c) => c.title);
  const total = i.checklist.length;
  const ticked = i.checklist.filter((c) => c.done_at).length;
  return { checked, doneCards, inProgress, progressPct: total ? Math.round((ticked / total) * 100) : 0 };
}

/** Texte de première version de « Fait aujourd'hui ». */
export function defaultDoneText(s: AutoSummary): string {
  const lines = [...s.doneCards.map((t) => `Carte terminée : ${t}`), ...s.checked.map((t) => `✓ ${t}`)];
  return lines.join('\n');
}

/** Message de type « report » publié dans la discussion. */
export function reportMessage(r: { progressPct: number; done: string; blockers: string; tomorrow: string }): string {
  const parts = [`Avancement du tableau : ${r.progressPct} %`];
  if (r.done.trim()) parts.push(`Fait aujourd'hui :\n${r.done.trim()}`);
  if (r.blockers.trim()) parts.push(`Bloqué par :\n${r.blockers.trim()}`);
  if (r.tomorrow.trim()) parts.push(`Demain :\n${r.tomorrow.trim()}`);
  return parts.join('\n\n');
}

/** Avancement global de l'équipe : moyenne des rapports envoyés (ou null). */
export function teamProgress(reports: { progress_pct: number | null; posted_at: string | null }[]): number | null {
  const sent = reports.filter((r) => r.posted_at && r.progress_pct != null);
  if (!sent.length) return null;
  return Math.round(sent.reduce((a, r) => a + (r.progress_pct ?? 0), 0) / sent.length);
}
