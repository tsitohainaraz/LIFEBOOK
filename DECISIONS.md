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

### Phase 5 — Fichiers et discussion
- Fichiers dans `src/features/files/`, discussion dans `src/features/chat/`.
- Deux boutons pour joindre : « Fichier » (galerie ou documents, sans `capture`) et « Photo » (`capture="environment"`, qui ouvre directement l'appareil photo). Un seul champ avec `capture` empêcherait de choisir dans la galerie sur la plupart des téléphones.
- La barre de progression passe par `XMLHttpRequest` vers l'API Storage (supabase-js ne donne pas la progression) ; « Annuler » interrompt l'envoi.
- Photos : réduites à 1600 px et converties en JPEG 0,8 ; l'orientation est respectée avec `createImageBitmap(..., { imageOrientation: 'from-image' })`. Vidéos : envoyées telles quelles (50 Mo max) avec une miniature prise à 1 s, rangée à côté (`…-thumb.jpg`). Documents (PDF, Word, Excel, PowerPoint, OpenDocument, texte, CSV) : 20 Mo max.
- `attachment_owner` reconnaît aussi le chemin de la miniature, pour que l'auteur puisse la supprimer avec la vidéo.
- Les documents s'ouvrent dans un nouvel onglet via une URL signée ; photos et vidéos dans une visionneuse plein écran (glissement ou flèches). Suppression d'une photo ou d'une vidéo depuis la visionneuse (auteur ou owner).
- Les @mentions sont enregistrées dans la table `mentions` dès maintenant, pour les messages et les commentaires de carte (la notification est créée par le trigger de la phase 4).
- Appui long (500 ms) ou clic droit sur un de ses messages : Modifier (messages texte) ou Supprimer. Les observateurs lisent la discussion sans écrire.
- Compteur de non-lus : messages des autres (hors messages système et supprimés) postérieurs à `message_reads.last_read_at`, rafraîchi toutes les 30 s et à chaque lecture.

### Phase 6 — Rapport d'équipe et notifications
- « Mon rapport du jour » est dans l'onglet « Équipe du jour » du tableau ; le rappel de 18:00 ouvre directement le formulaire (`?vue=equipe&rapport=1`).
- Résumé automatique : éléments de checklist cochés par moi aujourd'hui (jour local du profil), cartes que j'ai terminées aujourd'hui (journal `board_activity`, action `card_done`), cartes en cours qui me sont assignées (hors liste « Fait »). « Fait aujourd'hui » est prérempli avec ce résumé et reste modifiable.
- Un nouvel envoi le même jour met à jour le rapport (upsert) et publie un nouveau message « rapport » dans la discussion.
- Onglet « Équipe du jour » : une carte par membre (les observateurs ne sont pas listés), avancement moyen des rapports envoyés.
- Cloche dans l'en-tête, à côté de l'icône Tableaux ; sur les écrans de moins de 370 px, l'icône Tableaux est masquée pour garder des boutons de 44 px (la carte « Mes tableaux » de l'accueil reste disponible).
- `/notifications` affiche les 100 dernières notifications, groupées par jour ; si les tables ne sont pas encore créées, la cloche n'affiche rien et la page indique que les tableaux ne sont pas activés.

### Phase 7 — Liens entre les tableaux et LifeBook
- `useMyCards` (`src/features/boards/myCards.ts`) : cartes **qui me sont assignées**, non archivées, avec une échéance ; si les tables n'existent pas encore, la liste est vide et les écrans fonctionnent comme avant.
- Une carte avec une heure devient une « tâche » virtuelle d'1 h (identifiant `card:<id>`, catégorie « Travail ») pour la frise, la vue semaine, le cercle Maintenant et « À suivre ». Ces blocs prennent la couleur du tableau ; un appui ouvre la carte.
- Dans le cercle Maintenant, « Tâche terminée » sur une carte la termine (et la range dans « Fait ») ; « Faire plus tard » ouvre la carte (on ne déplace pas l'échéance d'une carte d'équipe depuis l'accueil).
- Cocher une tâche liée à une carte propose « Marquer aussi la carte comme faite ? » sur l'accueil, la Journée, la Semaine et le Mois.
- Progression d'un objectif relié à un tableau : les cartes du tableau (non archivées) comptent comme des éléments, faites si terminées. Elle est affichée dans « Mon année », seul écran qui montre la progression des objectifs.
- Accueil : « Mes cartes urgentes » = cartes en retard ou dues dans les 48 h, 5 au maximum.

## Assistante de planification (branche feature/assistante)

