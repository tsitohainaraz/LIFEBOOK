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

-- ---------------------------------------------------------------------------
-- Analyses (agrégats des N derniers jours, pour l'utilisateur connecté ; RLS appliquée)
-- ---------------------------------------------------------------------------
create or replace function public.get_insights(days int default 28)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tz text;
  today date;
  since date;
  monday date;
  consent boolean;
  use_h boolean;
  result jsonb;
begin
  if uid is null then
    raise exception 'Non connecté';
  end if;
  select coalesce(p.timezone, 'Indian/Antananarivo'), p.health_consent_at is not null
    into tz, consent from public.profiles p where p.id = uid;
  tz := coalesce(tz, 'Indian/Antananarivo');
  today := (now() at time zone tz)::date;
  since := today - greatest(1, least(coalesce(days, 28), 90));
  monday := today - (extract(isodow from today)::int - 1);
  select s.use_health into use_h from public.ai_settings s where s.user_id = uid;
  use_h := coalesce(use_h, true);

  with t as (
    select date, start_time, done_at, category, title, postponed_count,
           greatest(5, coalesce(extract(epoch from (end_time - start_time)) / 60, 60))::int as minutes
    from public.tasks
    where user_id = uid and date >= since and date < today
  ),
  r as (
    select case
             when extract(hour from start_time) between 6 and 8 then '06-09'
             when extract(hour from start_time) between 9 and 11 then '09-12'
             when extract(hour from start_time) between 12 and 13 then '12-14'
             when extract(hour from start_time) between 14 and 16 then '14-17'
             when extract(hour from start_time) between 17 and 19 then '17-20'
             when extract(hour from start_time) between 20 and 22 then '20-23'
           end as range, done_at
    from t where start_time is not null
  ),
  sportdays as (
    select distinct date from public.tasks
    where user_id = uid and category = 'sport' and done_at is not null and date >= since and date < today
  ),
  moods as (
    select rp.period_start as date, rp.mood, (sd.date is not null) as sport
    from public.reports rp left join sportdays sd on sd.date = rp.period_start
    where rp.user_id = uid and rp.period = 'day' and rp.mood is not null and rp.period_start >= since and rp.period_start < today
  ),
  hl as (
    select logged_at, systolic, weight_kg, sleep_h, wellbeing_pct from public.health_logs
    where user_id = uid and logged_at >= (since::timestamp at time zone tz)
  ),
  hfirst as (select * from hl where logged_at < ((since + 7)::timestamp at time zone tz)),
  hlast as (select * from hl where logged_at >= ((today - 7)::timestamp at time zone tz))
  select jsonb_build_object(
    'days', today - since,
    'ranges', coalesce((select jsonb_agg(jsonb_build_object('range', x.range, 'planned', x.n, 'done', x.d) order by x.range)
                        from (select range, count(*) as n, count(done_at) as d from r where range is not null group by range) x), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(jsonb_build_object('dow', x.dow, 'planned', x.n, 'done', x.d) order by x.dow)
                          from (select extract(isodow from date)::int as dow, count(*) as n, count(done_at) as d from t group by 1) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', x.date, 'planned_min', x.p, 'done_min', x.d) order by x.date)
                       from (select date, sum(minutes) as p, coalesce(sum(minutes) filter (where done_at is not null), 0) as d
                             from t where start_time is not null group by date) x), '[]'::jsonb),
    'postponed', coalesce((select jsonb_agg(jsonb_build_object('title', x.title, 'count', x.c))
                           from (select title, max(postponed_count) as c from t where postponed_count >= 3 group by title) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'minutes', x.m))
                            from (select category, sum(minutes) as m from t where start_time is not null group by category) x), '[]'::jsonb),
    'wheel', coalesce((select lp.wheel from public.life_plan lp where lp.user_id = uid), '{}'::jsonb),
    'sport_week_min', coalesce((select sum(greatest(5, coalesce(extract(epoch from (k.end_time - k.start_time)) / 60, 60)))::int
                                from public.tasks k where k.user_id = uid and k.category = 'sport' and k.done_at is not null
                                  and k.date >= monday and k.date <= today), 0),
    'health', case when consent and use_h then jsonb_build_object(
        'systolic', jsonb_build_object('first', (select round(avg(systolic)) from hfirst), 'last', (select round(avg(systolic)) from hlast)),
        'weight_kg', jsonb_build_object('first', (select round(avg(weight_kg), 1) from hfirst), 'last', (select round(avg(weight_kg), 1) from hlast)),
        'sleep_h', jsonb_build_object('first', (select round(avg(sleep_h), 1) from hfirst), 'last', (select round(avg(sleep_h), 1) from hlast)),
        'wellbeing_pct', jsonb_build_object('first', (select round(avg(wellbeing_pct)) from hfirst), 'last', (select round(avg(wellbeing_pct)) from hlast))
      ) else null end,
    'mood', jsonb_build_object(
      'with_sport', jsonb_build_object('days', (select count(*) from moods where sport), 'avg', (select round(avg(mood), 2) from moods where sport)),
      'without_sport', jsonb_build_object('days', (select count(*) from moods where not sport), 'avg', (select round(avg(mood), 2) from moods where not sport))
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_insights(int) from public, anon;
grant execute on function public.get_insights(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Phase 7 : intérêt pour l'offre premium et statistiques (sans contenu)
-- ---------------------------------------------------------------------------
create table if not exists public.premium_interest (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.premium_interest enable row level security;
drop policy if exists "premium_interest_select_own" on public.premium_interest;
create policy "premium_interest_select_own" on public.premium_interest for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "premium_interest_insert_own" on public.premium_interest;
create policy "premium_interest_insert_own" on public.premium_interest for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "premium_interest_delete_own" on public.premium_interest;
create policy "premium_interest_delete_own" on public.premium_interest for delete to authenticated using (user_id = (select auth.uid()));

-- Par jour (UTC) et par fournisseur : réponses, utilisateurs actifs, tokens, taux de réponses utiles et d'actions appliquées.
-- Aucun texte de message. Lisible seulement depuis le SQL Editor (aucun droit pour anon et authenticated).
create or replace view public.ai_stats_daily as
select
  (m.created_at at time zone 'UTC')::date as day,
  coalesce(m.provider, 'inconnu') as provider,
  count(*) as messages,
  count(distinct m.user_id) as active_users,
  coalesce(sum(m.input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(m.output_tokens), 0)::bigint as output_tokens,
  round(avg(case when m.feedback = 1 then 1.0 when m.feedback = -1 then 0.0 end), 3) as useful_rate,
  round(avg(a.applied), 3) as applied_rate
from public.ai_messages m
left join lateral (
  select avg(case when x.status in ('accepted', 'auto_applied') then 1.0 when x.status in ('ignored', 'undone') then 0.0 end) as applied
  from public.ai_actions x
  where x.message_id = m.id
) a on true
where m.role = 'assistant'
group by 1, 2;

revoke all on public.ai_stats_daily from public, anon, authenticated;
