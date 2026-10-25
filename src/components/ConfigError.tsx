/** Affiché quand les variables Supabase manquent (fichier .env.local absent, ou variables non définies sur l'hébergeur). */
export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>
        Life<span style={{ color: 'var(--lime)' }}>Book</span>
      </h1>
      <div className="card" role="alert" style={{ borderColor: 'var(--late)' }}>
        <p className="error-text" style={{ fontSize: 15 }}>
          Configuration Supabase manquante : LifeBook ne peut pas démarrer.
        </p>
        <p className="small muted" style={{ margin: 0 }}>Variables à définir :</p>
        <ul className="mono small" style={{ margin: 0, paddingLeft: 18 }}>
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: 0 }}>
          En local : ajoute-les dans le fichier .env.local puis relance « npm run dev ». Sur Vercel : Settings →
          Environment Variables, puis redéploie.
        </p>
      </div>
    </div>
  );
}