### Constats de l'inspection
- La maquette `maquettes/G- Planification guidée LifeBook.html` citée par PROMPT_ASSISTANTE.md n'existe pas (ni dans le dossier, ni ailleurs sur le disque). La planification guidée reprend le design des maquettes existantes : barre de progression et boutons Retour / Continuer de la maquette 4, cartes et pastilles de la maquette 5.
- Il n'existe pas de table `planning_sessions`, de route `/planifier-demain`, de « rendez-vous de planification » ni d'horaires de prière dans le code. Les éléments correspondants sont adaptés (voir les phases 2, 5 et 6).
- Migration : `0004_assistante.sql` (0001 à 0003 existent déjà).

### Phase 1 — Base de données (`0004_assistante.sql`)
- `ai_usage` n'est jamais écrit par l'application : le quota est consommé par la fonction `ai_take_quota()` (security definer), qui compare au plafond de `plan_limits` ; `ai_quota()` donne l'offre, le plafond, l'utilisé et le restant. Le jour compté est le jour local du fuseau du profil.
- Offre : `profiles.plan` et `plan_until` ; le trigger `protect_profile_plan` refuse leur modification par les rôles `authenticated` et `anon` (une insertion par l'application est ramenée à `free`). Le rôle service et le SQL Editor peuvent les changer. Une offre premium dont `plan_until` est passé compte comme gratuite.
- Un message ne peut être ajouté qu'à une de ses propres conversations.
- Vérifié dans PGlite : 0001 à 0004 appliqués deux fois, contrôles du quota (30 puis refus, impossible de remettre le compteur à zéro), de l'offre et de la RLS.

### Phase 2 — Analyses et planificateur
- **Une seule source** pour freeSlots, scheduler, planOps et insights : `supabase/functions/_shared/planning/` (TypeScript pur, imports en `.ts`, sans API du navigateur). L'application les réexporte depuis `src/utils/freeSlots.ts`, `scheduler.ts`, `planOps.ts` et `insights.ts`. Pas de copie à synchroniser.
- Les cas de test sont écrits une fois (`_shared/planning/cases.ts`) et exécutés par Vitest (`src/utils/planning.test.ts`) **et** par Deno (`planning_test.ts`, `deno test supabase/functions/`).
- `get_insights(days)` (SQL, RLS appliquée) renvoie les agrégats ; `computeInsights` (pur) en tire les meilleures tranches (au moins 3 tâches planifiées par tranche), les jours, la surcharge, les reports, le domaine faible de la roue de la vie, le sport de la semaine, les tendances de santé (premiers 7 jours contre 7 derniers jours, seulement avec consentement et `use_health`) et l'humeur avec ou sans sport (au moins 5 jours de chaque côté).
- Sommeil : l'heure de coucher par défaut est 22:30, le réveil = coucher + heures de sommeil du profil (`sleepFromHours`) ; il n'existe pas encore de réglage d'heure de coucher (la question « heure de réveil » de la planification guidée le précise pour la journée).
- Prières et rendez-vous de planification : `getFreeSlots` et `proposeDayPlan` les acceptent (éléments fixes et `planningMeeting`), mais aucune donnée ne les alimente encore (voir constats). Les cartes de tableaux avec une heure sont passées comme éléments fixes.
- Planificateur : 5 min de pause entre deux éléments, 10 min entre deux séances d'une même tâche ; un élément « nice » se place au plus tôt, les « must » et « should » d'abord dans les meilleures tranches ; la charge compte les éléments fixes de la journée.

### Phase 3 — Adaptateur d'IA et Edge Function `assistant`
- Code : `supabase/functions/_shared/llm/` (types, outils neutres, Groq, OpenRouter, Anthropic, routage, message système), `_shared/assistant/` (contexte, détresse, validation des actions, cœur `handler.ts` testable), `supabase/functions/assistant/` (`index.ts` HTTP + `db.ts` Supabase). Le client Supabase est créé avec la clé publique (`SUPABASE_ANON_KEY`, fournie par Supabase) et le jeton de l'utilisateur : la RLS s'applique. Aucune clé secrète Supabase.
- Groq et OpenRouter : appel HTTP direct à l'API compatible OpenAI (même code, `openaiCompat.ts`). Secours OpenRouter sur 429, 5xx ou erreur réseau ; une erreur 4xx n'est pas réessayée.
- Anthropic : SDK officiel `npm:@anthropic-ai/sdk@0.137.0` (chargé seulement à la demande), modèle `ANTHROPIC_MODEL` ou `claude-opus-5-5` par défaut, réflexion adaptative, `output_config.effort = "medium"`, pas de `temperature` (refusée par ces modèles), `tool_choice: auto`. **Repli côté serveur activé** (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) : en cas de refus de sécurité, l'API relance la même requête sur un autre modèle ; pour le désactiver, retirer ces deux lignes dans `anthropic.ts`. Les blocs bruts (réflexion comprise) sont renvoyés tels quels entre deux tours d'outils. Si Anthropic échoue (429/5xx), Groq puis OpenRouter prennent le relais.
- Identifiants courts : le modèle voit `t1`, `t2` (tâches) et `g1` (objectifs), traduits en vrais identifiants par la fonction ; il ne recopie jamais d'UUID.
- Outils d'écriture : validés immédiatement pendant la boucle ; un refus (chevauchement, sommeil, date hors calendrier, horaire déjà passé, identifiant inconnu) est renvoyé au modèle, qui peut corriger dans la limite des 4 tours. Les propositions acceptées s'enchaînent sur la même frise (deux propositions ne peuvent pas se chevaucher). Après 4 tours, un dernier appel sans outils produit la réponse.
- Quota : une requête de l'utilisateur = 1 message, quel que soit le nombre d'appels au modèle. Les modes `guided_parse`, `explain_plan`, `adjust_plan` et `replan_rest_of_day` comptent aussi 1 message chacun ; s'ils n'ont plus de quota ou d'IA, ils renvoient `ai: false` et une réponse sans IA (explication générique, réorganisation calculée quand même).
- Détresse : liste d'expressions (français et malgache), vérifiée avant le quota et avant tout appel ; réponse fixe, chaleureuse, sans action ; elle ne consomme pas le quota. Le modèle peut aussi appeler l'outil `signal_crisis` : les actions sont alors retirées. `src/config/helpResources.ts` est créé vide (aucun numéro inventé).
- Santé : le texte envoyé au modèle ne contient que des mots (« tension à surveiller », « antécédent familial d'AVC », « garde-fou santé »), jamais de mesure, et seulement avec consentement et `use_health`. Le garde-fou (tension très élevée, maladie cardiaque, grossesse, drépanocytose, épilepsie) empêche le planificateur d'ajouter du sport même si `use_health` est désactivé, sans rien envoyer au modèle.
- `replan_rest_of_day` est calculé sans IA : toutes les tâches non faites d'aujourd'hui sont replacées à partir de maintenant (+5 min) par `proposeDayPlan` ; ce qui ne rentre plus est déplacé à demain ; l'IA n'écrit que l'explication. Les opérations sont vérifiées en « retirant » d'abord les tâches déplacées (deux tâches qui échangent leur place ne se gênent pas).
- `adjust_plan` agit sur le programme proposé (pas encore enregistré, identifiants `p1`, `p2`…) et ne peut modifier que la date de ce programme.
- Chaque échange est enregistré dans `ai_messages` (message de l'utilisateur, puis réponse avec fournisseur, modèle, tokens et durée) ; chaque action proposée dans `ai_actions` (`action_type`, `payload`, `inverse`). Les modes guidés utilisent une conversation `guided`, la réorganisation une conversation `day`.
- Historique envoyé au modèle : les 12 derniers messages de la conversation (texte seulement).

### Phase 4 — Le chat
- Code : `src/features/assistant/` (carte de l'accueil, page plein écran, cartes d'action, dictée, application des actions). La carte « Ton assistante » est placée juste sous le cercle « Maintenant ».
- Le chat plein écran (`/assistante`, `/assistante/:id`) est hors de la coquille de l'application (pas d'onglets en bas), avec son propre fournisseur de messages courts.
- Le premier message venant de l'accueil est passé dans l'état de navigation puis envoyé une seule fois ; les boutons « Demander à l'assistante » (Journée, Semaine, Ma vie) préremplissent le champ sans l'envoyer.
- Les actions affichées après rechargement viennent d'`ai_actions` (leur statut y est mis à jour : accepted, ignored, auto_applied, undone) ; leur ordre est gardé dans `payload.index`.
- Application : les tâches passent par `useAddTasks`, `useUpdateTask`, `useDeleteTask` ; les objectifs et étapes par `useGoalMutations` ; les priorités du jour sont enregistrées dans `plans` (period = day ; l'intention dans `theme`, comme dans /jour). L'inverse est recalculé par l'application à partir des tâches réelles juste avant la modification (les identifiants créés remplacent les références `new-…`).
- Mode automatique : seules les actions sur les tâches sont appliquées tout de suite (statut auto_applied) ; bandeau « N changements appliqués » avec Annuler pendant 10 s. Les objectifs, étapes, priorités et souvenirs attendent toujours « Appliquer ».
- La suggestion « Réorganise le reste de ma journée » appelle directement le mode `replan_rest_of_day`.
- Détresse : sous la réponse, les contacts de `helpResources.ts` ; tant que ce fichier est vide, une phrase générique (proche, médecin, urgences), sans numéro.

### Phase 5 — Planification guidée
- La maquette `G- Planification guidée` n'existe pas : écran conçu dans le style des maquettes (une question par écran, barre de progression, entrée en glissé de 0,35 s, désactivée si `prefers-reduced-motion`).
- Route `/planifier-demain` (plein écran) : choix « Planifier avec l'assistante » (mis en avant) ou « Planifier moi-même » (ouvre /jour à la date de demain). `/planifier-demain?jour=aujourdhui` planifie aujourd'hui sans le choix ; l'accueil affiche « Planifier en 3 min » le matin (avant 12:00) si la journée est vide.
- Scénario dans `src/features/guided/script.ts` (testé) : énergie (passage automatique 0,3 s), indispensable (suggestions : tâches non faites des 2 derniers jours), rendez-vous, rêve (étapes d'objectifs ouvertes à cocher + texte), sport (jauge de la semaine ; garde-fou santé : 0, 15 ou 20 min et renvoi vers un médecin), réveil. Pas de question sport si la journée a déjà du sport, pas de réveil pour aujourd'hui. Questions ajoutées : la tâche la plus reportée (3 fois ou plus) et un objectif urgent (2 semaines ou moins) sans tâche cette semaine, placées avant le réveil, 8 questions au maximum.
- « Déjà prévu » : tâches du jour et cartes de tableaux de ce jour-là. Prières et rendez-vous de planification : pas de données (voir constats), donc non affichés.
- Construction : seules les réponses libres partent à `guided_parse` ; étapes cochées, sport, objectif urgent et tâche bloquée sont ajoutés sans IA. Le planificateur ne rajoute pas de sport de lui-même quand la question a été posée. Tâches existantes et cartes à heure fixe (30 min) sont des éléments fixes.
- Sans IA (quota, erreur, JSON invalide deux fois) : chaque réponse libre devient une tâche d'1 h (les heures écrites, « 14 h », sont respectées) ; la journée est construite quand même et l'explication est générique. Chaque élément proposé peut être modifié (30 min à 2 h) ou retiré, le planificateur recalcule.
- Messages comptés : `guided_parse` 1 + `explain_plan` 1 + au plus 3 ajustements = 5 au maximum.
- Valider : crée les tâches (les « must » marquées prioritaires ; une longue tâche découpée devient « Titre (1/2) »…), déplace une tâche reportée gardée, supprime la tâche abandonnée, enregistre les 3 priorités (les « must ») et l'intention (champ facultatif sur l'écran du résultat). La table `planning_sessions` n'existe pas : rien n'est rempli. La série = nombre de jours consécutifs ayant au moins une tâche jusqu'à la date planifiée.

### Phase 6 — Gestion automatique de l'emploi du temps
- « Je réorganise ta fin de journée ? » s'affiche dans le cercle « Maintenant » (au-dessus de « À suivre ») si une tâche non faite d'aujourd'hui a fini depuis plus de 30 min, ou après 2 reports dans la journée (`shouldOfferReplan`, testé). Le nombre de reports du jour n'est pas stocké : on compte les tâches reportées (postponed_count > 0) modifiées aujourd'hui, ce qui est une approximation. « Non merci » masque la proposition jusqu'au prochain chargement de l'accueil.
- « Oui » ouvre le chat avec le mode `replan_rest_of_day` : aperçu de la frise et Appliquer, ou application directe avec Annuler (10 s) si le mode automatique est activé. Toutes les tâches non faites d'aujourd'hui sont replacées ; le planificateur garde sa marge de 15 %, donc une tâche qui tient « tout juste » passe à demain.
- Report du soir : dans l'écran « Déjà prévu demain » de la planification guidée (code arrivé avec la phase 5, même écran). « Garder » ajoute la tâche aux indispensables de demain (elle est déplacée, pas recopiée, à la validation) ; « Plus tard » la repousse de 2 jours à la même heure (+1 report) ; « Abandonner » la supprime. Les deux derniers choix sont enregistrés tout de suite.
- « Planifier ma vie avec l'assistante » (/vie) ouvre une conversation `life` et envoie tout de suite la première demande ; le message système reçoit alors des règles propres (questions une à la fois, puis create_goal level life avec target_age, level year avec deadline, add_goal_steps), toujours avec confirmation.
