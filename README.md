# LifeBook

**Ta vie tient sur une page.** LifeBook part du temps qui te reste (vie, année, mois, semaine, jour) et te dit quoi faire maintenant. Planifie tes journées, fixe tes objectifs, suis tes habitudes et ta santé, écris ton rapport du soir.

Application web mobile : React, TypeScript, Vite et Supabase.

## Démarrer

```bash
npm install
npm run dev
```

L'application s'ouvre sur http://localhost:3000.

## Configuration

Crée un fichier `.env.local` à la racine (il n'est jamais commité) avec ces deux variables :

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Le schéma de la base est dans `supabase/migrations/0001_lifebook.sql` : colle-le dans le SQL Editor de Supabase, puis clique sur Run.

## Autres commandes

```bash
npm run build      # version de production dans dist/
npx vitest run     # tests des fonctions de calcul
```
