-- LifeBook : schéma complet
-- À exécuter une seule fois dans Supabase : SQL Editor → New query → coller → Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Fonction updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  birth_date date,
  nationality text,
  status text check (status in ('etudiant', 'travailleur', 'aucun')),
  status_detail text,
  faith text check (faith in ('chretien', 'islam', 'judaisme', 'hindouisme', 'bouddhisme', 'traditionnel', 'autre', 'rien')),
  faith_detail text,
  life_expectancy int not null default 80 check (life_expectancy between 30 and 130),
  sleep_hours numeric not null default 8 check (sleep_hours between 0 and 24),
  work_hours numeric not null default 40 check (work_hours between 0 and 168),
  retire_age int not null default 60 check (retire_age between 0 and 130),
  timezone text not null default 'Indian/Antananarivo',
  health_consent_at timestamptz,
  onboarding_step int not null default 1 check (onboarding_step between 1 and 6),
  onboarding_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- health_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.health_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  height_cm numeric check (height_cm between 50 and 260),
  weight_kg numeric check (weight_kg between 10 and 400),
  systolic int check (systolic between 50 and 300),
  diastolic int check (diastolic between 20 and 200),
  pulse int check (pulse between 20 and 250),
  blood_type text check (blood_type in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
  diabetes text check (diabetes in ('non', 'type1', 'type2', 'prediabete', 'inconnu')),
  conditions text[] not null default '{}',
  other_condition text,
  medications text,
  allergies text,
  activity_level text check (activity_level in ('sedentaire', '1-2', '3-4', '5+')),
  sleep_hours numeric check (sleep_hours between 0 and 24),
  water_l numeric check (water_l between 0 and 20),
  smoking text check (smoking in ('non', 'occasionnel', 'regulier', 'ancien')),
  alcohol text check (alcohol in ('jamais', 'occasionnel', 'hebdomadaire', 'quotidien')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- health_logs
-- ---------------------------------------------------------------------------
create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  systolic int check (systolic between 50 and 300),
  diastolic int check (diastolic between 20 and 200),
  pulse int check (pulse between 20 and 250),
  weight_kg numeric check (weight_kg between 10 and 400),
  sleep_h numeric check (sleep_h between 0 and 24),
  wellbeing_pct int check (wellbeing_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists health_logs_user_logged_idx on public.health_logs (user_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- family_history
-- ---------------------------------------------------------------------------
create table if not exists public.family_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  disease text not null check (disease in ('cancer', 'diabete', 'avc', 'hypertension', 'coeur', 'autre')),
  answer text not null check (answer in ('oui', 'non', 'inconnu')),
  relatives text[] not null default '{}',
  other_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, disease)
);

-- ---------------------------------------------------------------------------
-- goals et goal_steps
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  domain text not null default 'autre' check (domain in ('sante', 'sport', 'famille', 'relations', 'carriere', 'argent', 'spirituel', 'apprendre', 'voyage', 'loisirs', 'autre')),
  level text not null default 'year' check (level in ('life', 'year', 'month', 'week')),
  deadline date,
  target_age int check (target_age between 0 and 130),
  parent_goal_id uuid references public.goals(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_level_idx on public.goals (user_id, level);

create table if not exists public.goal_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goal_steps_goal_idx on public.goal_steps (goal_id);
create index if not exists goal_steps_user_due_idx on public.goal_steps (user_id, due_date);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default 'autre' check (category in ('travail', 'etudes', 'sport', 'spirituel', 'sante', 'famille', 'repos', 'autre')),
  is_priority boolean not null default false,
  done_at timestamptz,
  goal_id uuid references public.goals(id) on delete set null,
  reminder_min int check (reminder_min in (0, 10, 30, 60)),
  recurrence_group uuid,
  postponed_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_date_idx on public.tasks (user_id, date);
create index if not exists tasks_goal_idx on public.tasks (goal_id);
create index if not exists tasks_recurrence_idx on public.tasks (recurrence_group);

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period text not null check (period in ('day', 'week', 'month', 'quarter', 'year')),
  period_start date not null,
  theme text,
  priorities jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, period_start)
);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period text not null check (period in ('day', 'week', 'month', 'year')),
  period_start date not null,
  mood int check (mood between 1 and 5),
  wellbeing_pct int check (wellbeing_pct between 0 and 100),
  wins text,
  lessons text,
  blockers text,
  next text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, period_start)
);

-- ---------------------------------------------------------------------------
-- habits et habit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  days_of_week int[] not null default '{1,2,3,4,5,6,7}' check (days_of_week <@ array[1,2,3,4,5,6,7]),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);
create index if not exists habit_logs_user_date_idx on public.habit_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- life_plan et bucket_items
-- ---------------------------------------------------------------------------
create table if not exists public.life_plan (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  mission text,
  "values" text[] not null default '{}' check (cardinality("values") <= 5),
  wheel jsonb not null default '{}'::jsonb,
  legacy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'health_profiles', 'health_logs', 'family_history', 'goals', 'goal_steps',
    'tasks', 'plans', 'reports', 'habits', 'habit_logs', 'life_plan', 'bucket_items'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS : chaque utilisateur ne voit que ses données
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'health_profiles', 'health_logs', 'family_history', 'goals', 'goal_steps',
    'tasks', 'plans', 'reports', 'habits', 'habit_logs', 'life_plan', 'bucket_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format(
      'create policy "%s_select_own" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t, t
    );
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format(
      'create policy "%s_insert_own" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t, t
    );
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format(
      'create policy "%s_update_own" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t, t
    );
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format(
      'create policy "%s_delete_own" on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'given_name', ''),
    nullif(new.raw_user_meta_data ->> 'family_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    )
  )
  on conflict (id) do nothing;

  insert into public.life_plan (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Suppression du compte par l'utilisateur lui-même
-- (supprime auth.users, donc toutes les tables en cascade)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Non connecté';
  end if;
  delete from storage.objects where bucket_id = 'avatars' and (storage.foldername(name))[1] = uid::text;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage : bucket privé « avatars », un dossier par utilisateur
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
