// Outils de l'assistante, décrits une seule fois, puis convertis aux formats OpenAI et Anthropic.
import type { ToolSpec } from './types.ts';

const date = { type: 'string', description: 'Date AAAA-MM-JJ, prise dans le calendrier fourni.' };
const time = { type: 'string', description: 'Heure HH:MM (24 h).' };
const category = {
  type: 'string',
  enum: ['travail', 'etudes', 'sport', 'spirituel', 'sante', 'famille', 'repos', 'autre'],
};
const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

/** Outils de lecture : exécutés par la fonction elle-même. */
export const READ_TOOLS: ToolSpec[] = [
  {
    name: 'get_free_slots',
    description: "Créneaux libres de l'utilisateur entre deux dates (après le réveil, avant le coucher, hors tâches et éléments fixes).",
    parameters: obj({ from_date: date, to_date: date, min_duration_min: { type: 'integer', minimum: 5, maximum: 600 } }, ['from_date', 'to_date', 'min_duration_min']),
  },
  {
    name: 'get_tasks',
    description: 'Tâches planifiées entre deux dates (avec identifiant, horaires, catégorie, fait ou non).',
    parameters: obj({ from_date: date, to_date: date }, ['from_date', 'to_date']),
  },
  { name: 'get_goals', description: 'Objectifs en cours avec échéance, statut et étapes.', parameters: obj({}, []) },
  {
    name: 'get_history',
    description: 'Résumé des tâches passées : faites, reportées, abandonnées.',
    parameters: obj({ days: { type: 'integer', minimum: 1, maximum: 60 } }, ['days']),
  },
];

/** Outils d'écriture : jamais exécutés par la fonction, renvoyés comme actions proposées après validation. */
export const WRITE_TOOLS: ToolSpec[] = [
  {
    name: 'create_task',
    description: 'Proposer une nouvelle tâche (utilise get_free_slots avant pour trouver un créneau libre).',
    parameters: obj({ title: { type: 'string' }, category, date, start: time, end: time, goal_id: { type: 'string' } }, ['title', 'category', 'date', 'start', 'end']),
  },
  {
    name: 'move_task',
    description: 'Proposer de déplacer une tâche existante (identifiant obtenu par get_tasks).',
    parameters: obj({ task_id: { type: 'string' }, date, start: time, end: time }, ['task_id', 'start', 'end']),
  },
  {
    name: 'resize_task',
    description: "Proposer de changer l'heure de fin d'une tâche.",
    parameters: obj({ task_id: { type: 'string' }, end: time }, ['task_id', 'end']),
  },
  { name: 'delete_task', description: 'Proposer de retirer une tâche.', parameters: obj({ task_id: { type: 'string' } }, ['task_id']) },
  {
    name: 'update_task',
    description: "Proposer de modifier le titre ou la catégorie d'une tâche.",
    parameters: obj({ task_id: { type: 'string' }, title: { type: 'string' }, category }, ['task_id']),
  },
  {
    name: 'plan_day',
    description: 'Proposer le programme complet d’une journée : le planificateur place les éléments dans les créneaux libres.',
    parameters: obj(
      {
        date,
        energy: { type: 'string', enum: ['fatigue', 'normal', 'top'] },
        items: {
          type: 'array',
          items: obj(
            {
              title: { type: 'string' },
              category,
              duration_min: { type: 'integer', minimum: 5, maximum: 480 },
              priority: { type: 'string', enum: ['must', 'should', 'nice'] },
              fixed_time: time,
              goal_id: { type: 'string' },
            },
            ['title', 'category', 'duration_min', 'priority'],
          ),
        },
      },
      ['date', 'items'],
    ),
  },
  {
    name: 'set_day_priorities',
    description: "Proposer l'intention et les 3 priorités d'une journée.",
    parameters: obj({ date, intention: { type: 'string' }, priorities: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, ['date', 'priorities']),
  },
  {
    name: 'create_goal',
    description: 'Proposer un nouvel objectif (vie : target_age ; année, mois, semaine : deadline).',
    parameters: obj(
      {
        title: { type: 'string' },
        domain: { type: 'string', enum: ['sante', 'sport', 'famille', 'relations', 'carriere', 'argent', 'spirituel', 'apprendre', 'voyage', 'loisirs', 'autre'] },
        level: { type: 'string', enum: ['life', 'year', 'month', 'week'] },
        deadline: date,
        target_age: { type: 'integer', minimum: 1, maximum: 120 },
      },
      ['title', 'domain', 'level'],
    ),
  },
  {
    name: 'add_goal_steps',
    description: 'Proposer des étapes pour un objectif existant (identifiant obtenu par get_goals).',
    parameters: obj(
      { goal_id: { type: 'string' }, steps: { type: 'array', items: obj({ title: { type: 'string' }, due_date: date }, ['title']) } },
      ['goal_id', 'steps'],
    ),
  },
  {
    name: 'remember',
    description: "Proposer de retenir une information utile sur l'utilisateur (préférence, contrainte, objectif, santé).",
    parameters: obj({ kind: { type: 'string', enum: ['preference', 'contrainte', 'objectif', 'sante'] }, text: { type: 'string' } }, ['kind', 'text']),
  },
  {
    name: 'signal_crisis',
    description: "À appeler seulement si l'utilisateur semble en détresse ou en danger (idées noires, envie d'en finir…).",
    parameters: obj({}, []),
  },
];

export const ALL_TOOLS: ToolSpec[] = [...READ_TOOLS, ...WRITE_TOOLS];
export const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.name));

/** Format OpenAI / Groq / OpenRouter */
export function toOpenAITools(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** Format Anthropic (Messages API) */
export function toAnthropicTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as { type: 'object'; [key: string]: unknown } }));
}
