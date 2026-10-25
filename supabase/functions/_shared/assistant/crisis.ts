// Détection de détresse, vérifiée AVANT tout appel au modèle (priorité absolue).
// Expressions en français et en malgache ; la comparaison ignore la casse, les accents et l'apostrophe.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PHRASES_FR = [
  'me suicider',
  'suicide',
  'suicidaire',
  'me tuer',
  'mettre fin a mes jours',
  'mettre fin a ma vie',
  'en finir avec la vie',
  'envie d en finir',
  'je veux en finir',
  'je vais en finir',
  'plus envie de vivre',
  'pas envie de vivre',
  'envie de mourir',
  'je veux mourir',
  'je voudrais mourir',
  'je prefere mourir',
  'je veux disparaitre',
  'la vie n a plus de sens',
  'ma vie n a plus de sens',
  'personne ne m aimerait si je',
  'tout le monde serait mieux sans moi',
  'je ne sers a rien',
  'idees noires',
  'me faire du mal',
  'me scarifier',
  'je n en peux plus de vivre',
];

const PHRASES_MG = [
  'hamono tena',
  'hamono ny tenako',
  'te ho faty',
  'te-ho faty',
  'tiako ho faty',
  'aleoko maty',
  'aleo maty',
  'hanapaka ny aiko',
  'hamarana ny aiko',
  'tsy te hiaina intsony',
  'tsy mila miaina intsony',
  'tsy misy dikany ny fiainako',
  'reraka amin ny fiainana',
];

const NEEDLES = [...PHRASES_FR, ...PHRASES_MG].map(normalize);

/** Vrai si le message contient une expression de détresse. */
export function detectDistress(text: string): boolean {
  const t = ` ${normalize(text)} `;
  return NEEDLES.some((n) => t.includes(` ${n} `) || t.includes(` ${n}`));
}

export const CRISIS_REPLY =
  "Je suis vraiment désolée que tu traverses ça. Ce que tu ressens compte, et tu n'as pas à le porter seul·e : " +
  "parle tout de suite à quelqu'un de confiance, un proche, ou à un professionnel de santé. " +
  "Si tu es en danger maintenant, appelle les secours ou va aux urgences les plus proches. Je reste là si tu veux écrire.";
