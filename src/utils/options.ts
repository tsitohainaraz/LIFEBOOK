import type {
  ActivityLevel,
  Alcohol,
  BloodType,
  Diabetes,
  Disease,
  Faith,
  FamilyAnswer,
  LifeStatus,
  Smoking,
} from '../types/database';
import { currentDate } from '../lib/serverTime';

// Listes de choix du profil (maquette 4). La valeur stockée est à gauche, le libellé affiché à droite.

export const NATIONALITIES = [
  'Malgache', 'Française', 'Comorienne', 'Mauricienne', 'Réunionnaise (française)', 'Seychelloise', 'Sud-africaine',
  'Mozambicaine', 'Kényane', 'Tanzanienne', 'Ougandaise', 'Rwandaise', 'Burundaise', 'Congolaise (RDC)',
  'Congolaise (Congo)', 'Camerounaise', 'Gabonaise', 'Ivoirienne', 'Sénégalaise', 'Malienne', 'Burkinabè',
  'Nigérienne', 'Nigériane', 'Ghanéenne', 'Togolaise', 'Béninoise', 'Guinéenne', 'Tchadienne', 'Centrafricaine',
  'Éthiopienne', 'Somalienne', 'Djiboutienne', 'Égyptienne', 'Marocaine', 'Algérienne', 'Tunisienne', 'Libyenne',
  'Soudanaise', 'Angolaise', 'Zambienne', 'Zimbabwéenne', 'Malawite', 'Namibienne', 'Botswanaise', 'Belge', 'Suisse',
  'Canadienne', 'Américaine', 'Britannique', 'Allemande', 'Italienne', 'Espagnole', 'Portugaise', 'Brésilienne',
  'Haïtienne', 'Indienne', 'Chinoise', 'Japonaise', 'Coréenne', 'Libanaise', 'Autre',
];

export const STATUS_OPTIONS: { value: LifeStatus; label: string }[] = [
  { value: 'etudiant', label: 'Étudiant(e)' },
  { value: 'travailleur', label: 'Travailleur(se)' },
  { value: 'aucun', label: 'Aucun des deux' },
];

export const FAITH_OPTIONS: { value: Faith; label: string }[] = [
  { value: 'chretien', label: 'Chrétien(ne)' },
  { value: 'islam', label: 'Islam' },
  { value: 'judaisme', label: 'Judaïsme' },
  { value: 'hindouisme', label: 'Hindouisme' },
  { value: 'bouddhisme', label: 'Bouddhisme' },
  { value: 'traditionnel', label: 'Croyances traditionnelles' },
  { value: 'autre', label: 'Autre' },
  { value: 'rien', label: 'Rien' },
];

export const DIABETES_OPTIONS: { value: Diabetes; label: string }[] = [
  { value: 'non', label: 'Non' },
  { value: 'type1', label: 'Type 1' },
  { value: 'type2', label: 'Type 2' },
  { value: 'prediabete', label: 'Prédiabète' },
  { value: 'inconnu', label: 'Je ne sais pas' },
];

export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'Hypertension', label: 'Hypertension' },
  { value: 'Maladie cardiaque', label: 'Maladie cardiaque' },
  { value: 'Asthme', label: 'Asthme' },
  { value: 'Douleurs de dos', label: 'Douleurs de dos' },
  { value: 'Problèmes articulaires', label: 'Articulations / genoux' },
  { value: 'Drépanocytose', label: 'Drépanocytose' },
  { value: 'Épilepsie', label: 'Épilepsie' },
  { value: 'Anémie', label: 'Anémie' },
  { value: 'Grossesse', label: 'Grossesse' },
  { value: 'Aucun', label: 'Aucun' },
];

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentaire', label: 'Presque aucune' },
  { value: '1-2', label: '1 à 2 fois / sem.' },
  { value: '3-4', label: '3 à 4 fois / sem.' },
  { value: '5+', label: '5 fois ou plus' },
];

export const SMOKING_OPTIONS: { value: Smoking; label: string }[] = [
  { value: 'non', label: 'Non-fumeur' },
  { value: 'occasionnel', label: 'Fumeur occasionnel' },
  { value: 'regulier', label: 'Fumeur régulier' },
  { value: 'ancien', label: 'Ancien fumeur' },
];

export const ALCOHOL_OPTIONS: { value: Alcohol; label: string }[] = [
  { value: 'jamais', label: 'Jamais' },
  { value: 'occasionnel', label: 'Occasionnel' },
  { value: 'hebdomadaire', label: 'Chaque semaine' },
  { value: 'quotidien', label: 'Presque chaque jour' },
];

export const BLOOD_TYPES: { value: BloodType; label: string }[] = [
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O−' },
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A−' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B−' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB−' },
];

export const FAMILY_DISEASES: { value: Exclude<Disease, 'autre'>; question: string; label: string }[] = [
  { value: 'cancer', question: 'Cancer chez un parent ?', label: 'Cancer' },
  { value: 'diabete', question: 'Diabète chez un parent ?', label: 'Diabète' },
  { value: 'avc', question: 'AVC chez un parent ?', label: 'AVC' },
  { value: 'hypertension', question: 'Hypertension chez un parent ?', label: 'Hypertension' },
  { value: 'coeur', question: 'Maladie cardiaque chez un parent ?', label: 'Maladie cardiaque' },
];

export const FAMILY_ANSWERS: { value: FamilyAnswer; label: string }[] = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
  { value: 'inconnu', label: 'Je ne sais pas' },
];

export const RELATIVES: { value: string; label: string }[] = [
  { value: 'père', label: 'Père' },
  { value: 'mère', label: 'Mère' },
  { value: 'frère ou sœur', label: 'Frère / sœur' },
  { value: 'grands-parents', label: 'Grands-parents' },
];

export function labelOf<T extends string>(list: { value: T; label: string }[], value: T | null | undefined): string {
  return list.find((o) => o.value === value)?.label ?? '';
}

/** Âge en années révolues à une date donnée. */
export function ageOn(birth: string, today: Date = currentDate()): number {
  const [y, m, d] = birth.split('-').map(Number);
  let age = today.getFullYear() - y;
  const mm = today.getMonth() + 1;
  if (mm < m || (mm === m && today.getDate() < d)) age--;
  return age;
}

/** Validation de la date de naissance : pas dans le futur, âge entre 10 et 110 ans. */
export function birthDateError(birth: string, today: Date = currentDate()): string {
  if (!birth) return 'Indique ta date de naissance.';
  const [y, m, d] = birth.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return 'Cette date ne semble pas valide.';
  if (date.getTime() > today.getTime()) return 'Cette date est dans le futur.';
  const age = ageOn(birth, today);
  if (age < 10) return 'Il faut avoir au moins 10 ans pour utiliser LifeBook.';
  if (age > 110) return 'Vérifie l’année : l’âge doit être de 110 ans au plus.';
  return '';
}
