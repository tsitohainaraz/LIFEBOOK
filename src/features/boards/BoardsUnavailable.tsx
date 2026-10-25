import { Link } from 'react-router-dom';

/** Affiché tant que le SQL des tableaux n'est pas appliqué (tables absentes). */
export function BoardsUnavailable() {
  return (
    <div className="card">
      <h2 style={{ fontSize: 17 }}>Les tableaux ne sont pas encore activés</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Les tableaux d'équipe demandent une mise à jour de la base de données. Le reste de LifeBook fonctionne
        normalement.
      </p>
      <Link className="btn sm" to="/">
        Revenir à l'accueil
      </Link>
    </div>
  );
}
