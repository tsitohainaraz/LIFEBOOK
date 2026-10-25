# Prompt — « À suivre » dans le cercle + Tableaux d'équipe (super Trello)

Tu vas ajouter deux fonctions à LifeBook, de façon autonome, en 7 phases. Respecte CLAUDE.md et le design existant.

## Règles pour travailler sans erreur

1. **Commence par inspecter, n'invente rien.** Avant d'écrire du code, lis CLAUDE.md, FONCTIONNALITES.md, DECISIONS.md, `supabase/migrations/`, `src/types/database.ts`, `src/utils/now.ts`, l'accueil et les écrans Journée, Semaine et Mois. Réutilise les noms, hooks, composants et styles qui existent déjà. Ne renomme rien d'existant. Si un nom ou un chemin de ce document ne correspond pas au code réel, adapte-toi au code réel et note-le dans DECISIONS.md.
2. **Travaille sur une branche :** `git checkout -b feature/super-trello`. Ne pousse jamais directement sur `main` : Vercel déploie `main`, et le site en ligne casserait tant que le SQL n'est pas appliqué.
3. **À la fin de chaque phase :** `npm run build` (zéro erreur TypeScript), `npx vitest run` (tous les tests passent), puis un commit « Phase N : … ». Ne passe pas à la phase suivante tant qu'il reste une erreur.
4. **SQL rejouable sans erreur**, car je l'appliquerai à la main et peut-être deux fois :
   - `create table if not exists` ;
   - `create or replace function` ;
   - `drop trigger if exists … ; create trigger …` ;
   - `drop policy if exists … ; create policy …` ;
   - `alter table … add column if not exists` ;
   - bucket : `insert into storage.buckets … on conflict (id) do nothing` ;
   - Realtime : ajoute chaque table à la publication `supabase_realtime` dans un bloc `DO` qui vérifie d'abord `pg_publication_tables`, pour ne pas planter si elle y est déjà ;
   - `create extension if not exists pg_cron` ; pour les tâches cron, `cron.unschedule` dans un bloc protégé avant `cron.schedule`.
5. **Sécurité :**
   - RLS activée sur chaque nouvelle table ;
   - fonctions d'aide en `security definer` avec `set search_path = ''` et des noms qualifiés (`public.…`) pour éviter la récursion des politiques ;
   - jamais de clé secrète côté application ;
   - les tables de santé et les colonnes privées de `profiles` ne doivent jamais devenir lisibles par d'autres utilisateurs.
6. **Types :** ajoute chaque nouvelle table dans `src/types/database.ts`. Aucun `any`.
7. **Application tant que le SQL n'est pas appliqué :** si une table n'existe pas encore (erreur Supabase `42P01` ou `PGRST205`), l'écran Tableaux affiche « Les tableaux ne sont pas encore activés » au lieu de planter, et le reste de l'application continue de marcher normalement.

---

## Phase 1 — « À suivre » dans le cercle Maintenant

Pas de changement de base de données dans cette phase.

**1. Dans `src/utils/now.ts`**, crée la fonction pure `getUpcoming(items, maintenant, limite = 3)` :
- elle prend une liste d'éléments planifiés `{ id, title, start: Date, end: Date, category, source: 'task' | 'planning' | 'card', boardName? }` ;
- elle renvoie les prochains éléments non faits qui commencent après maintenant ;
- s'il n'y a plus rien aujourd'hui, elle renvoie le premier élément de demain.

**2. Crée `formatRelative(minutes, start)`**, avec des tests :
- moins de 1 min : « maintenant » ;
- moins de 60 min : « dans 45 min » ;
- moins de 24 h, même jour : « dans 2 h 15 » (ou « dans 2 h » si les minutes valent 0) ;
- demain : « demain à 06:00 » ;
- au-delà : « jeudi à 09:00 ».

**3. Crée `phraseUpcoming(title, relatif)`**, avec des tests :
- si le titre commence par un verbe à l'infinitif (même règle que la phrase actuelle du cercle) : « Dans 2 h 15, tu dois réviser l'examen selon ton plan » ;
- sinon : « Dans 2 h 15 : Réunion d'équipe, selon ton plan » ;
- pour demain : « Demain à 06:00, tu dois faire du footing selon ton plan ».

