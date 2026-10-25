// Types des tables Supabase, écrits à la main d'après supabase/migrations/0001_lifebook.sql.
// Format compatible avec createClient<Database>().

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Category = 'travail' | 'etudes' | 'sport' | 'spirituel' | 'sante' | 'famille' | 'repos' | 'autre';
export type GoalDomain =
  | 'sante'
  | 'sport'
  | 'famille'
  | 'relations'
  | 'carriere'
  | 'argent'
  | 'spirituel'
  | 'apprendre'
  | 'voyage'
  | 'loisirs'
  | 'autre';
export type GoalLevel = 'life' | 'year' | 'month' | 'week';
export type PlanPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ReportPeriod = 'day' | 'week' | 'month' | 'year';
export type LifeStatus = 'etudiant' | 'travailleur' | 'aucun';
export type Faith =
  | 'chretien'
  | 'islam'
  | 'judaisme'
  | 'hindouisme'
  | 'bouddhisme'
  | 'traditionnel'
  | 'autre'
  | 'rien';
export type Diabetes = 'non' | 'type1' | 'type2' | 'prediabete' | 'inconnu';
export type ActivityLevel = 'sedentaire' | '1-2' | '3-4' | '5+';
export type Smoking = 'non' | 'occasionnel' | 'regulier' | 'ancien';
export type Alcohol = 'jamais' | 'occasionnel' | 'hebdomadaire' | 'quotidien';
export type BloodType = 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-';
export type Disease = 'cancer' | 'diabete' | 'avc' | 'hypertension' | 'coeur' | 'autre';
export type FamilyAnswer = 'oui' | 'non' | 'inconnu';

export type Priority = {
  text: string;
  done: boolean;
}

type Timestamps = {
  created_at: string;
  updated_at: string;
}

export type ProfileRow = Timestamps & {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  nationality: string | null;
  status: LifeStatus | null;
  status_detail: string | null;
  faith: Faith | null;
  faith_detail: string | null;
  life_expectancy: number;
  sleep_hours: number;
  work_hours: number;
  retire_age: number;
  timezone: string;
  health_consent_at: string | null;
  onboarding_step: number;
  onboarding_done_at: string | null;
}

export type HealthProfileRow = Timestamps & {
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  blood_type: BloodType | null;
  diabetes: Diabetes | null;
  conditions: string[];
  other_condition: string | null;
  medications: string | null;
  allergies: string | null;
  activity_level: ActivityLevel | null;
  sleep_hours: number | null;
  water_l: number | null;
  smoking: Smoking | null;
  alcohol: Alcohol | null;
}

export type HealthLogRow = Timestamps & {
  id: string;
  user_id: string;
  logged_at: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  weight_kg: number | null;
  sleep_h: number | null;
  wellbeing_pct: number | null;
}

export type FamilyHistoryRow = Timestamps & {
  id: string;
  user_id: string;
  disease: Disease;
  answer: FamilyAnswer;
  relatives: string[];
  other_text: string | null;
}

export type GoalRow = Timestamps & {
  id: string;
  user_id: string;
  title: string;
  domain: GoalDomain;
  level: GoalLevel;
  deadline: string | null;
  target_age: number | null;
  parent_goal_id: string | null;
  done_at: string | null;
}

export type GoalStepRow = Timestamps & {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  done_at: string | null;
}

export type TaskRow = Timestamps & {
  id: string;
  user_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  category: Category;
  is_priority: boolean;
  done_at: string | null;
  goal_id: string | null;
  reminder_min: number | null;
  recurrence_group: string | null;
  postponed_count: number;
}

export type PlanRow = Timestamps & {
  id: string;
  user_id: string;
  period: PlanPeriod;
  period_start: string;
  theme: string | null;
  priorities: Priority[];
  extra: { [key: string]: Json | undefined };
}

export type ReportRow = Timestamps & {
  id: string;
  user_id: string;
  period: ReportPeriod;
  period_start: string;
  mood: number | null;
  wellbeing_pct: number | null;
  wins: string | null;
  lessons: string | null;
  blockers: string | null;
  next: string | null;
}

export type HabitRow = Timestamps & {
  id: string;
  user_id: string;
  title: string;
  days_of_week: number[];
  archived_at: string | null;
}

export type HabitLogRow = Timestamps & {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
}

export type LifePlanRow = Timestamps & {
  user_id: string;
  mission: string | null;
  values: string[];
  wheel: { [key: string]: number | undefined };
  legacy: string | null;
}

export type BucketItemRow = Timestamps & {
  id: string;
  user_id: string;
  title: string;
  done_at: string | null;
}

// Insert : seules les colonnes obligatoires sans valeur par défaut restent requises.
type MakeInsert<Row, Required extends keyof Row> = Partial<Omit<Row, Required>> & Pick<Row, Required>;
type MakeUpdate<Row> = Partial<Row>;

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: MakeUpdate<Row>;
  Relationships: [];
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, MakeInsert<ProfileRow, 'id'>>;
      health_profiles: Table<HealthProfileRow, Partial<HealthProfileRow>>;
      health_logs: Table<HealthLogRow, Partial<HealthLogRow>>;
      family_history: Table<FamilyHistoryRow, MakeInsert<FamilyHistoryRow, 'disease' | 'answer'>>;
      goals: Table<GoalRow, MakeInsert<GoalRow, 'title'>>;
      goal_steps: Table<GoalStepRow, MakeInsert<GoalStepRow, 'goal_id' | 'title'>>;
      tasks: Table<TaskRow, MakeInsert<TaskRow, 'date' | 'title'>>;
      plans: Table<PlanRow, MakeInsert<PlanRow, 'period' | 'period_start'>>;
      reports: Table<ReportRow, MakeInsert<ReportRow, 'period' | 'period_start'>>;
      habits: Table<HabitRow, MakeInsert<HabitRow, 'title'>>;
      habit_logs: Table<HabitLogRow, MakeInsert<HabitLogRow, 'habit_id' | 'date'>>;
      life_plan: Table<LifePlanRow, Partial<LifePlanRow>>;
      bucket_items: Table<BucketItemRow, MakeInsert<BucketItemRow, 'title'>>;
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
