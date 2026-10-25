-- LifeBook : assistante de planification
-- Rejouable sans erreur : SQL Editor → New query → coller → Run (même deux fois).
-- Prérequis : 0001_lifebook.sql (0002 et 0003 conseillés : cartes de tableaux dans les créneaux occupés).

-- ---------------------------------------------------------------------------
-- Offre (plan) dans profiles : non modifiable par l'utilisateur
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists plan_until timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'premium'));
  end if;
end;
$$;

-- Rôle de la requête (authenticated, anon, service_role) ; null dans le SQL Editor.
create or replace function public.request_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
$$;

create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.request_role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.plan_until := null;
    elsif new.plan is distinct from old.plan or new.plan_until is distinct from old.plan_until then
      raise exception 'L''offre ne peut pas être modifiée depuis l''application';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_plan on public.profiles;
create trigger protect_profile_plan
  before insert or update on public.profiles
  for each row execute function public.protect_profile_plan();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'premium')),
  ai_messages_per_day int not null check (ai_messages_per_day >= 0),
  features jsonb not null default '{}'::jsonb
);
insert into public.plan_limits (plan, ai_messages_per_day, features) values
  ('free', 30, '{"guided_planning": true, "auto_apply": true}'::jsonb),
  ('premium', 200, '{"guided_planning": true, "auto_apply": true, "weekly_review": true, "life_book": true, "best_model": true}'::jsonb)
on conflict (plan) do update set ai_messages_per_day = excluded.ai_messages_per_day, features = excluded.features;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation' check (char_length(title) <= 120),
  context text not null default 'home' check (context in ('home', 'day', 'week', 'life', 'guided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (char_length(content) <= 12000),
  proposed_actions jsonb not null default '[]'::jsonb,
  applied boolean not null default false,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  feedback smallint check (feedback in (-1, 0, 1)),
  feedback_reason text check (feedback_reason in ('Pas clair', 'Pas adapté à moi', 'Faux', 'Trop long')),
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id, created_at desc);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  inverse jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'ignored', 'auto_applied', 'undone')),
  created_at timestamptz not null default now()
);
create index if not exists ai_actions_message_idx on public.ai_actions (message_id);
create index if not exists ai_actions_user_idx on public.ai_actions (user_id, created_at desc);

create table if not exists public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, date)
);

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preference', 'contrainte', 'objectif', 'sante')),
  text text not null check (char_length(text) between 1 and 500),
  source text not null default 'user' check (source in ('user', 'assistant')),
  created_at timestamptz not null default now()
);
create index if not exists ai_memory_user_idx on public.ai_memory (user_id, created_at desc);

create table if not exists public.ai_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  auto_apply boolean not null default false,
  use_health boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.ai_conversations;
create trigger set_updated_at before update on public.ai_conversations for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.ai_settings;
create trigger set_updated_at before update on public.ai_settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Quota de messages (seule écriture possible dans ai_usage)
-- ---------------------------------------------------------------------------

-- Jour local de la personne (fuseau du profil)
create or replace function public.user_local_date(u uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select p.timezone from public.profiles p where p.id = u), 'Indian/Antananarivo'))::date;
$$;

-- Messages restants aujourd'hui, selon l'offre (plan_until dépassé : retour à l'offre gratuite).
create or replace function public.ai_quota()
returns table (plan text, daily_limit int, used int, remaining int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select case when p.plan = 'premium' and (p.plan_until is null or p.plan_until > now()) then 'premium' else 'free' end as plan
    from public.profiles p where p.id = auth.uid()
  ),
  lim as (
    select me.plan, l.ai_messages_per_day as daily_limit from me join public.plan_limits l on l.plan = me.plan
  )
  select lim.plan, lim.daily_limit,
         coalesce(u.count, 0) as used,
         greatest(lim.daily_limit - coalesce(u.count, 0), 0) as remaining
  from lim
  left join public.ai_usage u on u.user_id = auth.uid() and u.date = public.user_local_date(auth.uid());
$$;

-- Consomme un message ; renvoie false si la limite du jour est atteinte.
create or replace function public.ai_take_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  d date;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  select * into q from public.ai_quota();
  if q is null or q.remaining <= 0 then
    return false;
  end if;
  d := public.user_local_date(auth.uid());
  insert into public.ai_usage (user_id, date, count) values (auth.uid(), d, 1)
  on conflict (user_id, date) do update set count = public.ai_usage.count + 1;
  return true;
end;
$$;

revoke all on function public.ai_quota() from public, anon;
revoke all on function public.ai_take_quota() from public, anon;
revoke all on function public.user_local_date(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota() to authenticated;
grant execute on function public.ai_take_quota() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plan_limits enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_memory enable row level security;
alter table public.ai_settings enable row level security;

drop policy if exists "plan_limits_select" on public.plan_limits;
create policy "plan_limits_select" on public.plan_limits for select to authenticated using (true);
revoke insert, update, delete on public.plan_limits from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_actions', 'ai_memory', 'ai_settings'] loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end;
$$;

-- Un message ne peut appartenir qu'à une de ses propres conversations
drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own" on public.ai_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- ai_usage : lecture seule (écrit par ai_take_quota)
drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from anon, authenticated;
