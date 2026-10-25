export function Placeholder({ title }: { title: string }) {
  return (
    <div className="pagehead">
      <div className="label">LifeBook</div>
      <h1>{title}</h1>
      <p className="muted small">Écran en préparation.</p>
    </div>
  );
}
