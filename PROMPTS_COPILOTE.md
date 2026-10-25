# LifeBook — prompts pour Copilot, étape par étape

## Avant de commencer

1. Crée un dossier vide `lifebook` et ouvre-le dans VS Code.
2. Place dedans :
   - `FONCTIONNALITES.md` à la racine ;
   - `.github/copilot-instructions.md` (Copilot le lit automatiquement à chaque demande) ;
   - un dossier `maquettes` avec tes fichiers HTML 1 à 5 et A à E.
3. Crée `.env.local` à la racine :
   ```
   VITE_SUPABASE_URL=https://hdhpkqjbfksgpdhacqve.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_oq7AWyhbBocMKJQMMq1tgw_YYiX_d3j
   ```
4. Ouvre Copilot Chat et choisis le mode **Agent** : c'est celui qui peut créer des fichiers et lancer des commandes.
5. Colle **une étape à la fois**. Teste ce qu'elle demande de tester avant de passer à la suivante.

---

## Étape 1 — Mise en place du projet

```text
Lis .github/copilot-instructions.md et FONCTIONNALITES.md.

Crée le projet LifeBook dans le dossier actuel avec Vite (modèle react-ts), sans écraser FONCTIONNALITES.md, .github, maquettes ni .env.local.

1. Installe : react-router-dom, @supabase/supabase-js, @tanstack/react-query, date-fns, et en dev : vitest.
2. vite.config.ts : serveur sur le port 3000 avec strictPort.
3. index.html : lang="fr", balise viewport avec viewport-fit=cover, theme-color #060806, polices Sora (400 à 800) et JetBrains Mono (500, 700, 800) depuis Google Fonts.
4. src/styles/tokens.css : toutes les variables de couleur, de police et de rayon du fichier d'instructions, plus le style de base (fond --bg, texte --ink, police Sora, box-sizing). Reprends les styles des boutons (.btn, .btn.primary, .btn.outline), des cartes (.card) et des pastilles de statut depuis maquettes/5- Ecran d accueil.html.
5. src/lib/supabase.ts : client créé avec les variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY, options auth { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }. Lance une erreur claire si une variable manque.
6. .env.example avec les deux noms de variables, sans valeurs. Vérifie que .env.local est dans .gitignore.
7. Routeur avec des pages vides : /login, /verify, /auth/callback, /onboarding, et dans une mise en page AppShell : / (Accueil), /jour, /semaine, /mois, /annee, /vie, /precedent, /rapport.
8. Composant BottomTabs fixé en bas avec les 6 onglets et leurs icônes SVG, repris de maquettes/5- Ecran d accueil.html. L'onglet actif est en vert citron.
9. QueryClientProvider autour de l'application.

Lance npm run dev et vérifie qu'il n'y a pas d'erreur TypeScript. À la fin, dis-moi quoi vérifier sur http://localhost:3000.
```

---

## Étape 2 — Base de données Supabase

