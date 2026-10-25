-- LifeBook : équipe — fichiers, discussion, rapports du jour, notifications
-- Rejouable sans erreur : SQL Editor → New query → coller → Run (même deux fois).
-- Prérequis : 0001_lifebook.sql et 0002_tableaux.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  auto_summary jsonb not null default '{}'::jsonb,
  progress_pct int check (progress_pct between 0 and 100),
  done_text text,
  blockers_text text,
  tomorrow_text text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (board_id, user_id, date)
);
create index if not exists daily_reports_board_date_idx on public.daily_reports (board_id, date);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  kind text not null default 'text' check (kind in ('text', 'report', 'system')),
  reply_to uuid references public.messages(id) on delete set null,
  report_id uuid references public.daily_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists messages_board_created_idx on public.messages (board_id, created_at desc);

create table if not exists public.message_reads (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  report_id uuid references public.daily_reports(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  mime text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  width int,
  height int,
  duration_s numeric,
  thumb_path text,
  created_at timestamptz not null default now()
);
create index if not exists attachments_board_idx on public.attachments (board_id);
create index if not exists attachments_card_idx on public.attachments (card_id);
create index if not exists attachments_message_idx on public.attachments (message_id);
create index if not exists attachments_report_idx on public.attachments (report_id);
create unique index if not exists attachments_path_idx on public.attachments (path);

create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  comment_id uuid references public.card_comments(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists mentions_user_idx on public.mentions (user_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  board_id uuid references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null default '',
  link text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide
-- ---------------------------------------------------------------------------

-- Prénom affichable d'une personne (pour les textes de notification)
create or replace function public.display_name(u uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(p.first_name), ''), 'Quelqu''un') from public.profiles p where p.id = u;
$$;

-- Crée une notification, sauf pour l'auteur de l'action. Usage interne (triggers et cron).
create or replace function public.notify(
  p_user uuid, p_type text, p_board uuid, p_card uuid, p_message uuid, p_actor uuid,
  p_title text, p_body text, p_link text, p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  insert into public.notifications (user_id, type, board_id, card_id, message_id, actor_id, title, body, link, payload)
  values (p_user, p_type, p_board, p_card, p_message, p_actor, p_title, coalesce(p_body, ''), coalesce(p_link, '/'), coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Auteur d'un fichier (pour la suppression dans le Storage)
create or replace function public.attachment_owner(p text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.attachments a where a.path = p or a.thumb_path = p limit 1;
$$;

-- Dossier « board_id » d'un objet Storage, si c'est bien un uuid
create or replace function public.folder_board_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.notify(uuid, text, uuid, uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.display_name(uuid) from public, anon;
revoke all on function public.attachment_owner(text) from public, anon;
grant execute on function public.display_name(uuid) to authenticated;
grant execute on function public.attachment_owner(text) to authenticated;
grant execute on function public.folder_board_id(text) to authenticated;

-- Espace utilisé par les fichiers d'un tableau (owner seulement)
create or replace function public.board_storage_bytes(b uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.board_role(b) is distinct from 'owner' then
    raise exception 'Réservé au propriétaire du tableau';
  end if;
  return coalesce((select sum(a.size_bytes) from public.attachments a where a.board_id = b), 0);
end;
$$;
revoke all on function public.board_storage_bytes(uuid) from public, anon;
grant execute on function public.board_storage_bytes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.daily_reports enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.attachments enable row level security;
alter table public.mentions enable row level security;
alter table public.notifications enable row level security;

-- daily_reports : lus par les membres, écrits par leur auteur
drop policy if exists "daily_reports_select" on public.daily_reports;
create policy "daily_reports_select" on public.daily_reports
  for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "daily_reports_insert" on public.daily_reports;
create policy "daily_reports_insert" on public.daily_reports
  for insert to authenticated with check (user_id = (select auth.uid()) and public.can_edit_board(board_id));
drop policy if exists "daily_reports_update" on public.daily_reports;
create policy "daily_reports_update" on public.daily_reports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_edit_board(board_id));
drop policy if exists "daily_reports_delete" on public.daily_reports;
create policy "daily_reports_delete" on public.daily_reports
  for delete to authenticated using (user_id = (select auth.uid()));

-- messages : lus par les membres ; écrits par owner et member ; modifiés par leur auteur
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and kind in ('text', 'report') and public.can_edit_board(board_id));
drop policy if exists "messages_update_author" on public.messages;
create policy "messages_update_author" on public.messages
  for update to authenticated
  using (user_id = (select auth.uid()) and kind <> 'system')
  with check (user_id = (select auth.uid()) and kind <> 'system');

-- message_reads : chacun gère sa propre ligne
drop policy if exists "message_reads_select" on public.message_reads;
create policy "message_reads_select" on public.message_reads
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "message_reads_insert" on public.message_reads;
create policy "message_reads_insert" on public.message_reads
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_board_member(board_id));
drop policy if exists "message_reads_update" on public.message_reads;
create policy "message_reads_update" on public.message_reads
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- attachments
drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select" on public.attachments
  for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert" on public.attachments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_edit_board(board_id)
    and public.folder_board_id(path) = board_id
    and (card_id is null or public.card_board_id(card_id) = board_id)
  );
drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete" on public.attachments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.board_role(board_id) = 'owner');

-- mentions : visibles par la personne mentionnée ; créées par un membre, pour un membre
drop policy if exists "mentions_select" on public.mentions;
create policy "mentions_select" on public.mentions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mentions_insert" on public.mentions;
create policy "mentions_insert" on public.mentions
  for insert to authenticated
  with check (public.can_edit_board(board_id) and public.is_user_board_member(board_id, user_id));

-- notifications : lecture et « lu » pour le destinataire seulement ; insertions par les fonctions security definer
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Storage : bucket privé « board-files », dossier = board_id
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('board-files', 'board-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "board_files_select" on storage.objects;
create policy "board_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'board-files' and public.is_board_member(public.folder_board_id(name)));
drop policy if exists "board_files_insert" on storage.objects;
create policy "board_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'board-files' and public.can_edit_board(public.folder_board_id(name)));
drop policy if exists "board_files_delete" on storage.objects;
create policy "board_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'board-files'
    and (
      public.attachment_owner(name) = (select auth.uid())
      or public.board_role(public.folder_board_id(name)) = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers de notification (jamais pour l'auteur de l'action)
-- ---------------------------------------------------------------------------

-- Carte assignée
create or replace function public.notify_card_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cards%rowtype;
  b public.boards%rowtype;
begin
  select * into c from public.cards where id = new.card_id;
  select * into b from public.boards where id = c.board_id;
  perform public.notify(
    new.user_id, 'card_assigned', c.board_id, c.id, null, auth.uid(),
    'Nouvelle carte pour toi',
    public.display_name(auth.uid()) || ' t''a assigné « ' || c.title || ' » (' || b.title || ')',
    '/tableaux/' || c.board_id || '/carte/' || c.id
  );
  return new;
end;
$$;
drop trigger if exists notify_card_assigned on public.card_members;
create trigger notify_card_assigned after insert on public.card_members
  for each row execute function public.notify_card_assigned();

-- Commentaire sur une carte où je suis assigné
create or replace function public.notify_card_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cards%rowtype;
  m record;
begin
  select * into c from public.cards where id = new.card_id;
  for m in select cm.user_id from public.card_members cm where cm.card_id = new.card_id loop
    perform public.notify(
      m.user_id, 'card_comment', c.board_id, c.id, null, new.user_id,
      'Commentaire sur « ' || c.title || ' »',
      public.display_name(new.user_id) || ' : ' || left(new.body, 140),
      '/tableaux/' || c.board_id || '/carte/' || c.id
    );
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_card_comment on public.card_comments;
create trigger notify_card_comment after insert on public.card_comments
  for each row execute function public.notify_card_comment();

-- Nouveau message : une seule notification non lue par tableau et par personne, mise à jour à chaque message
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  m record;
  existing uuid;
  v_title text;
  v_body text;
begin
  if new.kind = 'system' then
    return new;
  end if;
  select * into b from public.boards where id = new.board_id;
  v_title := 'Nouveaux messages · ' || b.title;
  v_body := public.display_name(new.user_id) || ' : '
    || case when new.kind = 'report' then 'a envoyé son rapport du jour' else left(coalesce(nullif(new.body, ''), '📎 Fichier joint'), 140) end;
  for m in select bm.user_id from public.board_members bm where bm.board_id = new.board_id and bm.user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) loop
    select n.id into existing from public.notifications n
      where n.user_id = m.user_id and n.board_id = new.board_id and n.type = 'message' and n.read_at is null
      order by n.created_at desc limit 1;
    if existing is not null then
      update public.notifications
        set body = v_body, message_id = new.id, actor_id = new.user_id, created_at = now(), pushed_at = null,
            payload = jsonb_set(payload, '{count}', to_jsonb(coalesce((payload ->> 'count')::int, 1) + 1))
        where id = existing;
    else
      perform public.notify(
        m.user_id, 'message', new.board_id, null, new.id, new.user_id, v_title, v_body,
        '/tableaux/' || new.board_id || '?vue=discussion', jsonb_build_object('count', 1)
      );
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_new_message on public.messages;
create trigger notify_new_message after insert on public.messages
  for each row execute function public.notify_new_message();

-- Mention (dans un commentaire ou un message)
create or replace function public.notify_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  link text;
begin
  select * into b from public.boards where id = new.board_id;
  link := case
    when new.card_id is not null then '/tableaux/' || new.board_id || '/carte/' || new.card_id
    else '/tableaux/' || new.board_id || '?vue=discussion'
  end;
  perform public.notify(
    new.user_id, 'mention', new.board_id, new.card_id, new.message_id, auth.uid(),
    public.display_name(auth.uid()) || ' t''a mentionné',
    'Dans « ' || b.title || ' »',
    link
  );
  return new;
end;
$$;
drop trigger if exists notify_mention on public.mentions;
create trigger notify_mention after insert on public.mentions
  for each row execute function public.notify_mention();

-- Nouveau membre : notification aux membres existants + message système
create or replace function public.notify_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  m record;
begin
  if new.role = 'owner' then
    return new;
  end if;
  select * into b from public.boards where id = new.board_id;
  for m in select bm.user_id from public.board_members bm where bm.board_id = new.board_id and bm.user_id <> new.user_id loop
    perform public.notify(
      m.user_id, 'member_joined', new.board_id, null, null, new.user_id,
      public.display_name(new.user_id) || ' a rejoint « ' || b.title || ' »',
      'Souhaite-lui la bienvenue dans la discussion.',
      '/tableaux/' || new.board_id || '?vue=discussion'
    );
  end loop;
  insert into public.messages (board_id, user_id, body, kind)
  values (new.board_id, new.user_id, public.display_name(new.user_id) || ' a rejoint le tableau', 'system');
  return new;
end;
$$;
drop trigger if exists notify_new_member on public.board_members;
create trigger notify_new_member after insert on public.board_members
  for each row execute function public.notify_new_member();

-- Carte terminée : message système dans la discussion
create or replace function public.system_card_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_at is not null and old.done_at is null then
    insert into public.messages (board_id, user_id, body, kind)
    values (new.board_id, auth.uid(), public.display_name(auth.uid()) || ' a terminé « ' || new.title || ' »', 'system');
  end if;
  return new;
end;
$$;
drop trigger if exists system_card_done on public.cards;
create trigger system_card_done after update of done_at on public.cards
  for each row execute function public.system_card_done();

-- Rapport du jour envoyé : notification à l'owner
create or replace function public.notify_report_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
begin
  if new.posted_at is not null and (tg_op = 'INSERT' or old.posted_at is null) then
    select * into b from public.boards where id = new.board_id;
    perform public.notify(
      b.owner_id, 'report_posted', new.board_id, null, null, new.user_id,
      public.display_name(new.user_id) || ' a envoyé son rapport du jour',
      b.title || coalesce(' · avancement ' || new.progress_pct || ' %', ''),
      '/tableaux/' || new.board_id || '?vue=equipe'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_report_posted on public.daily_reports;
create trigger notify_report_posted after insert or update of posted_at on public.daily_reports
  for each row execute function public.notify_report_posted();

-- ---------------------------------------------------------------------------
-- Rappels programmés (pg_cron, toutes les heures, selon profiles.timezone)
-- ---------------------------------------------------------------------------
create or replace function public.run_hourly_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  -- Échéance demain (heure locale de chaque personne assignée)
  for r in
    select cm.user_id, c.id as card_id, c.board_id, c.title, b.title as board_title,
           (now() at time zone coalesce(p.timezone, 'Indian/Antananarivo'))::date as local_day,
           coalesce(p.timezone, 'Indian/Antananarivo') as tz
    from public.card_members cm
    join public.cards c on c.id = cm.card_id
    join public.boards b on b.id = c.board_id
    left join public.profiles p on p.id = cm.user_id
    where c.done_at is null and c.archived_at is null and c.due_date is not null
      and c.due_date = (now() at time zone coalesce(p.timezone, 'Indian/Antananarivo'))::date + 1
  loop
    if not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id and n.card_id = r.card_id and n.type = 'due_tomorrow'
        and (n.created_at at time zone r.tz)::date = r.local_day
    ) then
      perform public.notify(r.user_id, 'due_tomorrow', r.board_id, r.card_id, null, null,
        'Échéance demain', '« ' || r.title || ' » (' || r.board_title || ')',
        '/tableaux/' || r.board_id || '/carte/' || r.card_id);
    end if;
  end loop;

  -- Échéance dépassée (une fois par jour et par carte)
  for r in
    select cm.user_id, c.id as card_id, c.board_id, c.title, b.title as board_title,
           (now() at time zone coalesce(p.timezone, 'Indian/Antananarivo'))::date as local_day,
           coalesce(p.timezone, 'Indian/Antananarivo') as tz
    from public.card_members cm
    join public.cards c on c.id = cm.card_id
    join public.boards b on b.id = c.board_id
    left join public.profiles p on p.id = cm.user_id
    where c.done_at is null and c.archived_at is null and c.due_date is not null
      and c.due_date < (now() at time zone coalesce(p.timezone, 'Indian/Antananarivo'))::date
  loop
    if not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id and n.card_id = r.card_id and n.type = 'overdue'
        and (n.created_at at time zone r.tz)::date = r.local_day
    ) then
      perform public.notify(r.user_id, 'overdue', r.board_id, r.card_id, null, null,
        'Échéance dépassée', '« ' || r.title || ' » (' || r.board_title || ')',
        '/tableaux/' || r.board_id || '/carte/' || r.card_id);
    end if;
  end loop;

  -- 18:00 heure locale : « Envoie ton rapport du jour »
  for r in
    select bm.user_id, bm.board_id, b.title as board_title,
           (now() at time zone coalesce(p.timezone, 'Indian/Antananarivo'))::date as local_day,
           coalesce(p.timezone, 'Indian/Antananarivo') as tz
    from public.board_members bm
    join public.boards b on b.id = bm.board_id and b.archived_at is null
    left join public.profiles p on p.id = bm.user_id
    where bm.role in ('owner', 'member')
      and extract(hour from now() at time zone coalesce(p.timezone, 'Indian/Antananarivo')) = 18
      and (
        exists (select 1 from public.board_activity a where a.board_id = bm.board_id and a.created_at > now() - interval '7 days')
        or exists (select 1 from public.messages ms where ms.board_id = bm.board_id and ms.created_at > now() - interval '7 days')
      )
  loop
    if not exists (
      select 1 from public.daily_reports d where d.board_id = r.board_id and d.user_id = r.user_id and d.date = r.local_day and d.posted_at is not null
    ) and not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id and n.board_id = r.board_id and n.type = 'report_reminder'
        and (n.created_at at time zone r.tz)::date = r.local_day
    ) then
      perform public.notify(r.user_id, 'report_reminder', r.board_id, null, null, null,
        'Envoie ton rapport du jour', r.board_title || ' : partage ce que tu as fait aujourd''hui.',
        '/tableaux/' || r.board_id || '?vue=equipe&rapport=1');
    end if;
  end loop;
end;
$$;
revoke all on function public.run_hourly_notifications() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  begin
    perform cron.unschedule('lifebook-hourly-notifications');
  exception when others then
    null; -- la tâche n'existait pas encore
  end;
  perform cron.schedule('lifebook-hourly-notifications', '0 * * * *', 'select public.run_hourly_notifications()');
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages', 'notifications', 'daily_reports'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
