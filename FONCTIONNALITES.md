# LifeBook — Fonctionnalités

> Cahier des fonctionnalités pour le développement.
> **Stack :** React + TypeScript, Supabase (Auth, Postgres, Storage, Realtime, Edge Functions).
> **Plateforme :** mobile uniquement.
> **Maquettes de référence :** fichiers 1 à 5 et A à E (à placer dans `/maquettes`).

**Priorités :** **V1** = indispensable au lancement · **V2** = juste après · **V3** = plus tard.

---

## 0. Principes du produit

- **Promesse :** « Ta vie tient sur une page ». Tout part du temps qui reste.
- Chaque écran montre combien de temps il reste : vie, année, mois, semaine, jour, tâche.
- L'application dit **quoi faire maintenant**, pas seulement quoi faire aujourd'hui.
- La planification descend en cascade : **vie → année → mois → semaine → jour → maintenant**.
- Utilisable d'une main ; cibles tactiles d'au moins 44 px.

---

## 1. Démarrage et compte

- [ ] **V1** Écran de démarrage animé (logo, barre de chargement) pendant la récupération de la session.
- [ ] **V1** Création de compte et connexion **sans mot de passe**, avec deux méthodes (Supabase Auth, flux PKCE) :
  - **Google** ;
  - **code à 6 chiffres reçu par e-mail** (ou lien dans le même e-mail), saisi sur l'écran de vérification : « Renvoyer le code » après 60 s, « Modifier l'adresse e-mail ».