```text
Crée le fichier supabase/migrations/0001_lifebook.sql avec tout le schéma de LifeBook. Toutes les tables ont : id uuid primary key default gen_random_uuid() (sauf mention contraire), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now().

Tables :
- profiles : id uuid primary key references auth.users(id) on delete cascade (pas de user_id), email, first_name, last_name, avatar_url, birth_date date, nationality, status (etudiant, travailleur, aucun), status_detail, faith (chretien, islam, judaisme, hindouisme, bouddhisme, traditionnel, autre, rien), faith_detail, life_expectancy int default 80, sleep_hours numeric default 8, work_hours numeric default 40, retire_age int default 60, timezone text default 'Indian/Antananarivo', health_consent_at timestamptz, onboarding_step int default 1, onboarding_done_at timestamptz.
- health_profiles : user_id en clé primaire, height_cm numeric, weight_kg numeric, systolic int, diastolic int, pulse int, blood_type, diabetes (non, type1, type2, prediabete, inconnu), conditions text[] default '{}', other_condition, medications, allergies, activity_level (sedentaire, 1-2, 3-4, 5+), sleep_hours numeric, water_l numeric, smoking, alcohol.
- health_logs : logged_at timestamptz default now(), systolic, diastolic, pulse, weight_kg, sleep_h, wellbeing_pct int (0 à 100).
- family_history : disease (cancer, diabete, avc, hypertension, coeur, autre), answer (oui, non, inconnu), relatives text[] default '{}', other_text ; unique(user_id, disease).
- goals : title, domain, level (life, year, month, week), deadline date, target_age int, parent_goal_id uuid references goals(id) on delete set null, done_at timestamptz.
- goal_steps : goal_id uuid references goals(id) on delete cascade, title, due_date date, done_at timestamptz.
- tasks : date date not null, start_time time, end_time time, title not null, category not null default 'autre' (liste des catégories), is_priority boolean default false, done_at timestamptz, goal_id uuid references goals(id) on delete set null, reminder_min int, recurrence_group uuid, postponed_count int default 0. Index sur (user_id, date).
- plans : period (day, week, month, quarter, year), period_start date, theme text, priorities jsonb default '[]' (liste de { text, done }), extra jsonb default '{}' ; unique(user_id, period, period_start).
- reports : period (day, week, month, year), period_start date, mood int (1 à 5), wellbeing_pct int, wins, lessons, blockers, next ; unique(user_id, period, period_start).
- habits : title, days_of_week int[] default '{1,2,3,4,5,6,7}', archived_at timestamptz.
- habit_logs : habit_id references habits(id) on delete cascade, date date ; unique(habit_id, date).
- life_plan : user_id en clé primaire, mission, values text[] default '{}', wheel jsonb default '{}', legacy.
- bucket_items : title, done_at timestamptz.

Ajoute :
- des contraintes check pour toutes les listes de valeurs ci-dessus ;
- la RLS sur toutes les tables, avec des politiques select, insert, update et delete limitées à user_id = auth.uid() (id = auth.uid() pour profiles, sans politique delete) ;
- une fonction updated_at et son trigger sur chaque table ;
- la fonction public.handle_new_user() en security definer avec set search_path = '', déclenchée after insert on auth.users, qui crée la ligne profiles (email, first_name = given_name, last_name = family_name, avatar_url = avatar_url ou picture depuis raw_user_meta_data) et une ligne life_plan vide ;
- le bucket Storage privé « avatars » avec des politiques qui limitent chaque utilisateur au dossier dont le nom est son auth.uid().

Ensuite, écris à la main src/types/database.ts avec les types TypeScript de toutes ces tables (format compatible avec createClient<Database>), et type le client Supabase avec.

À la fin, explique-moi comment appliquer ce fichier : ouvrir le tableau de bord Supabase → SQL Editor → New query → coller le contenu → Run.
```

---

## Étape 3 — Connexion (Google + code par e-mail)

```text
Mets en place la connexion avec Supabase Auth. Deux méthodes, sans mot de passe : Google, et un code ou un lien reçu par e-mail. L'application doit fonctionner tout de suite avec l'e-mail, même si Google n'est pas encore configuré.

1. src/contexts/AuthContext.tsx : session, user, profile, loading, refreshProfile(), signOut(). Écoute supabase.auth.onAuthStateChange et charge la ligne profiles à chaque nouvelle session.
2. Écran de démarrage (maquette 1) : logo animé et barre de chargement, affiché tant que loading vaut true. Mets le logo dans public/logo.png (je l'ajouterai) avec un emplacement de remplacement s'il manque.
3. /login (maquette 2, sans mot de passe ni onglets) :
   - bouton « Continuer avec Google » conforme à la charte Google (logo G en SVG, fond blanc, texte #1f1f1f, 52 px) : supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } } }). Si Google renvoie une erreur de configuration, afficher : « La connexion Google n'est pas encore disponible. Utilise ton adresse e-mail. » ;
   - séparateur « ou », champ « Adresse e-mail », bouton « Recevoir un code » : supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` } }), puis navigation vers /verify ;
   - petit texte en bas sur les conditions d'utilisation et la confidentialité.