**4. Dans la carte du cercle Maintenant de l'accueil**, ajoute sous les boutons un bloc **« À suivre »** :
- la **phrase principale** du prochain élément (`phraseUpcoming`), avec un point de la couleur de sa catégorie, son horaire « 16:00 – 17:30 », et le nom du tableau s'il s'agit d'une carte ;
- en dessous, **les 2 éléments suivants** en petit (« dans 4 h · Appeler maman ») ;
- quel élément devient « le prochain » :
  - état `now` : l'élément qui suit la tâche en cours ;
  - état `next` : le cercle montre déjà le prochain élément, donc « À suivre » commence au suivant ;
  - états `late`, `free` et `done` : le prochain élément à venir ;
- s'il n'y a rien jusqu'à demain : « Rien de prévu pour l'instant » avec un lien « Planifier demain » ;
- le temps relatif se met à jour toutes les 30 secondes ;
- quand il reste 15 minutes ou moins, la phrase passe en orange et un petit point clignote ;
- un appui sur un élément ouvre la Journée à la bonne date.

**5. Sources des éléments :**
- les tâches (`tasks`) avec une heure de début ;
- le bloc virtuel du rendez-vous de planification, s'il existe déjà dans le code ;
- les cartes de tableaux, à partir de la phase 7.
- Prépare une fonction `collectPlannedItems()` qui réunit toutes les sources.

