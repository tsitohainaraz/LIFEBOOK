# Décisions prises pendant le développement

Choix non couverts par `CLAUDE.md`, `FONCTIONNALITES.md` ou `PROMPTS_COPILOTE.md`. À chaque fois, l'option la plus simple a été retenue.

## Mise en place (étape 1)

- **Pas de `@vitejs/plugin-react`.** La connexion internet du poste ne permettait pas de télécharger ce paquet (et sa dépendance `react-refresh`). Le JSX est compilé directement par esbuild (`esbuild: { jsx: 'automatic' }` dans `vite.config.ts`). Conséquence : pas de « rechargement à chaud » qui garde l'état ; la page se recharge entièrement à chaque modification. On peut ajouter le plugin plus tard avec `npm i -D @vitejs/plugin-react` puis `plugins: [react()]`.
- **Classes CSS partagées dans `src/styles/tokens.css`.** En plus des variables, ce fichier contient les classes communes reprises de la maquette 5 (`.btn`, `.card`, `.item`, `.check`, `.st`, `.field`, `.stats3`, `.moods`…). Les styles propres à un écran sont dans des CSS Modules.
- **Rendu `date-fns` v4** avec la locale `fr`.

## Base de données (étape 2)

- Contraintes `check` en plus de celles demandées : `smoking` (`non`, `occasionnel`, `regulier`, `ancien`), `alcohol` (`jamais`, `occasionnel`, `hebdomadaire`, `quotidien`), `blood_type`, `reminder_min` (0, 10, 30, 60), plages de valeurs (tension, poids, humeur…), 5 valeurs au maximum dans `life_plan.values`.
- `family_history`, `goal_steps` et `habit_logs` ont aussi `id` et `user_id` (RLS uniforme `user_id = auth.uid()`).
- Fonction `public.delete_my_account()` (security definer) : supprime les photos de l'utilisateur puis sa ligne `auth.users` ; toutes les tables suivent par `on delete cascade`. Elle répond à « Suppression du compte et de toutes ses données » sans clé secrète.
- Bucket `avatars` : 2 Mo maximum, JPEG, PNG ou WebP.

## Connexion (étape 3)

- Avant de rediriger vers Google, l'application interroge l'URL d'autorisation de Supabase : si Google n'est pas activé, Supabase répond 400 et l'écran affiche « La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail. » au lieu d'une page d'erreur brute.
- Supabase renvoie la même erreur pour un code faux ou expiré : le message est « Code incorrect ou expiré ».
- L'adresse en attente de vérification est gardée dans `sessionStorage` (onglet en cours seulement) pour que l'écran `/verify` survive à un rechargement.
- Les gardes de route font la redirection après connexion : `/login` et `/verify` renvoient vers `/onboarding` (profil non terminé) ou `/`.
- Si la ligne `profiles` n'existe pas (déclencheur SQL pas encore appliqué), l'application la crée elle-même au chargement.

## Profil (étape 4)

- `profiles.onboarding_step` : 1 = identité, 2 = situation, 3 = consentement santé, 4 = santé, 5 = antécédents familiaux, 6 = résumé.
- Recadrage carré **au centre** (sans outil de recadrage manuel), JPEG 512 px.
- `avatar_url` contient soit l'URL de la photo Google, soit le chemin `{user_id}/avatar.jpg?v=…` dans le bucket privé ; dans ce cas, l'application crée une URL signée valable 1 h.
- Le sommeil saisi à l'étape 3 met aussi à jour `profiles.sleep_hours` (paramètre de vie).
- La précision de croyance est proposée pour Chrétien(ne), Islam et Autre (comme dans la maquette).
- « Modifier mon profil et ma santé » (menu du compte) rouvre le profil à l'étape 1 (`/onboarding?etape=1`).

## Accueil (étape 5)

- « Mon résumé » et le menu du compte sont dans l'en-tête de toutes les pages de l'application.
- L'état de santé en % est une ligne de `health_logs` (`wellbeing_pct`). Le curseur du rapport du jour en ajoute une aussi.
- Activité proposée par la recommandation santé : placée dans le premier créneau libre à partir de maintenant (ou après la tâche en cours) ; s'il n'y a plus de place avant minuit, demain à 07:00. Elle est marquée prioritaire.
- Avec un garde-fou santé (tension très élevée, maladie cardiaque, grossesse, drépanocytose, épilepsie), seules des activités douces sont proposées (marche, étirements, respiration, eau).
- Les paramètres de vie (espérance de vie, sommeil, travail, retraite) se modifient dans le menu du compte (avatar en haut à droite).

