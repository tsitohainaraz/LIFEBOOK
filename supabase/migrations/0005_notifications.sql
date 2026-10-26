-- LifeBook : notifications complètes des tableaux (rejouable).
-- Carte déplacée, nouvelle carte (regroupée), carte terminée, échéance modifiée, retiré d'une carte,
-- carte archivée ou supprimée, changement de rôle, demandes pour rejoindre une carte, réglages par type.

-- ---------------------------------------------------------------------------
-- Réglages : types de notifications coupés par la personne
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  muted text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists set_updated_at on public.notification_prefs;
create trigger set_updated_at before update on public.notification_prefs for each row execute function public.set_updated_at();

create or replace function public.is_notification_muted(u uuid, t text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t = any (p.muted) from public.notification_prefs p where p.user_id = u), false);
$$;
revoke all on function public.is_notification_muted(uuid, text) from public, anon, authenticated;

-- notify() respecte désormais les types coupés (même signature qu'en 0003).
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
  if p_user is null or p_user = p_actor or public.is_notification_muted(p_user, p_type) then
    return;
  end if;
  insert into public.notifications (user_id, type, board_id, card_id, message_id, actor_id, title, body, link, payload)
  values (p_user, p_type, p_board, p_card, p_message, p_actor, p_title, coalesce(p_body, ''), coalesce(p_link, '/'), coalesce(p_payload, '{}'::jsonb));
end;
$$;
revoke all on function public.notify(uuid, text, uuid, uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Lu / non lu : la personne peut remettre read_at à null (droit déjà accordé sur la colonne read_at).
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Cartes : déplacée, terminée, échéance modifiée, archivée
-- ---------------------------------------------------------------------------
-- Personnes concernées par une carte : assignés et créateur.
create or replace function public.card_watchers(c uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.user_id from public.card_members cm where cm.card_id = c
  union
  select k.created_by from public.cards k where k.id = c and k.created_by is not null;
$$;
revoke all on function public.card_watchers(uuid) from public, anon, authenticated;

create or replace function public.notify_card_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  who text := public.display_name(auth.uid());
  link text := '/tableaux/' || new.board_id || '/carte/' || new.id;
  u uuid;
  to_list text;
  due text;
begin
  select * into b from public.boards where id = new.board_id;

  if new.list_id is distinct from old.list_id then
    select l.title into to_list from public.lists l where l.id = new.list_id;
    for u in select public.card_watchers(new.id) loop
      perform public.notify(u, 'card_moved', new.board_id, new.id, null, auth.uid(),
        'Carte déplacée',
        who || ' a déplacé « ' || new.title || ' » vers « ' || coalesce(to_list, '?') || ' » (' || b.title || ')',
        link, jsonb_build_object('to_list', to_list));
    end loop;
  end if;

  if new.done_at is not null and old.done_at is null then
    for u in select public.card_watchers(new.id) loop
      perform public.notify(u, 'card_done', new.board_id, new.id, null, auth.uid(),
        'Carte terminée',
        who || ' a terminé « ' || new.title || ' » (' || b.title || ')', link);
    end loop;
  end if;

  if (new.due_date is distinct from old.due_date or new.due_time is distinct from old.due_time) and new.archived_at is null then
    due := case
      when new.due_date is null then 'sans échéance'
      else to_char(new.due_date, 'DD/MM/YYYY') || coalesce(' à ' || to_char(new.due_time, 'HH24:MI'), '')
    end;
    for u in select cm.user_id from public.card_members cm where cm.card_id = new.id loop
      perform public.notify(u, 'card_due_changed', new.board_id, new.id, null, auth.uid(),
        'Échéance modifiée',
        who || ' a changé l''échéance de « ' || new.title || ' » : ' || due, link,
        jsonb_build_object('due_date', new.due_date, 'due_time', new.due_time));
    end loop;
  end if;

  if new.archived_at is not null and old.archived_at is null then
    for u in select cm.user_id from public.card_members cm where cm.card_id = new.id loop
      perform public.notify(u, 'card_archived', new.board_id, new.id, null, auth.uid(),
        'Carte archivée',
        who || ' a archivé « ' || new.title || ' » (' || b.title || ')', '/tableaux/' || new.board_id);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_card_changes on public.cards;
create trigger notify_card_changes after update of list_id, done_at, due_date, due_time, archived_at on public.cards
  for each row execute function public.notify_card_changes();

-- Nouvelle carte : une seule notification non lue par tableau, mise à jour à chaque nouvelle carte.
create or replace function public.notify_card_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  m record;
  existing public.notifications%rowtype;
  n int;
  actor uuid := coalesce(auth.uid(), new.created_by);
begin
  select * into b from public.boards where id = new.board_id;
  for m in select bm.user_id from public.board_members bm where bm.board_id = new.board_id loop
    continue when m.user_id = actor or public.is_notification_muted(m.user_id, 'card_created');
    select * into existing from public.notifications x
      where x.user_id = m.user_id and x.type = 'card_created' and x.board_id = new.board_id and x.read_at is null
      order by x.created_at desc limit 1;
    if existing.id is null then
      perform public.notify(m.user_id, 'card_created', new.board_id, new.id, null, actor,
        'Nouvelle carte dans « ' || b.title || ' »',
        public.display_name(actor) || ' a ajouté « ' || new.title || ' »',
        '/tableaux/' || new.board_id || '/carte/' || new.id, jsonb_build_object('count', 1));
    else
      n := coalesce((existing.payload ->> 'count')::int, 1) + 1;
      update public.notifications set
        title = n || ' nouvelles cartes dans « ' || b.title || ' »',
        body = 'Dernière : « ' || new.title || ' » par ' || public.display_name(actor),
        card_id = null,
        actor_id = actor,
        link = '/tableaux/' || new.board_id,
        payload = jsonb_build_object('count', n),
        created_at = now()
      where id = existing.id;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_card_created on public.cards;
create trigger notify_card_created after insert on public.cards
  for each row execute function public.notify_card_created();

-- Carte supprimée : prévient les assignés (sauf si tout le tableau est supprimé).
create or replace function public.notify_card_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  u uuid;
begin
  select * into b from public.boards where id = old.board_id;
  if b.id is null then
    return old;
  end if;
  for u in select cm.user_id from public.card_members cm where cm.card_id = old.id loop
    perform public.notify(u, 'card_deleted', old.board_id, null, null, auth.uid(),
      'Carte supprimée',
      public.display_name(auth.uid()) || ' a supprimé « ' || old.title || ' » (' || b.title || ')',
      '/tableaux/' || old.board_id);
  end loop;
  return old;
end;
$$;
drop trigger if exists notify_card_deleted on public.cards;
create trigger notify_card_deleted before delete on public.cards
  for each row execute function public.notify_card_deleted();

-- Retiré d'une carte (pas quand la carte elle-même est supprimée).
create or replace function public.notify_card_unassigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cards%rowtype;
  b public.boards%rowtype;
begin
  select * into c from public.cards where id = old.card_id;
  if c.id is null then
    return old;
  end if;
  select * into b from public.boards where id = c.board_id;
  perform public.notify(old.user_id, 'card_unassigned', c.board_id, c.id, null, auth.uid(),
    'Retiré d''une carte',
    public.display_name(auth.uid()) || ' t''a retiré de « ' || c.title || ' » (' || b.title || ')',
    '/tableaux/' || c.board_id || '/carte/' || c.id);
  return old;
end;
$$;
drop trigger if exists notify_card_unassigned on public.card_members;
create trigger notify_card_unassigned after delete on public.card_members
  for each row execute function public.notify_card_unassigned();

-- Changement de rôle dans un tableau.
create or replace function public.notify_role_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boards%rowtype;
  label text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;
  select * into b from public.boards where id = new.board_id;
  label := case new.role when 'owner' then 'propriétaire' when 'member' then 'membre' else 'lecteur' end;
  perform public.notify(new.user_id, 'role_changed', new.board_id, null, null, auth.uid(),
    'Ton rôle a changé',
    'Tu es maintenant ' || label || ' de « ' || b.title || ' »',
    '/tableaux/' || new.board_id, jsonb_build_object('role', new.role));
  return new;
end;
$$;
drop trigger if exists notify_role_changed on public.board_members;
create trigger notify_role_changed after update of role on public.board_members
  for each row execute function public.notify_role_changed();

-- ---------------------------------------------------------------------------
-- Demandes pour rejoindre une carte
-- ---------------------------------------------------------------------------
create table if not exists public.card_join_requests (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'refused')),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (card_id, user_id)
);
create index if not exists card_join_requests_card_idx on public.card_join_requests (card_id, status);

-- Peut répondre : le créateur de la carte ou un propriétaire du tableau.
create or replace function public.can_answer_card(c uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cards k
    where k.id = c and (k.created_by = auth.uid() or public.board_role(k.board_id) = 'owner')
  );
$$;
revoke all on function public.can_answer_card(uuid) from public, anon;
grant execute on function public.can_answer_card(uuid) to authenticated;

alter table public.card_join_requests enable row level security;
drop policy if exists "card_join_requests_select" on public.card_join_requests;
create policy "card_join_requests_select" on public.card_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.can_answer_card(card_id));
revoke insert, update, delete on public.card_join_requests from anon, authenticated;
grant select on public.card_join_requests to authenticated;

