-- LifeBook : tableaux d'équipe (« super Trello »)
-- Rejouable sans erreur : SQL Editor → New query → coller → Run (même deux fois).
-- Prérequis : 0001_lifebook.sql (fonction public.set_updated_at, tables goals et tasks).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  color text not null default '#c6f432' check (color ~ '^#[0-9a-fA-F]{6}$'),
  goal_id uuid references public.goals(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists boards_owner_idx on public.boards (owner_id);

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists board_members_user_idx on public.board_members (user_id);

create table if not exists public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  token text unique not null,
  role text not null default 'member' check (role in ('member', 'viewer')),
  invited_by uuid default auth.uid() references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists board_invites_board_idx on public.board_invites (board_id);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  position numeric not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lists_board_idx on public.lists (board_id, position);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  position numeric not null,
  due_date date,
  due_time time,
  done_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_board_list_position_idx on public.cards (board_id, list_id, position);
create index if not exists cards_due_idx on public.cards (due_date);

create table if not exists public.card_members (
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (card_id, user_id)
);
create index if not exists card_members_user_idx on public.card_members (user_id);

create table if not exists public.board_labels (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  color text not null default '#7fb2ff' check (color ~ '^#[0-9a-fA-F]{6}$')
);
create index if not exists board_labels_board_idx on public.board_labels (board_id);

create table if not exists public.card_labels (
  card_id uuid not null references public.cards(id) on delete cascade,
  label_id uuid not null references public.board_labels(id) on delete cascade,
  primary key (card_id, label_id)
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  position numeric not null default 1000,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_card_idx on public.checklist_items (card_id, position);

create table if not exists public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at);

create table if not exists public.board_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists board_activity_board_idx on public.board_activity (board_id, created_at desc);
create index if not exists board_activity_card_idx on public.board_activity ((payload ->> 'card_id'));

alter table public.tasks add column if not exists card_id uuid references public.cards(id) on delete set null;
create index if not exists tasks_card_idx on public.tasks (card_id);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (security definer : évitent la récursion des politiques)
-- ---------------------------------------------------------------------------
create or replace function public.is_board_member(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.board_members m where m.board_id = b and m.user_id = auth.uid()
  );
$$;

create or replace function public.board_role(b uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.board_members m where m.board_id = b and m.user_id = auth.uid();
$$;

-- owner ou member : peut modifier le contenu du tableau
create or replace function public.can_edit_board(b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.board_role(b) in ('owner', 'member'), false);
$$;

create or replace function public.is_user_board_member(b uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.board_members m where m.board_id = b and m.user_id = u);
$$;

create or replace function public.card_board_id(c uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select k.board_id from public.cards k where k.id = c;
$$;

create or replace function public.label_board_id(l uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x.board_id from public.board_labels x where x.id = l;
$$;

-- Vrai si la personne connectée partage au moins un tableau avec u (ou si u est elle-même)
create or replace function public.shares_board_with(u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select u = auth.uid() or exists (
    select 1
    from public.board_members a
    join public.board_members b on b.board_id = a.board_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

revoke all on function public.is_board_member(uuid) from public, anon;
revoke all on function public.board_role(uuid) from public, anon;
revoke all on function public.can_edit_board(uuid) from public, anon;
revoke all on function public.is_user_board_member(uuid, uuid) from public, anon;
revoke all on function public.card_board_id(uuid) from public, anon;
revoke all on function public.label_board_id(uuid) from public, anon;
revoke all on function public.shares_board_with(uuid) from public, anon;
grant execute on function public.is_board_member(uuid) to authenticated;
grant execute on function public.board_role(uuid) to authenticated;
grant execute on function public.can_edit_board(uuid) to authenticated;
grant execute on function public.is_user_board_member(uuid, uuid) to authenticated;
grant execute on function public.card_board_id(uuid) to authenticated;
grant execute on function public.label_board_id(uuid) to authenticated;
grant execute on function public.shares_board_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Nouveau tableau : le créateur devient owner, et 3 listes sont créées.
create or replace function public.handle_new_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (board_id, user_id) do update set role = 'owner';

  insert into public.lists (board_id, title, position)
  values (new.id, 'À faire', 1000), (new.id, 'En cours', 2000), (new.id, 'Fait', 3000);
  return new;
end;
$$;

drop trigger if exists on_board_created on public.boards;
create trigger on_board_created
  after insert on public.boards
  for each row execute function public.handle_new_board();

-- updated_at
drop trigger if exists set_updated_at on public.boards;
create trigger set_updated_at before update on public.boards for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.lists;
create trigger set_updated_at before update on public.lists for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.cards;
create trigger set_updated_at before update on public.cards for each row execute function public.set_updated_at();

-- Une carte ne peut appartenir qu'à une liste du même tableau.
create or replace function public.check_card_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.lists l where l.id = new.list_id and l.board_id = new.board_id) then
    raise exception 'La liste n''appartient pas à ce tableau';
  end if;
  return new;
end;
$$;

drop trigger if exists check_card_list on public.cards;
create trigger check_card_list
  before insert or update of list_id, board_id on public.cards
  for each row execute function public.check_card_list();

-- Journal d'activité : carte créée, déplacée, terminée ; membre ajouté.
create or replace function public.log_card_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.board_activity (board_id, user_id, action, payload)
    values (new.board_id, auth.uid(), 'card_created',
      jsonb_build_object('card_id', new.id, 'title', new.title, 'list_id', new.list_id));
  else
    if new.list_id is distinct from old.list_id then
      insert into public.board_activity (board_id, user_id, action, payload)
      values (new.board_id, auth.uid(), 'card_moved',
        jsonb_build_object('card_id', new.id, 'title', new.title, 'from_list', old.list_id, 'to_list', new.list_id,
          'from_title', (select l.title from public.lists l where l.id = old.list_id),
          'to_title', (select l.title from public.lists l where l.id = new.list_id)));
    end if;
    if new.done_at is not null and old.done_at is null then
      insert into public.board_activity (board_id, user_id, action, payload)
      values (new.board_id, auth.uid(), 'card_done', jsonb_build_object('card_id', new.id, 'title', new.title));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists log_card_activity on public.cards;
create trigger log_card_activity
  after insert or update of list_id, done_at on public.cards
  for each row execute function public.log_card_activity();

create or replace function public.log_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'owner' then
    insert into public.board_activity (board_id, user_id, action, payload)
    values (new.board_id, new.user_id, 'member_added', jsonb_build_object('user_id', new.user_id, 'role', new.role));
  end if;
  return new;
end;
$$;

drop trigger if exists log_member_activity on public.board_members;
create trigger log_member_activity
  after insert on public.board_members
  for each row execute function public.log_member_activity();

-- ---------------------------------------------------------------------------
-- Invitations (RPC)
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(b uuid, r text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
begin
  if public.board_role(b) is distinct from 'owner' then
    raise exception 'Seul le propriétaire du tableau peut inviter';
  end if;
  if r not in ('member', 'viewer') then
    raise exception 'Rôle invalide';
  end if;
  -- 24 octets aléatoires = 32 caractères base64, rendus sûrs pour une URL
  t := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.board_invites (board_id, token, role, invited_by) values (b, t, r, auth.uid());
  return t;
end;
$$;

create or replace function public.accept_invite(t text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.board_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'invitation_non_connecte';
  end if;
  select * into inv from public.board_invites i where i.token = t;
  if not found then
    raise exception 'invitation_introuvable';
  end if;
  if inv.accepted_by is not null and inv.accepted_by <> auth.uid() then
    raise exception 'invitation_utilisee';
  end if;
  if inv.accepted_by is null and inv.expires_at < now() then
    raise exception 'invitation_expiree';
  end if;
  insert into public.board_members (board_id, user_id, role)
  values (inv.board_id, auth.uid(), inv.role)
  on conflict (board_id, user_id) do nothing;
  update public.board_invites
    set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now())
    where id = inv.id;
  return inv.board_id;
end;
$$;

-- Aperçu : titre du tableau, prénom de la personne qui invite et état de l'invitation, rien d'autre.
drop function if exists public.get_invite_preview(text);
create or replace function public.get_invite_preview(t text)
returns table (board_title text, board_color text, inviter_first_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.title,
         b.color,
         p.first_name,
         case
           when i.accepted_by is not null and i.accepted_by <> auth.uid() then 'used'
           when i.accepted_by is null and i.expires_at < now() then 'expired'
           else 'ok'
         end
  from public.board_invites i
  join public.boards b on b.id = i.board_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = t;
$$;

revoke all on function public.create_invite(uuid, text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.get_invite_preview(text) from public, anon;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.get_invite_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_invites enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.card_members enable row level security;
alter table public.board_labels enable row level security;
alter table public.card_labels enable row level security;
alter table public.checklist_items enable row level security;
alter table public.card_comments enable row level security;
alter table public.board_activity enable row level security;

-- boards
drop policy if exists "boards_select_members" on public.boards;
create policy "boards_select_members" on public.boards
  for select to authenticated using (public.is_board_member(id) or owner_id = (select auth.uid()));
drop policy if exists "boards_insert_self" on public.boards;
create policy "boards_insert_self" on public.boards
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "boards_update_owner" on public.boards;
create policy "boards_update_owner" on public.boards
  for update to authenticated using (public.board_role(id) = 'owner') with check (public.board_role(id) = 'owner');
drop policy if exists "boards_delete_owner" on public.boards;
create policy "boards_delete_owner" on public.boards
  for delete to authenticated using (public.board_role(id) = 'owner');

-- board_members (les ajouts passent par le trigger de création et accept_invite)
drop policy if exists "board_members_select" on public.board_members;
create policy "board_members_select" on public.board_members
  for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "board_members_update_owner" on public.board_members;
create policy "board_members_update_owner" on public.board_members
  for update to authenticated
  using (public.board_role(board_id) = 'owner' and user_id <> (select auth.uid()))
  with check (public.board_role(board_id) = 'owner' and role in ('member', 'viewer'));
drop policy if exists "board_members_delete" on public.board_members;
create policy "board_members_delete" on public.board_members
  for delete to authenticated
  using (
    (public.board_role(board_id) = 'owner' and user_id <> (select auth.uid()))
    or (user_id = (select auth.uid()) and role <> 'owner')
  );

-- board_invites : owner seulement (les autres passent par les RPC)
drop policy if exists "board_invites_select_owner" on public.board_invites;
create policy "board_invites_select_owner" on public.board_invites
  for select to authenticated using (public.board_role(board_id) = 'owner');
drop policy if exists "board_invites_insert_owner" on public.board_invites;
create policy "board_invites_insert_owner" on public.board_invites
  for insert to authenticated with check (public.board_role(board_id) = 'owner');
drop policy if exists "board_invites_delete_owner" on public.board_invites;
create policy "board_invites_delete_owner" on public.board_invites
  for delete to authenticated using (public.board_role(board_id) = 'owner');

-- lists
drop policy if exists "lists_select" on public.lists;
create policy "lists_select" on public.lists for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "lists_insert" on public.lists;
create policy "lists_insert" on public.lists for insert to authenticated with check (public.can_edit_board(board_id));
drop policy if exists "lists_update" on public.lists;
create policy "lists_update" on public.lists for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
drop policy if exists "lists_delete" on public.lists;
create policy "lists_delete" on public.lists for delete to authenticated using (public.can_edit_board(board_id));

-- cards
drop policy if exists "cards_select" on public.cards;
create policy "cards_select" on public.cards for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "cards_insert" on public.cards;
create policy "cards_insert" on public.cards for insert to authenticated with check (public.can_edit_board(board_id));
drop policy if exists "cards_update" on public.cards;
create policy "cards_update" on public.cards for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
drop policy if exists "cards_delete" on public.cards;
create policy "cards_delete" on public.cards for delete to authenticated using (public.can_edit_board(board_id));

-- card_members : on ne peut assigner qu'un membre du tableau
drop policy if exists "card_members_select" on public.card_members;
create policy "card_members_select" on public.card_members
  for select to authenticated using (public.is_board_member(public.card_board_id(card_id)));
drop policy if exists "card_members_insert" on public.card_members;
create policy "card_members_insert" on public.card_members
  for insert to authenticated
  with check (
    public.can_edit_board(public.card_board_id(card_id))
    and public.is_user_board_member(public.card_board_id(card_id), user_id)
  );
drop policy if exists "card_members_delete" on public.card_members;
create policy "card_members_delete" on public.card_members
  for delete to authenticated using (public.can_edit_board(public.card_board_id(card_id)));

-- board_labels
drop policy if exists "board_labels_select" on public.board_labels;
create policy "board_labels_select" on public.board_labels for select to authenticated using (public.is_board_member(board_id));
drop policy if exists "board_labels_insert" on public.board_labels;
create policy "board_labels_insert" on public.board_labels for insert to authenticated with check (public.can_edit_board(board_id));
drop policy if exists "board_labels_update" on public.board_labels;
create policy "board_labels_update" on public.board_labels for update to authenticated
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
drop policy if exists "board_labels_delete" on public.board_labels;
create policy "board_labels_delete" on public.board_labels for delete to authenticated using (public.can_edit_board(board_id));

-- card_labels : l'étiquette doit appartenir au tableau de la carte
drop policy if exists "card_labels_select" on public.card_labels;
create policy "card_labels_select" on public.card_labels
  for select to authenticated using (public.is_board_member(public.card_board_id(card_id)));
drop policy if exists "card_labels_insert" on public.card_labels;
create policy "card_labels_insert" on public.card_labels
  for insert to authenticated
  with check (
    public.can_edit_board(public.card_board_id(card_id))
    and public.label_board_id(label_id) = public.card_board_id(card_id)
  );
drop policy if exists "card_labels_delete" on public.card_labels;
create policy "card_labels_delete" on public.card_labels
  for delete to authenticated using (public.can_edit_board(public.card_board_id(card_id)));

-- checklist_items
drop policy if exists "checklist_items_select" on public.checklist_items;
create policy "checklist_items_select" on public.checklist_items
  for select to authenticated using (public.is_board_member(public.card_board_id(card_id)));
drop policy if exists "checklist_items_insert" on public.checklist_items;
create policy "checklist_items_insert" on public.checklist_items
  for insert to authenticated with check (public.can_edit_board(public.card_board_id(card_id)));
drop policy if exists "checklist_items_update" on public.checklist_items;
create policy "checklist_items_update" on public.checklist_items
  for update to authenticated
  using (public.can_edit_board(public.card_board_id(card_id)))
  with check (public.can_edit_board(public.card_board_id(card_id)));
drop policy if exists "checklist_items_delete" on public.checklist_items;
create policy "checklist_items_delete" on public.checklist_items
  for delete to authenticated using (public.can_edit_board(public.card_board_id(card_id)));

-- card_comments : création par les membres (owner, member), modification et suppression par l'auteur
drop policy if exists "card_comments_select" on public.card_comments;
create policy "card_comments_select" on public.card_comments
  for select to authenticated using (public.is_board_member(public.card_board_id(card_id)));
drop policy if exists "card_comments_insert" on public.card_comments;
create policy "card_comments_insert" on public.card_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_edit_board(public.card_board_id(card_id)));
drop policy if exists "card_comments_update_author" on public.card_comments;
create policy "card_comments_update_author" on public.card_comments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "card_comments_delete_author" on public.card_comments;
create policy "card_comments_delete_author" on public.card_comments
  for delete to authenticated using (user_id = (select auth.uid()));

-- board_activity : lecture seule (écrite par les triggers)
drop policy if exists "board_activity_select" on public.board_activity;
create policy "board_activity_select" on public.board_activity
  for select to authenticated using (public.is_board_member(board_id));

-- ---------------------------------------------------------------------------
-- Profils visibles entre membres (sans toucher aux politiques de profiles)
-- Seules les colonnes publiques sont exposées ; santé et données privées restent cachées.
-- ---------------------------------------------------------------------------
create or replace view public.member_profiles
with (security_invoker = false)
as
  select p.id, p.first_name, p.last_name, p.avatar_url
  from public.profiles p
  where public.shares_board_with(p.id);

revoke all on public.member_profiles from public, anon;
grant select on public.member_profiles to authenticated;

-- Photos de profil (bucket privé avatars) : lisibles par les personnes qui partagent un tableau.
drop policy if exists "avatars_select_board_members" on storage.objects;
create policy "avatars_select_board_members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.shares_board_with(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

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
  foreach t in array array['lists', 'cards', 'checklist_items', 'card_comments', 'board_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