## Journée, semaine, mois, année (étapes 6 et 7)

- Une répétition crée une ligne par occurrence sur **8 semaines** à partir du jour choisi, partout (journée et semaine).
- Le chevauchement est signalé par un message orange dans le panneau, sans bloquer l'enregistrement.
- Les tâches sans heure apparaissent au-dessus de la frise horaire.
- Mois : les 3 objectifs du mois sont les `priorities` du plan du mois ; le focus de chaque semaine est dans `plans.extra.weeks` (`{"0": "…", "1": "…"}`).
- Habitudes : « tous les jours » ou « du lundi au vendredi » à la création. La suppression archive l'habitude (`archived_at`) pour garder l'historique.
- Année : un objectif de l'année a pour échéance la fin du trimestre choisi. Les « étapes » des mois sont des `goal_steps` rattachées à un objectif de l'année (il faut donc un objectif avant d'ajouter une étape). Un objectif de l'année peut être rattaché à une grande étape de vie.

## Ma vie (étape 8)

- Les grandes étapes sont des `goals` avec `level = 'life'`, `target_age`, et une échéance calculée : la veille de l'anniversaire suivant l'âge visé.
- Roue de la vie : note 5 par défaut ; mission, héritage, valeurs et roue sont enregistrés après une pause de saisie.
- Statut d'un objectif : `late` si l'échéance est passée (avant aujourd'hui) ; « Reste X semaines » arrondi au-dessus.

## Programme précédent, rapports, santé (étape 9)

- Programme précédent : une page = 20 jours (ou 20 semaines) d'historique ; seuls les jours avec des tâches ou un rapport sont affichés ; bouton « Voir avant le … » pour la page suivante (jusqu'à 5 ans).
- Journal de santé : route `/sante`, ouverte depuis « Mon résumé ». Une nouvelle pesée met aussi à jour `health_profiles.weight_kg` (l'IMC est recalculé).
- Compteur OMS : minutes des activités de catégorie « Sport » cochées dans la semaine.

## Heure et fuseau horaire (après l'étape 9)

- L'application ne fait confiance ni à l'horloge ni au fuseau du téléphone (`src/lib/serverTime.ts`).
  - L'instant exact vient de l'en-tête HTTP `Date` du serveur (Vercel ou serveur de développement), mesuré au démarrage, toutes les 10 minutes et au retour du réseau. L'application attend cette mesure au plus 3 s avant de s'afficher.
  - « Aujourd'hui » et « maintenant » sont calculés dans le fuseau du profil (`profiles.timezone`, `Indian/Antananarivo` par défaut), modifiable dans le menu du compte.
- `currentDate()` sert à l'affichage et aux calculs du jour ; `nowISO()` sert aux horodatages enregistrés en base (`done_at`, consentement…), toujours en UTC réel.
- Limite : la bibliothèque Supabase utilise l'horloge de l'appareil pour l'expiration de la session. Avec une horloge très fausse (plusieurs heures en temps universel, pas seulement le fuseau), la session peut se renouveler plus souvent que prévu.

## Tableaux d'équipe et « À suivre » (branche feature/super-trello)

### Phase 1 — « À suivre »
- Le « bloc virtuel du rendez-vous de planification » cité par PROMPT_SUPER_TRELLO.md n'existe pas dans le code : `collectPlannedItems()` réunit les tâches avec une heure (et les cartes à partir de la phase 7). La source `'planning'` est prévue dans le type `PlannedItem` mais n'est pas encore alimentée.
- L'accueil charge désormais les tâches d'aujourd'hui **et de demain** (pour « le premier élément de demain »). Le programme du jour n'affiche que celles d'aujourd'hui.
- Les dates des éléments planifiés sont en heure murale du fuseau du profil, comme `currentDate()`.
- Le bloc « À suivre » est un emplacement `footer` ajouté au composant `NowRing` existant.
- Le test de `formatRelative` et de `phraseUpcoming` est dans `src/utils/upcoming.test.ts` (les fonctions sont dans `src/utils/now.ts`, comme demandé).

### Phase 2 — Base de données des tableaux (`0002_tableaux.sql`)
- Fonctions d'aide supplémentaires (security definer, `search_path = ''`) : `can_edit_board` (owner ou member), `is_user_board_member`, `card_board_id`, `label_board_id`, `shares_board_with`. Elles évitent la récursion des politiques et les jointures répétées.
- Un trigger empêche de mettre une carte dans la liste d'un autre tableau.
- Création de commentaires : réservée aux rôles owner et member (les observateurs ne modifient rien, comme pour le reste du tableau).
- `get_invite_preview` renvoie aussi la couleur du tableau et l'état de l'invitation (`ok`, `expired`, `used`) pour afficher un message clair, sans autre donnée personnelle.
- Jeton d'invitation : `translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')` (pgcrypto est dans le schéma `extensions` sur Supabase).
- Les avatars stockés dans le bucket privé `avatars` deviennent lisibles par les personnes qui partagent un tableau (politique `avatars_select_board_members`). Aucune autre colonne de `profiles` n'est exposée : la vue `member_profiles` ne contient que id, prénom, nom et avatar.
- Supprimer son compte supprime les tableaux dont on est owner (cascade sur `boards.owner_id`).
- Le SQL a été vérifié dans PGlite (PostgreSQL embarqué) avec un socle qui imite Supabase : 0001 et 0002 appliqués deux fois de suite sans erreur, et 31 contrôles d'accès avec trois utilisateurs (owner, membre, observateur, non-membre).

### Phase 3 — Écrans des tableaux
- Code dans `src/features/boards/`. L'icône « Tableaux » est dans l'en-tête, à côté de « Mon résumé » (il n'y avait pas encore de cloche) ; la carte « Mes tableaux » est sur l'accueil. La barre d'onglets garde ses 6 onglets.
- Tout le contenu d'un tableau (listes, cartes, membres, étiquettes, assignations, checklists) est dans une seule entrée de cache React Query `['board', id]` ; les déplacements, coches et assignations y sont appliqués de façon optimiste puis annulés en cas d'erreur.
- Onglet du tableau dans l'URL : `/tableaux/:id?vue=cartes|discussion|equipe`.
- Glisser-déposer : capteurs souris (6 px) et tactile (250 ms, 8 px), plus clavier. Le défilement automatique horizontal de dnd-kit est désactivé (il se battait avec le scroll-snap) : près du bord de l'écran, la liste voisine s'affiche après 450 ms.
- Réordonnancement de la checklist avec des boutons ↑ ↓ (plus simple et plus précis au doigt qu'un glisser-déposer dans un panneau qui défile).
- Les mentions des commentaires sont détectées (`extractMentions`) ; leur enregistrement dans la table `mentions` est ajouté à la phase 6, une fois la table créée (phase 4).
- « Planifier dans ma journée » crée une tâche de catégorie « Travail » liée à la carte (`tasks.card_id`).
- Invitation : le jeton est gardé dans `sessionStorage` ; après la connexion et la fin du profil, la garde `ProtectedRoute` ramène sur `/invitation/:token`. « Plus tard » oublie l'invitation.
- Temps réel : un canal par tableau ; `checklist_items` et `card_comments` n'ont pas de `board_id`, ils sont écoutés sans filtre (la RLS ne transmet que les lignes visibles) et triés côté application.

### Phase 4 — Base de données équipe (`0003_equipe.sql`)
- Suppression d'un fichier du bucket `board-files` : autorisée à son auteur (retrouvé par la table `attachments`, pour ne pas dépendre des colonnes internes `owner`/`owner_id` de `storage.objects`, qui varient selon les versions) ou à l'owner du tableau.
- `attachments.path` doit commencer par le dossier du tableau ; il est unique.
- Messages : écrits par les rôles owner et member (les observateurs lisent seulement) ; les messages système ne sont créés que par les triggers ; un message supprimé garde sa ligne avec `deleted_at` (« Message supprimé »).
- Notifications : lecture et mise à jour de `read_at` seulement, par le destinataire (droit au niveau de la colonne) ; aucune insertion depuis l'application.
- Notification de message : la notification non lue existante est mise à jour (dernier message, compteur `payload.count`) au lieu d'en créer une autre.
- Rappels horaires (`run_hourly_notifications`, pg_cron `0 * * * *`) : « échéance demain », « échéance dépassée » (une fois par carte et par jour, dans le fuseau de chaque personne) et, à 18:00 heure locale, « Envoie ton rapport du jour » pour les owners et members des tableaux actifs ces 7 derniers jours (activité ou messages) qui n'ont pas envoyé leur rapport.
- Vérifié dans PGlite avec un faux pg_cron : 0001 à 0003 appliqués deux fois, 62 contrôles d'accès et de notifications.