-- « Je veux participer » : crée (ou relance) la demande et prévient le créateur et les propriétaires.
create or replace function public.request_card_join(p_card uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cards%rowtype;
  b public.boards%rowtype;
  rid uuid;
  u uuid;
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  select * into c from public.cards where id = p_card and archived_at is null;
  if c.id is null or not public.is_board_member(c.board_id) then
    raise exception 'Carte introuvable';
  end if;
  if exists (select 1 from public.card_members cm where cm.card_id = p_card and cm.user_id = auth.uid()) then
    raise exception 'Tu participes déjà à cette carte';
  end if;
  select * into b from public.boards where id = c.board_id;

  select id into rid from public.card_join_requests where card_id = p_card and user_id = auth.uid() and status = 'pending';
  if rid is not null then
    return rid;
  end if;
  insert into public.card_join_requests (card_id, board_id, user_id)
  values (p_card, c.board_id, auth.uid())
  on conflict (card_id, user_id) do update
    set status = 'pending', answered_by = null, answered_at = null, created_at = now()
  returning id into rid;

  for u in
    select c.created_by where c.created_by is not null
    union
    select bm.user_id from public.board_members bm where bm.board_id = c.board_id and bm.role = 'owner'
  loop
    perform public.notify(u, 'card_join_request', c.board_id, c.id, null, auth.uid(),
      'Demande pour rejoindre une carte',
      public.display_name(auth.uid()) || ' veut participer à « ' || c.title || ' » (' || b.title || ')',
      '/tableaux/' || c.board_id || '/carte/' || c.id,
      jsonb_build_object('request_id', rid));
  end loop;
  return rid;
end;
$$;

-- Accepter ou refuser : accepter assigne la personne à la carte (elle reçoit « … t'a assigné »).
create or replace function public.answer_card_join(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.card_join_requests%rowtype;
  c public.cards%rowtype;
begin
  select * into r from public.card_join_requests where id = p_request;
  if r.id is null or not public.can_answer_card(r.card_id) then
    raise exception 'Demande introuvable';
  end if;
  if r.status <> 'pending' then
    return;
  end if;
  select * into c from public.cards where id = r.card_id;
  update public.card_join_requests
    set status = case when p_accept then 'accepted' else 'refused' end, answered_by = auth.uid(), answered_at = now()
    where id = p_request;
  if p_accept then
    insert into public.card_members (card_id, user_id) values (r.card_id, r.user_id) on conflict do nothing;
  else
    perform public.notify(r.user_id, 'card_join_answer', c.board_id, c.id, null, auth.uid(),
      'Demande refusée',
      public.display_name(auth.uid()) || ' n''a pas accepté ta demande pour « ' || c.title || ' »',
      '/tableaux/' || c.board_id || '/carte/' || c.id, jsonb_build_object('accepted', false));
  end if;
  -- La demande est traitée : elle passe en « lu » chez toutes les personnes qui pouvaient répondre.
  update public.notifications set read_at = coalesce(read_at, now())
    where type = 'card_join_request' and payload ->> 'request_id' = p_request::text;
end;
$$;

revoke all on function public.request_card_join(uuid) from public, anon;
revoke all on function public.answer_card_join(uuid, boolean) from public, anon;
grant execute on function public.request_card_join(uuid) to authenticated;
grant execute on function public.answer_card_join(uuid, boolean) to authenticated;