4. /verify (maquette 3) :
   - logo animé et « Entre le code envoyé à {email} » ;
   - 6 cases pour les chiffres : clavier numérique, passage automatique à la case suivante, collage du code complet accepté, validation automatique au 6e chiffre avec supabase.auth.verifyOtp({ email, token, type: 'email' }) ;
   - la phrase « Tu peux aussi toucher le lien reçu dans l'e-mail » (le lien fonctionne via /auth/callback) ;
   - « Renvoyer le code », désactivé 60 secondes avec le décompte affiché, et « Modifier l'adresse e-mail » ;
   - messages en français : code incorrect, code expiré, trop de tentatives (attendre une minute).
5. /auth/callback : écran de démarrage pendant le traitement. Si l'URL contient un code, appeler supabase.auth.exchangeCodeForSession(code). Si elle contient error ou error_description, retourner sur /login avec le message.
6. Redirection après connexion, depuis /verify ou /auth/callback : si profile.onboarding_done_at est vide, aller sur /onboarding ; sinon aller sur /.
7. Composant ProtectedRoute :
   - sans session, rediriger vers /login ;
   - profil non terminé, rediriger vers /onboarding ;
   - utilisateur connecté qui ouvre /login ou /verify, rediriger vers /.

À la fin, dis-moi comment tester avec mon adresse e-mail.
```

---

## Étape 4 — Profil en 4 étapes

```text
Crée /onboarding en reprenant exactement la maquette « 4- champs a remplir inscription 2 » : barre de progression en haut, boutons Retour et Continuer en bas, résumé à la fin.

- Étape 1 :
  - photo : celle de Google par défaut, sinon choix d'une image recadrée en carré, compressée en JPEG de 512 px, envoyée dans le bucket avatars à {user_id}/avatar.jpg et affichée avec une URL signée ;
  - prénom, nom, date de naissance (pas dans le futur, âge entre 10 et 110 ans) ;
  - nationalité : liste avec recherche, « Malgache » en premier.
- Étape 2 : situation (étudiant, travailleur, aucun des deux, avec filière ou métier facultatif) et croyance (dans l'ordre : chrétien, islam, judaïsme, hindouisme, bouddhisme, croyances traditionnelles, autre, rien, avec précision facultative).
- Avant l'étape 3 : écran de consentement aux données de santé (« J'accepte que LifeBook utilise mes données de santé pour adapter mon programme »), avec les choix « J'accepte » et « Passer cette étape ». L'acceptation remplit profiles.health_consent_at ; « Passer » saute les étapes 3 et 4.
- Étape 3 : santé, comme dans la maquette.
  - IMC calculé en direct avec sa catégorie ;
  - tension calculée en direct avec sa classification ;
  - fonctions pures dans src/utils/health.ts, avec des tests.
- Étape 4 : antécédents familiaux (cancer, diabète, AVC, hypertension, maladie cardiaque), avec la question « qui ? » si la réponse est oui, et un champ « autre ».

Enregistre dans Supabase à chaque « Continuer » (profiles, health_profiles, family_history) et mets à jour onboarding_step pour pouvoir reprendre. Le dernier bouton remplit onboarding_done_at, appelle refreshProfile(), puis va sur /.
```

---

## Étape 5 — Accueil

```text
Crée l'accueil (/) en reprenant maquettes/5- Ecran d accueil.html, avec les vraies données de Supabase.

1. src/utils/life.ts, fonctions pures avec des tests :
   - semaines vécues et restantes ;
   - jours épuisés et restants ;
   - compte à rebours jusqu'à la date de naissance + espérance de vie ;
   - semaines restantes à dormir : semaines restantes × heures de sommeil / 24 ;
   - semaines restantes à travailler : semaines jusqu'à la retraite × heures de travail / 168 ;
   - temps libre restant.
2. src/utils/now.ts, fonction pure pickNow(tasks, maintenant) avec des tests. Parmi les tâches du jour qui ont une heure de début et ne sont pas faites (fin par défaut : début + 1 h) :
   - `now` : la tâche en cours ;
   - `late` : sinon, la dernière tâche dont la fin est passée ;
   - `next` : sinon, la prochaine tâche ;
   - `done` : sinon, si toutes les tâches du jour sont faites ;
   - `free` : sinon.
   Ajoute la fonction phrase(titre, état) : « Tu devrais être en train de … maintenant » si le titre commence par un verbe à l'infinitif, sinon « Maintenant, place à : … ».
