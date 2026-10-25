# LifeBook — instructions permanentes pour Copilot

## Le projet

LifeBook est une application **mobile** de planification de vie. Promesse : « Ta vie tient sur une page ». Tout part du temps qui reste (vie, année, mois, semaine, jour) et l'application dit **quoi faire maintenant**.

- Cahier des fonctionnalités : `FONCTIONNALITES.md`
- Maquettes HTML (référence visuelle et logique) : dossier `/maquettes`
  - `1- Démarrage LifeBook.html` : écran de démarrage
  - `2- Connexion inscription LifeBook.html` : connexion
  - `3- attente Vérification LifeBook.html` : vérification par e-mail
  - `4- champs a remplir inscription 2.html` : profil en 4 étapes
  - `5- Ecran d accueil.html` : accueil et onglets
  - `A- planifier Ma journée LifeBook.html`, `D-Ma semaine LifeBook.html`, `C- Mon mois LifeBook.html`, `B- Mon année LifeBook.html`, `E- Ma vie LifeBook.html`
- Les maquettes contiennent du code de démonstration à **ignorer** : `window.claude`, `localStorage`, données d'exemple marquées « Exemple ». Dans l'application, toutes les données viennent de Supabase.

## Stack

- React 18 + TypeScript (`strict: true`) + Vite
- `react-router-dom` v6
- `@supabase/supabase-js` v2 (Auth, Postgres, Storage)
- `@tanstack/react-query` v5 pour charger et mettre en cache les données
- `date-fns` avec la locale `fr`
- `vitest` pour les tests des fonctions de calcul
- Pas de framework CSS ni de bibliothèque de composants : un fichier `src/styles/tokens.css` (variables CSS) et des CSS Modules par composant
- Serveur de développement sur le **port 3000** (`server: { port: 3000, strictPort: true }` dans `vite.config.ts`)

## Variables d'environnement (`.env.local`, jamais commité)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Ne jamais utiliser ni demander une clé `sb_secret_…` ou `service_role` côté application.

## Organisation des dossiers

```
src/
  lib/supabase.ts          client Supabase typé
  types/database.ts        types des tables
  contexts/AuthContext.tsx session, utilisateur, profil
  hooks/                   un hook par ressource (useTasks, useGoals, usePlan, useReport…)
  utils/                   calculs purs et testés (life.ts, now.ts, dates.ts, health.ts)
  components/              composants réutilisables (BottomTabs, Sheet, Toast, ProgressRing…)
  pages/                   un dossier par écran
  styles/tokens.css        couleurs, polices, rayons
```

## Design

- Couleurs :
  - fond `--bg: #060806` ;
  - surfaces `--surface: #0f130e` et `--surface-2: #161c14` ;
  - bordures `--line: #243020` ;
  - texte `--ink: #f3f6ee`, texte secondaire `--muted: #9ca594` ;
  - case vécue `--lived: #e9eee2`, case vide `--empty: #1d261a` ;
  - accent `--lime: #c6f432` avec texte `--lime-ink: #0b1004` ;
  - retard `--late: #ff6161`, urgent `--urgent: #ffb23d`, info `--soon: #7fb2ff`.
- Catégories :
  - travail `#7fb2ff`, études `#b69cff`, sport `#c6f432`, spirituel `#ffd166` ;
  - santé `#ff8fa3`, famille `#ffb23d`, repos `#6fd3c8`, autre `#a3ad9b`.
- Polices (Google Fonts) : **Sora** pour le texte, **JetBrains Mono** pour les chiffres (`font-variant-numeric: tabular-nums`).
- Mobile uniquement : largeur maximale 480 px centrée, cibles tactiles d'au moins 44 px, marges latérales avec `env(safe-area-inset-*)`.
- Barre d'onglets fixe en bas : Accueil · Journée · Semaine · Mois · Année · Ma vie.
- Fenêtres d'action : panneaux qui montent du bas de l'écran (« bottom sheets »), fermés avec Échap ou un appui sur le fond.
- Animations désactivées si `prefers-reduced-motion: reduce`.

## Règles de code

- TypeScript strict, aucun `any`, composants fonctionnels.
- Textes en **français, avec tutoiement**. Dates au format français, semaine commençant le **lundi**.
- Chaque écran gère trois états : chargement, vide (avec une phrase qui dit quoi faire) et erreur (message clair en français).
- Les calculs (temps restant, statut d'un objectif, activité « maintenant », IMC, tension) sont des **fonctions pures** dans `src/utils`, avec des tests Vitest.
- Les dates de jour sont stockées en `date` (`AAAA-MM-JJ`, date locale) et les heures en `time` (`HH:MM`).
- Toutes les tables ont `user_id uuid default auth.uid()` et la RLS activée avec `user_id = auth.uid()`.
- Après une modification, mettre à jour le cache React Query (mise à jour optimiste pour cocher une tâche).
- Santé : ne jamais poser de diagnostic. Afficher « LifeBook ne remplace pas l'avis d'un médecin » partout où une donnée de santé est interprétée.

## Vocabulaire métier

- **Catégories d'activité :** `travail`, `etudes`, `sport`, `spirituel`, `sante`, `famille`, `repos`, `autre`.
- **Domaines d'objectif :** `sante`, `sport`, `famille`, `relations`, `carriere`, `argent`, `spirituel`, `apprendre`, `voyage`, `loisirs`, `autre`.
- **Statut d'un objectif :**
  - `late` : échéance passée ;
  - `urgent` : 2 semaines ou moins ;
  - `soon` : 8 semaines ou moins ;
  - `ok` : en cours ;
  - `done` : atteint.
- **États de « Maintenant » :**
  - `now` : une activité est en cours ;
  - `late` : une activité aurait dû être terminée ;
  - `next` : la prochaine activité de la journée ;
  - `free` : rien de prévu ;
  - `done` : toutes les activités du jour sont faites.
