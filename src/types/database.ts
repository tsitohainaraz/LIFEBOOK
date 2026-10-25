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
  card_id: string | null;
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

// ---------------------------------------------------------------------------
// Tableaux d'équipe (0002_tableaux.sql)
// ---------------------------------------------------------------------------
export type BoardRole = 'owner' | 'member' | 'viewer';

export type BoardRow = Timestamps & {
  id: string;
  owner_id: string;
  title: string;
  color: string;
  goal_id: string | null;
  archived_at: string | null;
};

export type BoardMemberRow = {
  board_id: string;
  user_id: string;
  role: BoardRole;
  joined_at: string;
};

export type BoardInviteRow = {
  id: string;
  board_id: string;
  token: string;
  role: Exclude<BoardRole, 'owner'>;
  invited_by: string | null;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type ListRow = Timestamps & {
  id: string;
  board_id: string;
  title: string;
  position: number;
  archived_at: string | null;
};

export type CardRow = Timestamps & {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  due_time: string | null;
  done_at: string | null;
  created_by: string | null;
  archived_at: string | null;
};

export type CardMemberRow = { card_id: string; user_id: string };

export type BoardLabelRow = { id: string; board_id: string; name: string; color: string };

export type CardLabelRow = { card_id: string; label_id: string };

export type ChecklistItemRow = {
  id: string;
  card_id: string;
  text: string;
  position: number;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

export type CardCommentRow = {
  id: string;
  card_id: string;
  user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type BoardActivityRow = {
  id: string;
  board_id: string;
  user_id: string | null;
  action: string;
  payload: { [key: string]: Json | undefined };
  created_at: string;
};

/** Vue public.member_profiles : colonnes publiques des personnes qui partagent un tableau. */
export type MemberProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export type InvitePreview = {
  board_title: string;
  board_color: string;
  inviter_first_name: string | null;
  status: 'ok' | 'expired' | 'used';
};

// ---------------------------------------------------------------------------
// Équipe (0003_equipe.sql)
// ---------------------------------------------------------------------------
export type DailyReportRow = {
  id: string;
  board_id: string;
  user_id: string;
  date: string;
  auto_summary: { [key: string]: Json | undefined };
  progress_pct: number | null;
  done_text: string | null;
  blockers_text: string | null;
  tomorrow_text: string | null;
  posted_at: string | null;
  created_at: string;
};

export type MessageKind = 'text' | 'report' | 'system';

export type MessageRow = {
  id: string;
  board_id: string;
  user_id: string | null;
  body: string;
  kind: MessageKind;
  reply_to: string | null;
  report_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type MessageReadRow = { board_id: string; user_id: string; last_read_at: string };

export type AttachmentRow = {
  id: string;
  board_id: string;
  card_id: string | null;
  message_id: string | null;
  report_id: string | null;
  user_id: string;
  path: string;
  mime: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  thumb_path: string | null;
  created_at: string;
};

export type MentionRow = {
  id: string;
  user_id: string;
  board_id: string;
  card_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  board_id: string | null;
  card_id: string | null;
  message_id: string | null;
  actor_id: string | null;
  title: string;
  body: string;
  link: string;
  payload: { [key: string]: Json | undefined };
  read_at: string | null;
  pushed_at: string | null;
  created_at: string;
};

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
      boards: Table<BoardRow, MakeInsert<BoardRow, 'title'>>;
      board_members: Table<BoardMemberRow, MakeInsert<BoardMemberRow, 'board_id' | 'user_id'>>;
      board_invites: Table<BoardInviteRow, MakeInsert<BoardInviteRow, 'board_id' | 'token'>>;
      lists: Table<ListRow, MakeInsert<ListRow, 'board_id' | 'title' | 'position'>>;
      cards: Table<CardRow, MakeInsert<CardRow, 'board_id' | 'list_id' | 'title' | 'position'>>;
      card_members: Table<CardMemberRow, CardMemberRow>;
      board_labels: Table<BoardLabelRow, MakeInsert<BoardLabelRow, 'board_id'>>;
      card_labels: Table<CardLabelRow, CardLabelRow>;
      checklist_items: Table<ChecklistItemRow, MakeInsert<ChecklistItemRow, 'card_id' | 'text'>>;
      card_comments: Table<CardCommentRow, MakeInsert<CardCommentRow, 'card_id' | 'body'>>;
      board_activity: Table<BoardActivityRow, MakeInsert<BoardActivityRow, 'board_id' | 'action'>>;
      daily_reports: Table<DailyReportRow, MakeInsert<DailyReportRow, 'board_id' | 'date'>>;
      messages: Table<MessageRow, MakeInsert<MessageRow, 'board_id'>>;
      message_reads: Table<MessageReadRow, MakeInsert<MessageReadRow, 'board_id'>>;
      attachments: Table<AttachmentRow, MakeInsert<AttachmentRow, 'board_id' | 'path'>>;
      mentions: Table<MentionRow, MakeInsert<MentionRow, 'user_id' | 'board_id'>>;
      notifications: Table<NotificationRow, MakeInsert<NotificationRow, 'user_id' | 'type' | 'title'>>;
    };
    Views: {
      member_profiles: { Row: MemberProfileRow; Relationships: [] };
    };
    Functions: {
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      is_board_member: { Args: { b: string }; Returns: boolean };
      board_role: { Args: { b: string }; Returns: BoardRole | null };
      create_invite: { Args: { b: string; r: Exclude<BoardRole, 'owner'> }; Returns: string };
      accept_invite: { Args: { t: string }; Returns: string };
      get_invite_preview: { Args: { t: string }; Returns: InvitePreview[] };
      board_storage_bytes: { Args: { b: string }; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