3. En-tête :
   - « Bonjour {prénom} · {date} » ;
   - compte à rebours jours : heures : min : sec, en vert citron lumineux, mis à jour chaque seconde ;
   - « Il te reste X semaines » ;
   - frise horizontale des jours épuisés et restants, avec le repère « aujourd'hui » ;
   - fond de particules animées en canvas.
4. Recommandation santé : cadre orange qui pulse.
   - Texte : « Faisons un petit sport de {durée} avant ta tâche suivante {raison} ». La durée correspond au temps libre avant la prochaine tâche (entre 10 et 60 min).
   - Raison selon les antécédents et la santé (AVC, tension, diabète, cœur, stress). Elle change toutes les 6 secondes, en commençant par les risques réels de l'utilisateur.
   - Mention « Réf. OMS : au moins 150 min d'activité physique par semaine ».
   - Pas de sport intense proposé en cas de tension très élevée, de maladie cardiaque, de grossesse, de drépanocytose ou d'épilepsie : afficher plutôt « Demande à ton médecin quels efforts te conviennent ».
   - Un appui ouvre la liste d'activités ; « Ajouter » crée la tâche dans le premier créneau libre.
5. Cercle « Maintenant » (composant NowRing en SVG) :
   - anneau de progression, anneau en pointillés qui tourne, halo qui pulse ;
   - vert pour `now`, orange pendant les 10 dernières minutes, rouge pour `late` ;
   - compte à rebours au centre et phrase en dessous ;
   - boutons « Tâche terminée » (remplit done_at) et « Faire plus tard » (panneau du bas : 15 min, 30 min, 1 h, ce soir 19:00, demain même heure ; la durée est conservée et postponed_count augmente) ;
   - état recalculé toutes les 15 secondes et à chaque changement de tâche.
6. Programme du jour (tâche en cours encadrée en vert), boutons « Planifier ma journée » et « Mon rapport », lien « Programme précédent », objectifs urgents.
7. Bouton « Mon résumé » en haut à droite : panneau avec les semaines à dormir, à travailler, le temps libre, l'état de santé (dernier wellbeing_pct, modifiable avec un curseur), les objectifs atteints et à atteindre.
```

---

## Étape 6 — Planifier ma journée

```text
Crée /jour en reprenant maquettes/A- planifier Ma journée LifeBook.html, avec Supabase.

