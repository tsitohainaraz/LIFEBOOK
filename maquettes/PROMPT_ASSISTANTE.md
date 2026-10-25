# Prompt — Assistante de planification LifeBook (V1 gratuite)

Ce prompt **remplace** tous les prompts précédents sur l'assistante : assistante IA, intelligence, problèmes de la vie, version premium, planification guidée. Si une partie a déjà été construite, réutilise-la et complète-la au lieu de la refaire.

## Objectif

Une assistante dont le **seul rôle est de planifier** : la journée, la semaine et la vie. Elle s'appuie sur :
- les informations personnelles de l'utilisateur ;
- ses anciennes tâches et ses habitudes réelles ;
- ses objectifs ;
- ses **dates et heures libres**.

Elle discute avec l'utilisateur, recommande ce qui est bon pour lui (efficacité, santé, objectifs) et **gère son emploi du temps**. On y accède par un chat sur l'accueil.

## Règles pour travailler sans erreur

1. **Inspecte d'abord, n'invente rien.** Lis CLAUDE.md, FONCTIONNALITES.md, DECISIONS.md, `supabase/migrations/`, `src/types/database.ts`, `src/utils/`, l'accueil et les écrans Journée, Semaine et Ma vie, ainsi que les maquettes `G- Planification guidée LifeBook.html` et `5- Ecran d accueil.html`. Réutilise les noms, hooks et composants existants. Si ce document ne correspond pas au code réel, adapte-toi et note-le dans DECISIONS.md.
2. **Branche dédiée :** `git checkout -b feature/assistante`. Ne pousse pas sur `main`.
3. **À la fin de chaque phase :** `npm run build` sans erreur, `npx vitest run` sans échec, les tests Deno des fonctions, puis un commit « Assistante phase N : … ».
4. **SQL rejouable sans erreur :**
   - `create table if not exists` ;
   - `add column if not exists` ;
   - `create or replace function` ;
   - `drop policy if exists` avant chaque `create policy` ;
   - `drop trigger if exists` avant chaque `create trigger`.
   RLS sur chaque table.
5. **Clés secrètes uniquement côté serveur**, avec `Deno.env.get(...)`. Secrets déjà créés dans Supabase : `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODEL`. Plus tard : `ANTHROPIC_API_KEY` et `ANTHROPIC_MODEL`. Jamais de clé dans l'application, dans `.env.local` ou dans git.
6. **Les dates et les heures sont calculées par le code, jamais par le modèle.** Le modèle reçoit un calendrier tout prêt et des outils pour trouver les créneaux libres. Chaque date et chaque heure qu'il renvoie est validée côté serveur.

---

## Phase 1 — Base de données

Migration suivante libre, par exemple `supabase/migrations/0005_assistante.sql`.