- [ ] **V1** L'application fonctionne avec la connexion par e-mail même tant que Google n'est pas configuré (message clair sur le bouton Google en cas d'erreur).
- [ ] **V1** Envoi des e-mails par un service SMTP gratuit (Brevo) branché dans Supabase avant le lancement.
- [ ] **V1** Avec Google : prénom, nom et photo préremplis à partir du compte Google, modifiables dans le profil. Avec l'e-mail : ces champs sont demandés à l'étape 1 du profil.
- [ ] **V1** Session conservée sur le téléphone ; retour direct à l'accueil à la réouverture.
- [ ] **V1** Déconnexion.
- [ ] **V1** Suppression du compte et de toutes ses données.
- [ ] **V2** Connexion avec Apple (obligatoire si l'application est publiée sur l'App Store avec une connexion Google).

## 2. Profil (création en 4 étapes)

- [ ] **V1** Étape 1 : photo de profil (photo Google par défaut, ou nouvelle photo dans Supabase Storage avec recadrage carré), prénom et nom préremplis depuis Google, date de naissance, nationalité (liste avec recherche, « Malgache » en premier).
- [ ] **V1** Étape 2 :
  - situation : Étudiant(e), Travailleur(se), Aucun des deux, avec filière ou métier facultatif ;
  - croyance : Chrétien(ne), Islam, Judaïsme, Hindouisme, Bouddhisme, Croyances traditionnelles, Autre, **Rien**, avec précision facultative.
- [ ] **V1** Étape 3, santé :
  - taille et poids, avec calcul automatique de l'IMC ;
  - tension systolique et diastolique, avec sa classification ;
  - pouls, groupe sanguin, diabète (Non, Type 1, Type 2, Prédiabète, Je ne sais pas) ;
  - problèmes de santé (liste), autre problème, traitements, allergies ;
  - mode de vie : activité physique, sommeil, eau, tabac, alcool.
- [ ] **V1** Étape 4, antécédents familiaux : cancer, diabète, AVC, hypertension, maladie cardiaque → Oui / Non / Je ne sais pas, puis qui (père, mère, frère ou sœur, grands-parents) ; champ « Autre ».
- [ ] **V1** Consentement explicite au traitement des données de santé avant l'étape 3, avec la possibilité de passer cette étape.
- [ ] **V1** Enregistrement à chaque étape, pour reprendre là où l'utilisateur s'est arrêté.
- [ ] **V1** Résumé du profil à la fin.
- [ ] **V1** Paramètres de vie modifiables : espérance de vie (80 ans par défaut), sommeil (h par nuit), travail (h par semaine), âge de la retraite.
- [ ] **V2** Espérance de vie indicative calculée à partir du profil, avec une explication du calcul.

## 3. Accueil

- [ ] **V1** Compte à rebours de vie (jours : heures : min : sec) et « Il te reste X semaines ».
- [ ] **V1** Frise de vie horizontale : jours épuisés et jours restants, avec un repère « aujourd'hui ».
- [ ] **V1** Recommandation santé animée et contextuelle :
  - la durée dépend du temps libre avant la prochaine tâche ;
  - la raison dépend du profil (AVC si antécédent familial d'AVC, tension, diabète, cœur, stress) ;
  - un appui ajoute l'activité au programme.
- [ ] **V1** Cercle « Maintenant » :
  - 5 états : en cours, en retard, à suivre, temps libre, journée accomplie ;
  - anneau de progression et compte à rebours ;
  - passage à l'orange pendant les 10 dernières minutes, au rouge en cas de retard ;
  - phrase du type « Tu devrais être en train de prier maintenant ».
- [ ] **V1** Boutons « Tâche terminée » et « Faire plus tard » : dans 15 min, 30 min, 1 h, ce soir, demain, ou une heure choisie.
- [ ] **V1** Programme du jour, avec l'activité en cours mise en évidence.
- [ ] **V1** Bouton **Mon résumé** en haut à droite : semaines restantes à dormir, à travailler, temps libre restant, état de santé en %, objectifs atteints et à atteindre.
- [ ] **V1** Objectifs urgents et lien vers le programme précédent.
- [x] **V1** Bloc **« À suivre »** sous les boutons du cercle Maintenant :
  - phrase du prochain élément (« Dans 2 h 15, tu dois réviser l'examen selon ton plan »), point de la couleur de la catégorie, horaire, nom du tableau pour une carte ;
  - les 2 éléments suivants en petit (« dans 4 h · Appeler maman ») ;
  - s'il n'y a plus rien aujourd'hui, le premier élément de demain ; sinon « Rien de prévu pour l'instant » et « Planifier demain » ;
  - mis à jour toutes les 30 s, en orange avec un point qui clignote à 15 min ou moins ; un appui ouvre la Journée (ou la carte).
- [x] **V1** Bloc « Mes cartes urgentes » : cartes de tableaux en retard ou dues dans les 48 h.

## 4. Planifier ma journée

- [ ] **V1** Bandeau des 7 jours, navigation entre semaines, bouton « Aujourd'hui ».
- [ ] **V1** Intention du jour et 3 priorités à cocher.
- [ ] **V1** Frise horaire de 05:00 à 24:00 :
  - blocs colorés par catégorie ;
  - ligne de l'heure actuelle ;
  - activités qui se chevauchent placées côte à côte.
- [ ] **V1** Ajouter, modifier ou supprimer une activité : nom, catégorie, début, fin, durées rapides, rappel, objectif lié.
- [ ] **V1** Toucher une heure vide pour y ajouter une activité.
- [ ] **V1** Résumé de la journée : heures planifiées, heures libres, activités faites, répartition par catégorie.
- [ ] **V2** Glisser-déposer pour déplacer ou allonger un bloc.
- [ ] **V2** Alerte de conflit et de journée surchargée.
- [ ] **V2** Proposition, le soir, de reporter les tâches non faites.

**Catégories :** Travail, Études, Sport, Spirituel, Santé, Famille, Repos, Autre. Catégories personnalisées en **V2**.

## 5. Ma semaine

- [ ] **V1** Thème de la semaine, 3 priorités, résumé (jours restants, activités faites, heures planifiées) et répartition par catégorie.
- [ ] **V1** Vue sur 7 colonnes de 06:00 à 22:00, puis détail jour par jour dépliable.
- [ ] **V1** Ajout d'une activité avec répétition : une seule fois, tous les jours, du lundi au vendredi.
- [ ] **V1** Bilan de la semaine : note de 1 à 5, plus belle victoire, ce que j'ai appris, ce que je change.
- [ ] **V2** « Semaine type » réutilisable en un geste.

## 6. Mon mois

- [ ] **V1** Défi du mois et 3 objectifs du mois.
- [ ] **V1** Calendrier avec des points par activité et par échéance d'objectif ; toucher un jour pour voir ou ajouter.
- [ ] **V1** Focus semaine par semaine.
- [ ] **V1** Suivi des habitudes : une case par jour.
- [ ] **V2** Bilan du mois.

## 7. Mon année

- [ ] **V1** Mot de l'année et semaines restantes dans l'année.
- [ ] **V1** Les 52 semaines, avec les semaines où une étape est prévue.
- [ ] **V1** Objectifs de l'année par domaine, avec filtres.
- [ ] **V1** Trimestres T1 à T4 : focus et étapes.
- [ ] **V1** Les 12 mois : toucher un mois pour voir ou ajouter des étapes.
- [ ] **V2** Bilan de l'année généré à partir des statistiques.
- [ ] **V2** Dates annuelles récurrentes (anniversaires, fêtes).

## 8. Ma vie

- [ ] **V1** Mission de vie.
- [ ] **V1** Valeurs : 5 au maximum parmi une liste.
- [ ] **V1** Roue de la vie : 8 domaines notés de 1 à 10, avec le domaine le plus faible signalé.
- [ ] **V1** Grandes étapes par âge, regroupées par période (Grandir, Se construire, Bâtir, Consolider, Transmettre, Profiter).
- [ ] **V1** Grille de vie en semaines, avec les grandes étapes en couleur.
- [ ] **V1** Liste « Avant de mourir, je veux… » et « Ce que je veux laisser ».
- [ ] **V2** Historique de la roue de la vie, pour comparer dans le temps.
- [ ] **V2** Découpage d'une grande étape en objectifs annuels, puis en étapes mensuelles.

## 9. Objectifs et rêves (sur tous les écrans)

- [ ] **V1** Un objectif a un titre, un domaine, une échéance, des étapes et un statut :
  - en retard ;
  - urgent (2 semaines ou moins) ;
  - bientôt (8 semaines ou moins) ;
  - en cours ;
  - atteint.
- [ ] **V1** Affichage « Reste X semaines » sur chaque objectif.
- [ ] **V1** Liaison entre tâches et objectifs ; la progression compte les étapes et les tâches liées.
- [ ] **V1** Un objectif d'un niveau (vie, année, mois, semaine) peut être rattaché à un objectif du niveau supérieur.
- [ ] **V2** Aide pour rendre un objectif mesurable (méthode SMART).
- [ ] **V2** Célébration quand un objectif est atteint.

## 10. Habitudes

- [ ] **V1** Créer une habitude (tous les jours ou jours choisis), la cocher, voir sa série (jours d'affilée) et son taux de réussite.
- [ ] **V2** Rappel par habitude, et habitudes suggérées selon le profil de santé.

## 11. Rapports et programme précédent

- [ ] **V1** Rapport du jour : humeur de 1 à 5, état de santé en %, ce que j'ai accompli, ce que j'ai appris, ce qui a bloqué, par quoi je commence demain.
- [ ] **V1** Programme précédent : journées et semaines passées avec leur % de réalisation et un extrait du rapport.
- [ ] **V2** Recherche dans les rapports.

## 12. Santé et sport

- [ ] **V1** Journal de santé : tension, poids, pouls, sommeil, eau, avec historique et courbes.
- [ ] **V1** Classification de la tension :
  - normale ;
  - normale haute ;
  - élevée ;
  - très élevée, avec le message « consulte rapidement ».
- [ ] **V1** IMC recalculé à chaque nouvelle pesée.
- [ ] **V1** Recommandations d'activité selon le profil : antécédents familiaux, tension, IMC, activité actuelle. Référence OMS : au moins 150 min d'activité modérée par semaine, avec un compteur des minutes de la semaine.
- [ ] **V1** Garde-fous : en cas de tension très élevée, maladie cardiaque, grossesse, drépanocytose ou épilepsie, pas de sport intense proposé et message « demande à ton médecin ».
- [ ] **V2** Programmes sportifs progressifs (par exemple, de la marche jusqu'à courir 5 km).
- [ ] **V2** Rappels d'hydratation.
- [ ] **V3** Connexion à Google Fit et Apple Santé (pas, sommeil).

**Règle :** l'application ne pose jamais de diagnostic. Le message « LifeBook ne remplace pas l'avis d'un médecin » est visible partout où une donnée de santé est interprétée.

## 13. Vie spirituelle (selon la croyance choisie)

- [ ] **V2** Islam : les 5 horaires de prière calculés selon la position (bibliothèque `adhan`), ajoutés au programme avec un rappel.
- [ ] **V2** Chrétien(ne) : culte ou messe hebdomadaire, et temps de prière quotidien proposé.
- [ ] **V2** Autres croyances : temps de prière ou de méditation personnalisable.
- [ ] **V2** « Rien » : aucune proposition spirituelle.
- [ ] **V2** Périodes de jeûne (Ramadan, Carême) qui adaptent le programme et les propositions de sport.

## 14. Notifications et rappels

- [ ] **V1** Rappel avant une activité : aucun, 10 min, 30 min ou 1 h avant.
- [ ] **V1** Notification au début d'une activité : « C'est l'heure de prier ».
- [ ] **V1** Notification de retard, avec les actions « Terminé » et « Plus tard ».
- [ ] **V1** Rappel du soir pour écrire le rapport du jour.
- [ ] **V1** Rappel du dimanche soir pour planifier la semaine.
- [ ] **V1** Alerte quand l'échéance d'un objectif approche.
- [ ] **V1** Réglages : heures calmes et types de notifications activés.

**Note technique :** utiliser Web Push si l'application est une PWA, ou Expo Notifications si elle est faite en React Native. Les envois programmés se font côté Supabase (Edge Function + `pg_cron`).

## 15. Suggestions intelligentes (V2 à V3)

- [ ] **V2** Repérer le temps libre et proposer de le remplir : santé, objectif en retard, domaine faible de la roue de la vie.
- [x] **V2** Placer automatiquement les étapes d’un objectif dans les créneaux libres (planification guidée, section 27).
- [ ] **V3** Bilan hebdomadaire rédigé automatiquement.
- [x] **V3** Assistant conversationnel : « Planifie ma semaine » (voir section 27).

## 16. Statistiques

- [ ] **V1** Taux de réalisation par jour, semaine et mois, et temps passé par catégorie.
- [ ] **V2** Tendances de l'humeur, de la santé et du sommeil, avec des liens simples (« Les jours où tu fais du sport, ton humeur est meilleure »).

## 17. Motivation

- [ ] **V2** Séries (jours planifiés, rapports écrits), badges sobres, citations.
- [ ] **V3** Partenaire de motivation : partager un objectif et recevoir des encouragements.

## 18. Répétitions et modèles

- [ ] **V1** Répétition d'une activité : tous les jours, jours ouvrés, jours choisis chaque semaine, chaque mois, chaque année, jusqu'à une date.
- [ ] **V2** Routines du matin et du soir ajoutées en un geste ; modèles de journée et de semaine.

## 19. Agenda et données

- [ ] **V2** Synchronisation avec Google Agenda (lecture d'abord).
- [ ] **V2** Export au format `.ics` et export de toutes les données (JSON).
- [ ] **V1** Gestion du fuseau horaire : stocker les dates en UTC avec le fuseau du profil.

## 20. Paramètres

- [ ] **V1** Modifier le profil, la santé, les paramètres de vie et les notifications.
- [ ] **V1** Thème sombre par défaut, langue française.
- [ ] **V2** Langues malgache et anglaise.
- [ ] **V1** Confidentialité, déconnexion, suppression du compte.

## 21. Hors ligne et synchronisation

- [ ] **V1** L'application fonctionne sans réseau (données en cache) et se synchronise au retour de la connexion.
- [ ] **V1** Indicateur « Enregistré » ou « Hors ligne ».
- [ ] **V2** Mise à jour en temps réel sur plusieurs appareils (Supabase Realtime).

## 22. Sécurité et confidentialité

- [ ] **V1** RLS (Row Level Security) activée sur toutes les tables, avec la règle `user_id = auth.uid()`.
- [ ] **V1** Bucket des photos privé, accès par URL signée.
- [ ] **V1** Données de santé dans des tables séparées, consentement daté, suppression complète possible.
- [ ] **V1** Aucune donnée de santé dans les journaux techniques ni dans les outils de statistiques.

## 23. Design

- **Couleurs :**
  - fond `#060806` ;
  - surfaces `#0f130e` et `#161c14` ;
  - bordures `#243020` ;
  - texte `#f3f6ee`, texte secondaire `#9ca594` ;
  - accent vert citron `#c6f432` ;
  - retard `#ff6161`, urgent `#ffb23d`, info `#7fb2ff`.
- **Polices :** Sora pour le texte, JetBrains Mono pour les chiffres.
- **Couleurs des catégories :** Travail `#7fb2ff`, Études `#b69cff`, Sport `#c6f432`, Spirituel `#ffd166`, Santé `#ff8fa3`, Famille `#ffb23d`, Repos `#6fd3c8`, Autre `#a3ad9b`.
- **Barre d'onglets :** Accueil · Journée · Semaine · Mois · Année · Ma vie.
- **Accessibilité :** contraste AA et animations coupées si le téléphone demande de réduire les animations.

## 24. Modèle de données Supabase (proposition)

| Table | Champs principaux |
|---|---|
| `profiles` | `id` (= `auth.uid()`), `first_name`, `last_name`, `birth_date`, `nationality`, `avatar_path`, `status`, `status_detail`, `faith`, `faith_detail`, `life_expectancy`, `sleep_hours`, `work_hours`, `retire_age`, `timezone`, `locale`, `onboarding_step` |
| `health_profiles` | `user_id`, `height_cm`, `weight_kg`, `blood_type`, `diabetes`, `conditions[]`, `other_condition`, `medications`, `allergies`, `activity_level`, `smoking`, `alcohol`, `water_l`, `consent_at` |
| `health_logs` | `id`, `user_id`, `logged_at`, `systolic`, `diastolic`, `pulse`, `weight_kg`, `sleep_h`, `wellbeing_pct` |
| `family_history` | `user_id`, `disease`, `answer`, `relatives[]`, `other` |
| `goals` | `id`, `user_id`, `title`, `domain`, `level` (life, year, month, week), `deadline`, `target_age`, `parent_goal_id`, `done_at` |
| `goal_steps` | `id`, `goal_id`, `title`, `due_date`, `done` |
| `tasks` | `id`, `user_id`, `date`, `start_time`, `end_time`, `title`, `category`, `is_priority`, `done_at`, `goal_id`, `reminder_min`, `recurrence_id`, `postponed_count` |
| `recurrences` | `id`, `user_id`, `rule` (format RRULE), `until` |
| `habits` / `habit_logs` | habitude ; un enregistrement par jour coché |
| `plans` | `id`, `user_id`, `period` (day, week, month, quarter, year), `period_start`, `theme`, `priorities` (jsonb) |
| `reports` | `id`, `user_id`, `period`, `period_start`, `mood`, `wellbeing_pct`, `wins`, `lessons`, `blockers`, `next` |
| `life_plan` | `user_id`, `mission`, `values[]`, `wheel` (jsonb), `legacy` |
| `bucket_items` | `id`, `user_id`, `title`, `done_at` |
| `notification_settings` | `user_id`, types activés, heures calmes, jetons d'envoi |

## 25. Ordre de développement conseillé

1. Connexion (Google et code par e-mail), profil en 4 étapes, paramètres de vie.
2. Tâches de la journée, cercle « Maintenant », écran d'accueil.
3. Objectifs, puis les écrans Semaine, Mois, Année et Ma vie.
4. Rapports et programme précédent.
5. Santé : journal et recommandations.
6. Notifications.
7. Hors ligne, statistiques, vie spirituelle, suggestions intelligentes.

## 26. Tableaux d'équipe (« super Trello »)

- [x] **V1** Mes tableaux (`/tableaux`) : couleur, nombre de cartes, cartes en retard, membres, messages non lus ; création avec titre, couleur et objectif lié.
- [x] **V1** Tableau (`/tableaux/:id`) : onglets **Cartes**, **Discussion**, **Équipe du jour** ; titre modifiable par le propriétaire ; étiquettes ; archiver ou supprimer.
- [x] **V1** Listes « À faire », « En cours », « Fait » créées automatiquement ; une liste par écran, pastilles pour aller à une liste, ajout de listes.
- [x] **V1** Cartes : titre, description, membres assignés, échéance (date et heure), étiquettes, checklist avec progression, fichiers, commentaires avec @mention, historique ; « Marquer comme fait », « Archiver », « Déplacer vers… ».
- [x] **V1** Glisser-déposer des cartes au doigt et à la souris, avec passage à la liste voisine près du bord de l'écran.
- [x] **V1** « Planifier dans ma journée » : crée une tâche liée à la carte dans le premier créneau libre (06:00 à 22:00).
- [x] **V1** Rôles : propriétaire, membre, observateur (lecture seule) ; invitation par lien (7 jours, une personne), partage natif ou copie ; quitter le tableau.
- [x] **V1** Temps réel : cartes, listes, checklists, commentaires et membres ; membres connectés visibles.
- [x] **V1** Fichiers : photos (réduites à 1600 px), vidéos (50 Mo max, miniature), PDF et documents Office (20 Mo max) ; progression et annulation ; visionneuse plein écran ; espace utilisé pour le propriétaire.
- [x] **V1** Discussion : bulles, réponses, fichiers, @mentions, modification et suppression de ses messages, chargement par 30, messages système, compteur de non-lus.
- [x] **V1** Rapport du jour d'équipe : résumé automatique (éléments cochés, cartes terminées, cartes en cours), avancement du tableau, Fait / Bloqué par / Demain, photos ; publié dans la discussion ; onglet « Équipe du jour » par date.
- [x] **V1** Notifications : carte assignée, commentaire, message (une seule notification par tableau), mention, nouveau membre, rapport envoyé, échéance demain, échéance dépassée, rappel du rapport à 18:00 (heure locale) ; cloche et page `/notifications`.
- [x] **V1** Liens avec LifeBook : mes cartes dans la Journée, la Semaine, le Mois, « À suivre » et le cercle Maintenant ; tâche liée à une carte ; progression des objectifs reliés à un tableau.
- [ ] **V2** Notifications push sur le téléphone (étape 10 : Web Push et Edge Function, colonne `notifications.pushed_at` prévue).

**Tables :** `boards`, `board_members`, `board_invites`, `lists`, `cards`, `card_members`, `board_labels`, `card_labels`, `checklist_items`, `card_comments`, `board_activity` (0002_tableaux.sql) ; `attachments`, `messages`, `message_reads`, `mentions`, `daily_reports`, `notifications` (0003_equipe.sql) ; colonne `tasks.card_id` ; bucket privé `board-files`.

## 27. Assistante de planification (IA)

- [x] **V1** Carte « Ton assistante » sur l'accueil, sous le cercle Maintenant : champ, dictée (fr-FR), 4 suggestions ; « Planifier en 3 min » le matin si la journée est vide.
- [x] **V1** Chat plein écran `/assistante` : conversations (liste, suppression), « L'assistante réfléchit… », messages restants, avis Utile / Pas utile (Pas clair, Pas adapté à moi, Faux, Trop long), mention « L'assistante peut se tromper. Elle ne remplace pas l'avis d'un médecin. »
- [x] **V1** Actions proposées, jamais appliquées sans accord : ajouter, déplacer, raccourcir, retirer, modifier une tâche, programme d'une journée, priorités du jour, objectif, étapes, souvenir ; aperçu de la frise ; Appliquer, Ignorer, Tout appliquer.
- [x] **V1** Mode automatique (désactivé par défaut) : changements de tâches appliqués tout de suite, bandeau « N changements appliqués » et Annuler pendant 10 s.
- [x] **V1** Planification guidée `/planifier-demain` : une question par écran (énergie, indispensable, rendez-vous, rêve, sport, réveil, plus tâche bloquée et objectif urgent, 8 au maximum), journée construite par le planificateur, explication, ajustement en langage courant, Valider ou Recommencer ; fonctionne sans IA.
- [x] **V1** Réorganisation de la fin de journée (retard de plus de 30 min ou 2 reports) ; report du soir (Garder, Plus tard, Abandonner) ; « Planifier ma vie avec l'assistante » dans /vie ; « Demander à l'assistante » dans /jour, /semaine et /vie.
- [x] **V1** « Ce que l'assistante sait de moi » : souvenirs, données de santé (résumé en mots, jamais de mesure), mode automatique, Tout effacer.
- [x] **V1** Offre Gratuite (30 messages par jour), Premium (200) « bientôt disponible » avec « Je suis intéressé(e) ».
- [x] **V1** Détresse : détection en français et en malgache avant tout appel, réponse chaleureuse sans action ; contacts d'aide à remplir dans `src/config/helpResources.ts` (vide : aucun numéro inventé).
- [ ] **V2** Numéros d'aide vérifiés pour Madagascar ; Premium payant (Anthropic) ; prières et rendez-vous de planification comme éléments fixes.

**Serveur :** Edge Function `assistant` (Groq `llama-3.3-70b-versatile`, secours OpenRouter, Anthropic pour le premium), modes `chat`, `guided_parse`, `explain_plan`, `adjust_plan`, `replan_rest_of_day` ; dates et heures calculées par le code ; quota par jour local.

**Tables :** `plan_limits`, `ai_conversations`, `ai_messages`, `ai_actions`, `ai_usage`, `ai_memory`, `ai_settings`, `premium_interest`, colonnes `profiles.plan` et `plan_until`, fonctions `ai_quota`, `ai_take_quota`, `get_insights`, vue `ai_stats_daily` (0004_assistante.sql).