- Bandeau des 7 jours avec un point sur les jours qui ont des tâches, navigation entre semaines, bouton « Aujourd'hui ». La date choisie est dans l'URL (/jour?date=AAAA-MM-JJ).
- Intention du jour et 3 priorités : table plans, avec period = 'day'.
- Résumé : heures planifiées, heures libres (16 h d'éveil), tâches faites, barre de répartition par catégorie.
- Frise de 05:00 à 24:00, 64 px par heure :
  - blocs colorés par catégorie ;
  - tâches qui se chevauchent côte à côte ;
  - ligne de l'heure actuelle ;
  - appui sur une heure vide pour ajouter ;
  - appui sur un bloc pour le modifier ;
  - case en haut à droite d'un bloc pour le cocher.
- Bouton + flottant, panneau d'ajout ou de modification :
  - nom, catégorie (8 tuiles), début, fin, durées rapides ;
  - rappel, objectif lié ;
  - répétition : une seule fois, tous les jours, du lundi au vendredi, chaque semaine. Une ligne est créée par occurrence pendant 8 semaines, avec le même recurrence_group, et à la suppression on demande « cette occurrence seulement » ou « toutes les suivantes ».
- Validation : la fin doit être après le début. Si le créneau en chevauche un autre, prévenir sans bloquer.
- Rapport du jour en bas, dans un bloc dépliable (table reports, period = 'day') : humeur, état de santé en %, ce que j'ai accompli, ce que j'ai appris, ce qui a bloqué, demain je commence par.
```

---

## Étape 7 — Semaine, mois et année

```text
Crée trois écrans avec Supabase, en reprenant les maquettes D (semaine), C (mois) et B (année).

/semaine :
- thème et 3 priorités (plans, period = 'week', period_start = lundi) ;
- résumé et répartition par catégorie ;
- vue sur 7 colonnes de 06:00 à 22:00, puis détail jour par jour dépliable ;
- ajout avec répétition ;
- bilan de la semaine (reports, period = 'week').

/mois :
- défi et 3 objectifs du mois (plans, period = 'month') ;
- calendrier avec des points pour les tâches et pour les échéances d'objectifs ; un appui sur un jour ouvre un panneau avec ses tâches et un ajout rapide ;
- focus de chaque semaine (plans.extra.weeks) ;
- suivi des habitudes : tables habits et habit_logs, une case par jour, avec la série de jours d'affilée.

/annee :
- mot de l'année (plans, period = 'year') et semaines restantes ;
- les 52 semaines, avec la semaine actuelle et les échéances ;
- objectifs de l'année par domaine (goals, level = 'year'), avec filtres et ajout ;
- onglets T1 à T4 : focus du trimestre (plans, period = 'quarter') et étapes (goal_steps) ;
- les 12 mois : un appui ouvre un panneau des étapes du mois, avec ajout.

Ajoute des flèches pour passer d'une période à l'autre sur chaque écran, et un résumé en haut.
```

---

## Étape 8 — Ma vie et objectifs

```text
Crée /vie en reprenant maquettes/E- Ma vie LifeBook.html, avec Supabase (life_plan, goals avec level = 'life' et target_age, bucket_items).

- En-tête :
  - semaines restantes et barre de vie ;
  - années restantes ;
  - grandes étapes faites sur le total ;
  - rêves réalisés sur le total.
- Mission de vie et valeurs (5 au maximum, enregistrées après une pause dans la saisie).
- Roue de la vie : 8 domaines notés de 1 à 10, graphique SVG en toile d'araignée, domaine le plus faible signalé.
- Grandes étapes classées par période (0-19, 20-29, 30-39, 40-49, 50-59, 60 et plus), avec la période actuelle marquée « tu es ici ». Ajout (titre, âge, domaine), case à cocher, suppression.
- Grille de vie en canvas : une case par semaine, avec les étapes futures en couleur. Un appui sur une case affiche l'âge, l'année et les étapes prévues.
- Liste « Avant de mourir, je veux… » et texte « Ce que je veux laisser ».

Ajoute la règle commune à tous les objectifs dans src/utils/goals.ts, avec des tests :
- statut (late, urgent, soon, ok, done) ;
- « Reste X semaines » ;
- progression : étapes et tâches liées.
```

---

## Étape 9 — Programme précédent, rapports et journal de santé

```text
1. /precedent : deux onglets, Journées et Semaines.
   - Chaque élément affiche le pourcentage de tâches faites dans un anneau, l'humeur et un extrait du rapport.
   - Un appui ouvre le jour ou la semaine.
   - Chargement par pages de 20 éléments.
2. /rapport : écrire ou modifier le rapport du jour, avec un lien vers le bilan de la semaine.
3. Journal de santé, accessible depuis « Mon résumé » :
   - ajout d'une mesure (tension, poids, pouls, sommeil, bien-être) ;
   - historique ;
   - courbes simples en SVG pour la tension et le poids ;
   - classification de la tension avec l'alerte « consulte rapidement » quand elle est très élevée.
```

---

## Étape 10 — Plus tard : installation et notifications

```text
Rends LifeBook installable sur le téléphone avec vite-plugin-pwa :
- manifeste : nom LifeBook, couleurs #060806, icônes 192 et 512 px à partir de public/logo.png ;
- mise en cache de l'application pour qu'elle s'ouvre sans réseau ;
- indicateur « Hors ligne ».

Puis ajoute les notifications : rappel avant une activité, début d'une activité, retard, rapport du soir à 21:00, planification de la semaine le dimanche à 19:00. Explique-moi d'abord les options possibles (notifications web avec une Edge Function Supabase et pg_cron) avant d'écrire le code.
```