**6. Tests Vitest :** `getUpcoming` (en cours, à venir, plus rien aujourd'hui, rien du tout), `formatRelative` et `phraseUpcoming`.

---

## Phase 2 — Base de données des tableaux

Fichier `supabase/migrations/0002_tableaux.sql`. Si ce nom est déjà pris, utilise le numéro suivant libre.

**Tables :**
- `boards` : id, owner_id `uuid not null default auth.uid()`, title not null, color text default '#c6f432', goal_id (references goals on delete set null), archived_at, created_at, updated_at.
- `board_members` : board_id (references boards on delete cascade), user_id (references auth.users on delete cascade), role check in ('owner', 'member', 'viewer'), joined_at ; primary key (board_id, user_id).
- `board_invites` : id, board_id, token text unique not null, role check in ('member', 'viewer') default 'member', invited_by default auth.uid(), expires_at default now() + interval '7 days', accepted_by, accepted_at, created_at.
- `lists` : id, board_id, title, position numeric not null, archived_at, created_at, updated_at.
- `cards` : id, board_id, list_id (references lists on delete cascade), title not null, description, position numeric not null, due_date date, due_time time, done_at, created_by default auth.uid(), archived_at, created_at, updated_at. Index sur (board_id, list_id, position).
- `card_members` : card_id, user_id ; primary key (card_id, user_id).
- `board_labels` : id, board_id, name, color.
- `card_labels` : card_id, label_id ; primary key (card_id, label_id).
- `checklist_items` : id, card_id, text not null, position numeric, done_at, done_by, created_at.
- `card_comments` : id, card_id, user_id default auth.uid(), body not null, created_at, edited_at.
- `board_activity` : id, board_id, user_id, action text, payload jsonb, created_at.
- `tasks` : `add column if not exists card_id uuid references cards(id) on delete set null`.

**Fonctions et triggers :**
- `public.is_board_member(b uuid) returns boolean` et `public.board_role(b uuid) returns text`, en security definer.
- Trigger after insert on boards : ajoute le créateur comme owner dans board_members et crée les listes « À faire », « En cours » et « Fait » (positions 1000, 2000, 3000).
- Trigger updated_at sur boards, lists et cards.
- Trigger qui écrit dans board_activity : carte créée, carte déplacée de liste, carte terminée, membre ajouté.
- RPC `public.create_invite(b uuid, r text) returns text` : owner uniquement, génère un token de 32 caractères (`encode(gen_random_bytes(24), 'base64')` nettoyé pour les URL).
- RPC `public.accept_invite(t text) returns uuid` : vérifie que le token existe, n'est pas expiré et n'a pas été accepté par quelqu'un d'autre ; insère le membre (on conflict do nothing) ; remplit accepted_by et accepted_at ; renvoie board_id.
- RPC `public.get_invite_preview(t text)` : renvoie le titre du tableau et le prénom de la personne qui invite, sans autre donnée.

**RLS :**
- Lecture de toutes les tables des tableaux : `is_board_member(board_id)`. Pour cards, checklist_items et card_comments, passer par le board_id de la carte.
- Écriture des listes, cartes, étiquettes et checklists : rôles owner et member.
- boards : update et delete pour l'owner seulement.
- board_members : lecture pour les membres ; changement de rôle et retrait pour l'owner ; chacun peut se retirer lui-même (quitter le tableau), sauf l'owner.
- card_comments : création par les membres ; modification et suppression par l'auteur.
- board_invites : lecture et création pour l'owner ; aucune lecture directe pour les autres (ils passent par les RPC).

**Profils visibles entre membres :** vue `public.member_profiles` (id, first_name, last_name, avatar_url) en `security_invoker = false`, filtrée sur les utilisateurs qui partagent au moins un tableau avec `auth.uid()`, ou l'utilisateur lui-même. Ne modifie pas les politiques de `profiles`.

**Realtime :** ajoute lists, cards, checklist_items, card_comments et board_members à la publication (bloc DO protégé).

Mets à jour `src/types/database.ts`.

---

## Phase 3 — Écrans des tableaux

- Installe `@dnd-kit/core`, `@dnd-kit/sortable` et `@dnd-kit/utilities`.
- **Accès :** une icône « Tableaux » dans l'en-tête (à côté de la cloche si elle existe) et une carte « Mes tableaux » sur l'accueil. La barre d'onglets reste à 6 onglets.
- **`/tableaux`** :
  - liste de mes tableaux : bande de couleur, titre, nombre de cartes, avatars des membres (3 au maximum puis « +N »), nombre de cartes en retard ;
  - bouton « Nouveau tableau » : titre, couleur (6 choix), objectif lié facultatif ;
  - état vide avec une explication.
- **`/tableaux/:id`** :
  - en-tête : titre modifiable par l'owner, avatars des membres, bouton Membres, menu (étiquettes, archiver, supprimer pour l'owner) ;
  - onglets du tableau : **Cartes** · **Discussion** · **Équipe du jour** (ces deux derniers seront remplis aux phases 5 et 6 ; mets-y un emplacement d'attente) ;
  - vue Cartes : une liste par écran en pleine largeur (scroll-snap horizontal), pastilles des listes en haut pour aller directement à une liste, et « + Ajouter une liste » en dernier ;
  - dans chaque liste : cartes triées par position (titre, étiquettes, échéance colorée selon le statut, avatars, progression de la checklist « 3/5 », icône trombone s'il y a des fichiers) et « + Ajouter une carte » en bas ;
  - glisser-déposer avec dnd-kit :
    - TouchSensor avec un délai de 250 ms et une tolérance de 8 px, MouseSensor ;
    - à l'approche du bord de l'écran, passage automatique à la liste voisine ;
    - nouvelle position = moyenne des positions voisines ; si l'écart devient inférieur à 0,0001, renuméroter la liste (1000, 2000, …) ;
    - mise à jour optimiste avec React Query, annulée en cas d'erreur avec un message ;
  - menu de chaque carte : « Déplacer vers… » (choix de la liste et de la position), « Terminer », « Archiver » ;
  - les observateurs (viewer) voient tout, mais sans aucun bouton de modification.
- **Carte** (panneau plein écran, route `/tableaux/:id/carte/:cardId` pour pouvoir partager le lien) :
  - titre et description (enregistrés après 600 ms sans saisie) ;
  - membres assignés (choisis parmi les membres du tableau) ;
  - échéance (date et heure facultative) ;
  - étiquettes ;
  - checklist : ajout, coche, suppression, réordonnancement, barre de progression ;
  - commentaires avec @mention : autocomplétion parmi les membres, mentions enregistrées pour la phase 6 ;
  - historique (board_activity de cette carte) ;
  - boutons « Marquer comme fait » (déplace la carte dans la liste « Fait » si elle existe) et « Archiver » ;
  - bouton **« Planifier dans ma journée »** : choix du jour (aujourd'hui par défaut) et d'une durée (30 min, 1 h, 2 h), puis création d'une tâche liée (`tasks.card_id`) dans le premier créneau libre trouvé entre 06:00 et 22:00, avec un message de confirmation et un lien vers la Journée.
- **Membres :**
  - liste avec les rôles ;
  - l'owner peut changer un rôle ou retirer quelqu'un ;
  - « Copier le lien d'invitation » et « Partager » : Web Share API, avec repli sur la copie dans le presse-papiers. Le lien a la forme `${window.location.origin}/invitation/${token}` ;
  - « Quitter le tableau » pour les autres membres.
- **`/invitation/:token`** :
  - si la personne n'est pas connectée : enregistrer le token dans sessionStorage, l'envoyer sur /login, puis la ramener ici après la connexion ;
  - si son profil n'est pas terminé : terminer l'onboarding d'abord, puis revenir ici ;
  - afficher le nom du tableau et qui l'invite (get_invite_preview), avec le bouton « Rejoindre » (accept_invite), puis ouvrir le tableau ;
  - messages clairs : invitation expirée, déjà utilisée, introuvable.
- **Temps réel :**
  - abonnement Supabase Realtime filtré par `board_id` pour cards, lists et checklist_items, qui invalide ou met à jour le cache React Query ;
  - désabonnement en quittant l'écran ;
  - Realtime Presence : avatars des membres actuellement connectés au tableau.

---

## Phase 4 — Base de données équipe : fichiers, discussion, rapports, notifications

Fichier `supabase/migrations/0003_equipe.sql`, ou le numéro suivant libre. Mêmes règles rejouables.

- **Bucket Storage privé `board-files`.** Politiques sur `storage.objects` : `(storage.foldername(name))[1]` converti en uuid = board_id ; lecture si `is_board_member` ; envoi pour les rôles owner et member ; suppression par le propriétaire du fichier ou l'owner du tableau.
- **`attachments`** : id, board_id, card_id, message_id, report_id (tous nullables sauf board_id), user_id default auth.uid(), path, mime, size_bytes bigint, width, height, duration_s, thumb_path, created_at.
- **`messages`** : id, board_id, user_id default auth.uid(), body, kind check in ('text', 'report', 'system') default 'text', reply_to (references messages on delete set null), report_id, created_at, edited_at, deleted_at. Index sur (board_id, created_at desc).
- **`message_reads`** : board_id, user_id, last_read_at ; primary key (board_id, user_id).
- **`mentions`** : id, user_id (la personne mentionnée), board_id, card_id, comment_id, message_id, created_at.
- **`daily_reports`** : id, board_id, user_id default auth.uid(), date, auto_summary jsonb, progress_pct int, done_text, blockers_text, tomorrow_text, posted_at, created_at ; unique (board_id, user_id, date).
- **`notifications`** : id, user_id (destinataire), type text, board_id, card_id, message_id, actor_id, title text, body text, link text, payload jsonb, read_at, pushed_at (pour l'étape 10), created_at. Index sur (user_id, read_at, created_at desc). RLS : chacun lit et met à jour (read_at) seulement ses propres notifications ; les insertions se font uniquement par des fonctions security definer.
- **Triggers de notification** (security definer). Ne jamais notifier l'auteur de l'action ; toujours renseigner title, body et link :
  - carte assignée ;
  - commentaire sur une carte où je suis assigné ;
  - nouveau message : une seule notification non lue par tableau et par personne, mise à jour avec le dernier message au lieu d'en créer une nouvelle ;
  - mention ;
  - nouveau membre (pour les membres existants) ;
  - rapport du jour envoyé (pour l'owner).
- **Message système automatique** dans la discussion : un membre a rejoint le tableau, une carte est terminée.
- **pg_cron, toutes les heures**, en tenant compte de `profiles.timezone` :
  - échéance de carte demain, pour les membres assignés ;
  - échéance dépassée ;
  - à 18:00 heure locale, « Envoie ton rapport du jour », pour les membres des tableaux qui ont eu une activité dans les 7 derniers jours et qui n'ont pas encore de daily_report ce jour-là.
  Une seule notification de chaque type par carte et par jour.
- **Realtime :** messages, notifications, daily_reports.
- **RPC `public.board_storage_bytes(b uuid)`** : somme de size_bytes des attachments du tableau, réservée à l'owner.

Mets à jour `src/types/database.ts`.

---

## Phase 5 — Fichiers et discussion

**Fichiers** (`src/features/files/`) :
- choix depuis la galerie ou l'appareil photo (`<input type="file" accept="image/*,video/*,application/pdf,…" capture>`) ;
- avant l'envoi :
  - images redimensionnées à 1600 px maximum et converties en JPEG qualité 0,8 avec un canvas, en gardant l'orientation ;
  - vidéos refusées au-delà de 50 Mo, avec le message « Vidéo trop lourde (50 Mo max). Envoie plutôt un lien YouTube ou Google Drive. », et miniature extraite avec `<video>` et un canvas à 1 s ;
  - PDF et documents Office jusqu'à 20 Mo ;
- envoi dans `board-files/{board_id}/{uuid}.{ext}`, puis création de la ligne attachments ;
- barre de progression et bouton Annuler ;
- affichage avec des URL signées d'1 h, mises en cache ; galerie sur la carte ; visionneuse plein écran avec glissement entre les photos ; lecteur vidéo intégré ; les documents s'ouvrent dans un nouvel onglet ;
- l'owner voit l'espace utilisé par le tableau dans ses réglages (board_storage_bytes) ;
- les liens collés (YouTube, Google Drive, etc.) deviennent cliquables.

**Discussion** (onglet Discussion du tableau) :
- bulles de messages (les miens à droite en vert citron, ceux des autres à gauche avec avatar et prénom), regroupées par jour avec les heures ;
- répondre à un message (citation au-dessus) ;
- joindre des photos, vidéos et fichiers ;
- @mention avec autocomplétion ;
- appui long sur un de mes messages : modifier ou supprimer (« Message supprimé ») ;
- chargement de 30 messages à la fois en remontant ;
- nouveaux messages en direct ; défilement automatique vers le bas seulement si j'étais déjà en bas, sinon bouton « Nouveaux messages ↓ » ;
- message_reads mis à jour à l'ouverture et à chaque nouveau message lu ; compteur de non-lus sur l'onglet et sur la liste des tableaux ;
- messages système et rapports affichés différemment (centrés, ou sous forme de carte).

---

## Phase 6 — Rapport d'équipe et notifications

**Rapport du jour d'équipe :**
- bouton « Mon rapport du jour » dans le tableau ;
- résumé automatique calculé à partir des données de la journée de l'utilisateur dans ce tableau : éléments de checklist cochés (done_by = moi, done_at aujourd'hui), cartes terminées, cartes en cours qui me sont assignées ;
- avancement du tableau = éléments cochés / total (en %) ;
- formulaire : Fait aujourd'hui, Bloqué par, Demain, photos jointes ;
- « Envoyer » : enregistre daily_reports (upsert sur board_id, user_id, date) et publie un message de type 'report' dans la discussion, affiché comme une carte lisible ;
- onglet **Équipe du jour** : sélecteur de date, une carte par membre avec son rapport (ou « Pas encore envoyé »), avancement global.

**Notifications :**
- cloche dans l'en-tête avec le nombre de non lues, mis à jour en direct (Realtime sur notifications, filtré sur user_id) ;
- page `/notifications` groupée par jour ;
- un appui ouvre `link` et remplit read_at ;
- « Tout marquer comme lu ».

---

## Phase 7 — Liens entre les tableaux et LifeBook

- Les cartes **qui me sont assignées** avec une `due_date` apparaissent dans /jour, /semaine et /mois, avec une icône de tableau et le nom du tableau. Un appui ouvre la carte. Si la carte a une `due_time`, elle apparaît dans la frise horaire avec une durée d'1 h par défaut ; sinon, dans une rangée « Échéances du jour » au-dessus de la frise.
- Ajoute les cartes à `collectPlannedItems()` : elles apparaissent dans « À suivre » (phase 1) et dans le cercle Maintenant si elles ont une heure.
- Une tâche liée à une carte (`tasks.card_id`) affiche le nom de la carte. Cocher la tâche propose « Marquer aussi la carte comme faite ? ».
- Si un tableau est relié à un objectif, la progression de l'objectif inclut le pourcentage de cartes terminées.
- Accueil : bloc « Mes cartes urgentes », avec les cartes en retard ou dues dans les 48 h, tous tableaux confondus.

---

## Fin du travail

1. Mets à jour FONCTIONNALITES.md (nouvelle section « Tableaux d'équipe » et « À suivre » dans l'accueil) et DECISIONS.md.
2. `npm run build` et `npx vitest run` doivent passer sans erreur.
3. `git push -u origin feature/super-trello`. **Ne fusionne pas dans main.**
4. Donne-moi :
   - la liste des fichiers SQL à appliquer **dans l'ordre**, avec la marche à suivre (Supabase → SQL Editor → New query → coller → Run), et la requête SQL de vérification à lancer ensuite (liste des nouvelles tables, et RLS activée pour chacune) ;
   - la commande pour fusionner la branche dans main **après** l'application du SQL ;
   - une liste de tests à faire avec deux comptes (le mien et un deuxième, par exemple un autre e-mail) : créer un tableau, inviter, rejoindre, déplacer une carte et voir le changement en direct sur l'autre compte, envoyer une photo, un message, un rapport, recevoir les notifications ;
   - les points que tu n'as pas pu faire ou que tu as simplifiés.