- **`ai_conversations`** : id, user_id default auth.uid(), title, context ('home', 'day', 'week', 'life', 'guided'), created_at, updated_at.
- **`ai_messages`** : id, conversation_id (on delete cascade), user_id, role ('user', 'assistant'), content, proposed_actions jsonb, applied boolean default false, provider, model, input_tokens, output_tokens, latency_ms, feedback smallint (-1, 0, 1), feedback_reason, created_at.
- **`ai_actions`** : id, user_id, message_id, action_type, payload jsonb, inverse jsonb (pour annuler), status ('proposed', 'accepted', 'ignored', 'auto_applied', 'undone'), created_at.
- **`ai_usage`** : user_id, date, count ; primary key (user_id, date).
- **`ai_memory`** : id, user_id, kind ('preference', 'contrainte', 'objectif', 'sante'), text, source ('user', 'assistant'), created_at.
- **`ai_settings`** : user_id en clé primaire, auto_apply boolean default false (« Laisser l'assistante modifier mon emploi du temps »), use_health boolean default true, created_at, updated_at.
- **`profiles`** : `add column if not exists` plan text default 'free' check in ('free', 'premium'), plan_until timestamptz. Ces deux colonnes ne doivent pas être modifiables par l'utilisateur : trigger qui rejette leur changement sauf pour le rôle service.
- **`plan_limits`** : plan en clé primaire, ai_messages_per_day int, features jsonb. Valeurs : free = 30 ; premium = 200.
- RLS : chacun ne voit et ne modifie que ses lignes. plan_limits est lisible par tous les utilisateurs connectés.

Mets à jour `src/types/database.ts`.

---

## Phase 2 — Analyses et planificateur (sans IA, fonctions pures avec tests)

Si ces fichiers existent déjà, complète-les.

**`src/utils/insights.ts`** + RPC SQL `get_insights(days int)` qui renvoie les agrégats sur les 28 derniers jours :
- taux de réalisation par tranche horaire (06-09, 09-12, 12-14, 14-17, 17-20, 20-23) et par jour de la semaine ; meilleures et pire tranches ;
- temps planifié et temps réalisé par jour, et surcharge (planifié / réalisé) ;
- tâches souvent reportées (postponed_count >= 3) ;
- temps par catégorie, comparé à la roue de la vie ;
- minutes de sport de la semaine, par rapport à 150 ;
- si le consentement santé existe et que use_health est vrai : tendances de la tension, du poids, du sommeil et du bien-être (health_logs) ;
- humeur avec et sans sport (au moins 5 jours de chaque côté).
Sortie : un objet typé, avec des phrases factuelles courtes.

**`src/utils/freeSlots.ts`** : `getFreeSlots(tâches, tâchesFixes, sommeil, rendezVousPlanification, de, à, duréeMin)`. Renvoie les créneaux libres entre l'heure de réveil et l'heure de coucher, en excluant les tâches, les prières, le rendez-vous de planification et les cartes de tableaux avec une heure.

**`src/utils/scheduler.ts`** : `proposeDayPlan(date, àPlacer[], fixes[], insights, préférences, énergie)` :
- les éléments à heure fixe d'abord ;
- les « must » dans les meilleures tranches horaires, puis les « should », puis le sport (si la semaine est sous 150 min et qu'aucun garde-fou de santé ne s'applique), puis les « nice » ;
- tâches de plus de 90 min découpées en séances de 25 à 50 min, avec des pauses de 5 à 10 min ;
- 15 % de marge gardée ;
- charge maximale : 7 h si fatigué, 9 h si normal, 10 h si au top ;
- sommeil, prières et tâches fixes toujours respectés ;
- ce qui ne rentre pas est renvoyé dans une liste `nonPlacés`.

**`src/utils/planOps.ts`** : applique des opérations `{ op: 'create' | 'move' | 'resize' | 'delete' | 'update', … }` à une journée, vérifie qu'il n'y a ni chevauchement ni empiètement sur le sommeil, et calcule l'opération inverse pour l'annulation.

**Copie côté Deno :** les Edge Functions doivent pouvoir utiliser freeSlots, scheduler et planOps. Mets ces trois fichiers dans `supabase/functions/_shared/planning/` (TypeScript pur, sans dépendance au navigateur) et importe-les aussi depuis l'application, ou garde deux copies synchronisées par un test qui compare leurs résultats. Note le choix dans DECISIONS.md.

---

## Phase 3 — Adaptateur d'IA et Edge Function `assistant`

**`supabase/functions/_shared/llm/`** :
- interface `chat({ system, messages, tools, maxTokens, temperature })`, qui renvoie `{ text, toolCalls[], usage, provider, model }` ;
- `groq.ts` : API compatible OpenAI, modèle `llama-3.3-70b-versatile` ;
- `openrouter.ts` : secours, modèle `OPENROUTER_FREE_MODEL`, utilisé si Groq renvoie 429 ou 5xx ;
- `anthropic.ts` : écrit et testé avec des objets simulés, utilisé seulement si l'utilisateur est premium ET que `ANTHROPIC_API_KEY` existe ;
- outils décrits une seule fois dans un format neutre, puis convertis automatiquement aux formats OpenAI et Anthropic ;
- `prompts.ts` : un seul message système, partagé par tous les fournisseurs.

**Edge Function `supabase/functions/assistant/index.ts`** :
- Client Supabase créé avec le jeton de l'utilisateur (en-tête Authorization) : la RLS s'applique.
- Modes : `chat`, `guided_parse`, `explain_plan`, `adjust_plan`, `replan_rest_of_day`.
- **Limite :** messages par jour selon plan_limits. Seuls les messages envoyés par l'utilisateur comptent ; les étapes internes et les outils ne comptent pas. Au-delà : « Tu as atteint la limite de l'assistante pour aujourd'hui. Elle revient demain. »
- **Contexte envoyé au modèle** (le strict nécessaire, jamais de nom de famille, d'e-mail, de photo ni de mesures brutes de santé) :
  - prénom, âge, situation (étudiant, travailleur), croyance (seulement pour respecter les prières et les jours de culte), heures de sommeil, de travail et de retraite ;
  - **date et heure locales actuelles et fuseau** ;
  - **un calendrier des 14 prochains jours** calculé par le code (« lun. 27 oct. 2026 », « mar. 28 oct. 2026 »…), pour que le modèle ne fasse jamais de calcul de date ;
  - tâches d'aujourd'hui et de demain, avec leurs horaires ;
  - objectifs en cours (titre, échéance, statut, étapes) ; mission et valeurs ;
  - résumé des Insights (phrases courtes) et souvenirs ai_memory ;
  - santé résumée, seulement avec consentement et use_health (par exemple « tension à surveiller », « antécédent familial d'AVC », « 40 min de sport sur 150 cette semaine »).
- **Outils de lecture, exécutés par la fonction elle-même** (le modèle peut les appeler, au plus 4 tours d'outils par message) :
  - `get_free_slots { from_date, to_date, min_duration_min }` ;
  - `get_tasks { from_date, to_date }` ;
  - `get_goals {}` ;
  - `get_history { days }` : tâches passées résumées (faites, reportées, abandonnées).
- **Outils d'écriture, jamais exécutés par la fonction** : renvoyés dans `proposed_actions`, après validation (dates dans le calendrier, heures valides, catégories autorisées, pas de chevauchement grâce à planOps) :
  - `create_task`, `move_task`, `resize_task`, `delete_task`, `update_task` ;
  - `plan_day { date, energy?, items[] }` : appelle proposeDayPlan et renvoie les opérations ;
  - `set_day_priorities { date, intention, priorities[] }` ;
  - `create_goal { title, domain, level, deadline?, target_age? }`, `add_goal_steps { goal_id, steps[] }` ;
  - `remember { kind, text }`.
- **Message système** (en français, avec tutoiement) :
  - Tu es l'assistante de planification de LifeBook.
  - Ton rôle : aider à planifier la journée, la semaine et la vie, en t'appuyant sur les données de l'utilisateur et sur ses créneaux libres.
  - Utilise toujours les outils pour connaître les créneaux libres ; n'invente jamais d'horaire.
  - Pose au plus une question à la fois quand il te manque une information.
  - Recommande des choses concrètes, utiles pour l'efficacité, la santé et les objectifs, en t'appuyant sur les faits fournis.
  - Réponses courtes (5 phrases maximum, plus les actions proposées).
  - Pour les sujets sans rapport avec la planification, réponds en une phrase et ramène poliment vers la planification.
  - Santé : jamais de diagnostic. En cas de tension très élevée, de maladie cardiaque, de grossesse, de drépanocytose ou d'épilepsie, pas de sport intense, et un renvoi vers un médecin.
  - Respecte la croyance de l'utilisateur (horaires de prière, jour de culte) ; si elle vaut « rien », n'en parle pas.
- **Détresse (priorité absolue) :** liste d'expressions en français et en malgache vérifiée avant l'appel, plus le drapeau `crisis` renvoyé par le modèle. En cas de détresse :
  - réponse courte, chaleureuse, sans jugement, qui encourage à parler tout de suite à quelqu'un de confiance ou à un professionnel ;
  - aucune action proposée ;
  - l'interface affiche les contacts de `src/config/helpResources.ts`. Crée ce fichier vide avec le commentaire « À REMPLIR avec des numéros vérifiés pour Madagascar ». N'invente aucun numéro.
- Enregistre chaque échange dans ai_messages (fournisseur, modèle, tokens, durée) et chaque action proposée dans ai_actions.

---

## Phase 4 — Le chat sur l'accueil

- **Sur l'accueil**, juste sous le cercle « Maintenant », une carte **« Ton assistante »** :
  - un champ « Demande-moi de planifier quelque chose… » avec le bouton micro (dictée Web Speech, fr-FR ; bouton masqué si le navigateur ne le permet pas) ;
  - 4 suggestions à toucher :
    - « Planifie ma journée de demain » (lance la planification guidée, phase 5) ;
    - « Trouve-moi 1 h pour le sport cette semaine » ;
    - « Réorganise le reste de ma journée » ;
    - « Aide-moi à avancer sur mon objectif » ;
  - envoyer un message ouvre le **chat en plein écran**.
- **Chat plein écran** (route `/assistante`, et `/assistante/:conversationId`) :
  - bulles de discussion et indicateur « L'assistante réfléchit… » ;
  - liste des conversations passées, avec suppression ;
  - compteur des messages restants aujourd'hui ;
  - boutons « Utile » et « Pas utile » sous chaque réponse ; « Pas utile » propose une raison (Pas clair, Pas adapté à moi, Faux, Trop long).
- **Actions proposées :**
  - affichées sous la réponse en cartes lisibles, par exemple « Ajouter : Marche rapide · mar. 28 oct. · 06:30 – 07:00 », « Déplacer : Banque → 16:00 » ;
  - si l'action concerne une journée, aperçu de la frise de cette journée avec les changements en surbrillance ;
  - boutons « Appliquer », « Ignorer » et « Tout appliquer ».
  Les actions sont **appliquées par l'application** avec les hooks existants (pas par la fonction), puis ai_actions est mis à jour.
- **Mode automatique** (réglage dans Mon compte et dans le chat : « Laisser l'assistante modifier mon emploi du temps ») :
  - désactivé par défaut ;
  - activé, les actions sur les tâches sont appliquées tout de suite, avec un bandeau « 3 changements appliqués » et un bouton **Annuler** pendant 10 secondes (opérations inverses de planOps). Les objectifs et les souvenirs demandent toujours une confirmation.
- Le chat est aussi accessible par un bouton « Demander à l'assistante » dans /jour, /semaine et /vie. La conversation s'ouvre avec le bon contexte (context = day, week ou life) et un premier message déjà rempli.

---

## Phase 5 — Planification guidée, une question à la fois

Reprends exactement le design et les transitions de `maquettes/G- Planification guidée LifeBook.html`.

- **Accès :**
  - « Planifie ma journée de demain » sur l'accueil ;
  - dans /planifier-demain, le choix « Planifier avec l'assistante » (par défaut) ou « Planifier moi-même » ;
  - le matin, si la journée n'est pas planifiée : « Planifier en 3 min » (pour aujourd'hui).
- **Écran d'accueil :** « Déjà prévu demain », avec les tâches fixes, les prières, le rendez-vous et les cartes de tableaux.
- **Questions, une par écran** (scénario préparé sans IA dans `script.ts`, avec des tests) :
  1. énergie (choix rapides, passage automatique 0,3 s après le choix) ;
  2. ce qui doit absolument être fait (texte avec dictée et suggestions) ;
  3. rendez-vous à heure fixe ;
  4. ce qui ferait avancer un rêve (étapes d'objectifs à cocher, plus du texte) ;
  5. sport (avec la jauge de la semaine) ;
  6. heure de réveil.
  Questions ajoutées selon la situation : tâche reportée 3 fois ou plus (« Qu'est-ce qui bloque ? »), objectif urgent sans tâche cette semaine. 8 questions au maximum. Ne jamais demander ce qui est déjà connu.
- **Construction :**
  - les réponses libres sont envoyées en UNE fois au mode `guided_parse`, qui renvoie un JSON strict `{ title, category, duration_min, fixed_time?, priority, goal_id? }[]`, validé côté serveur, avec un seul nouvel essai si le JSON est invalide ;
  - puis `proposeDayPlan` construit la journée ;
  - puis `explain_plan` rédige 2 ou 3 phrases d'explication ;
  - écran « Je prépare ta journée… » pendant ce temps.
- **Résultat :** explication, frise, éléments sans place, champ pour ajuster (« décale la banque à 16 h » : mode `adjust_plan`, qui renvoie des opérations planOps vérifiées), boutons Valider et Recommencer.
- **Valider :** crée les tâches, enregistre les priorités et l'intention, remplit planning_sessions.completed_at si la table existe, puis affiche la confirmation avec la série.
- **Sans IA** (quota atteint ou erreur) : le parcours continue. Chaque réponse libre devient une tâche d'1 h modifiable, et le planificateur construit quand même la journée.
- Un entretien complet compte au plus 5 messages.

---

## Phase 6 — Gestion automatique de l'emploi du temps

- **Réorganiser le reste de la journée :** quand une tâche est en retard de plus de 30 min, ou après 2 « Faire plus tard » le même jour, le cercle « Maintenant » propose « Je réorganise ta fin de journée ? ». Si l'utilisateur accepte :
  - `replan_rest_of_day` replace les tâches restantes non faites avec proposeDayPlan, à partir de maintenant ;
  - ce qui ne rentre plus est proposé pour demain ;
  - l'IA explique en 1 ou 2 phrases ;
  - aperçu de la frise, puis Appliquer (ou application directe avec Annuler si le mode automatique est activé).
- **Report du soir :** pendant le rendez-vous de planification, les tâches non faites du jour sont proposées dans « Déjà prévu demain », chacune avec Garder, Plus tard ou Abandonner.
- **Planifier ma vie :** dans /vie, le bouton « Planifier ma vie avec l'assistante » ouvre une conversation (context = life). L'assistante pose des questions sur les rêves et les échéances, puis propose :
  - des grandes étapes par âge (create_goal, level = life) ;
  - les objectifs de l'année (level = year) ;
  - les premières étapes du mois.
  Toujours avec confirmation.

---

## Phase 7 — Mémoire, transparence et offres

- **Page « Ce que l'assistante sait de moi »** (depuis Mon compte et le chat) :
  - souvenirs ai_memory, à modifier ou supprimer ;
  - interrupteur « Utiliser mes données de santé » (ai_settings.use_health) ;
  - interrupteur « Mode automatique » ;
  - bouton « Tout effacer » (souvenirs et conversations).
- **Dans Mon compte :**
  - « Ton offre : Gratuite », avec les messages restants aujourd'hui ;
  - une carte « LifeBook Premium, bientôt disponible » : assistante plus puissante, plus de messages, bilan de la semaine, le livre de ta vie ;
  - un bouton « Je suis intéressé(e) » qui enregistre l'intérêt dans une table premium_interest (user_id, created_at).
- **Vue `ai_stats_daily`**, sans accès pour authenticated, sans aucun contenu de message : messages, utilisateurs actifs, tokens par fournisseur, taux de réponses utiles, taux d'actions appliquées.
- Mention en bas du chat : « L'assistante peut se tromper. Elle ne remplace pas l'avis d'un médecin. »

---

## Fin du travail

1. Mets à jour FONCTIONNALITES.md et DECISIONS.md.
2. `npm run build`, `npx vitest run` et les tests Deno doivent passer.
3. `git push -u origin feature/assistante`. **Ne fusionne pas dans main.**
4. Donne-moi :
   - le fichier SQL à appliquer (Supabase → SQL Editor → coller → Run) et la requête de vérification ;
   - les commandes pour déployer la fonction : `npx supabase login`, `npx supabase link --project-ref hdhpkqjbfksgpdhacqve`, `npx supabase functions deploy assistant` ;
   - la commande pour fusionner dans main après les tests ;
   - une liste de tests à faire :
     - « Planifie ma journée de demain » ;
     - « Trouve-moi 1 h pour le sport cette semaine » ;
     - « Décale la banque à 16 h » ;
     - réorganisation après un retard ;
     - mode automatique avec Annuler ;
     - quota atteint ;
     - Groq indisponible (secours OpenRouter) ;
   - ce que tu as simplifié ou pas pu faire.
