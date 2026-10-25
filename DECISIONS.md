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
