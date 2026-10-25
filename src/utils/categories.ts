import type { Category, GoalDomain } from '../types/database';

export const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: 'travail', label: 'Travail', color: '#7fb2ff' },
  { key: 'etudes', label: 'Études', color: '#b69cff' },
  { key: 'sport', label: 'Sport', color: '#c6f432' },
  { key: 'spirituel', label: 'Spirituel', color: '#ffd166' },
  { key: 'sante', label: 'Santé', color: '#ff8fa3' },
  { key: 'famille', label: 'Famille', color: '#ffb23d' },
  { key: 'repos', label: 'Repos', color: '#6fd3c8' },
  { key: 'autre', label: 'Autre', color: '#a3ad9b' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<Category, string>;
export const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.color])) as Record<Category, string>;

export const DOMAINS: { key: GoalDomain; label: string; color: string }[] = [
  { key: 'sante', label: 'Santé', color: '#ff8fa3' },
  { key: 'sport', label: 'Sport', color: '#c6f432' },
  { key: 'famille', label: 'Famille', color: '#ffb23d' },
  { key: 'relations', label: 'Amis et couple', color: '#ff9f6e' },
  { key: 'carriere', label: 'Carrière', color: '#7fb2ff' },
  { key: 'argent', label: 'Argent', color: '#ffd166' },
  { key: 'spirituel', label: 'Spirituel', color: '#e6c7ff' },
  { key: 'apprendre', label: 'Apprendre', color: '#b69cff' },
  { key: 'voyage', label: 'Voyage', color: '#6fd3c8' },
  { key: 'loisirs', label: 'Loisirs', color: '#5fc9b0' },
  { key: 'autre', label: 'Autre', color: '#a3ad9b' },
];

export const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.key, d.label])) as Record<GoalDomain, string>;
export const DOMAIN_COLOR = Object.fromEntries(DOMAINS.map((d) => [d.key, d.color])) as Record<GoalDomain, string>;

/** Les 8 domaines de la roue de la vie (maquette E). */
export const WHEEL_DOMAINS: { key: string; label: string; color: string }[] = [
  { key: 'sante', label: 'Santé', color: '#ff8fa3' },
  { key: 'famille', label: 'Famille', color: '#ffb23d' },
  { key: 'relations', label: 'Amis et couple', color: '#ff9f6e' },
  { key: 'carriere', label: 'Carrière', color: '#7fb2ff' },
  { key: 'argent', label: 'Argent', color: '#ffd166' },
  { key: 'apprendre', label: 'Apprendre', color: '#b69cff' },
  { key: 'spirituel', label: 'Spirituel', color: '#e6c7ff' },
  { key: 'loisirs', label: 'Loisirs', color: '#6fd3c8' },
];

export const VALUES = [
  'Famille', 'Foi', 'Liberté', 'Santé', 'Honnêteté', 'Courage', 'Discipline', 'Générosité', 'Respect',
  'Créativité', 'Excellence', 'Aventure', 'Sagesse', 'Justice', 'Paix', 'Réussite', 'Humilité', 'Partage',
];
