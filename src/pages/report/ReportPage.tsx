import { Link, useSearchParams } from 'react-router-dom';
import { ReportForm } from '../../components/ReportForm';
import { Icon } from '../../components/Icon';
import { addDaysISO, cap, fmtDate, mondayOf, todayISO } from '../../utils/dates';

const isISO = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Écrire ou modifier le rapport du jour. */
export function ReportPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const date = isISO(params.get('date')) && (params.get('date') as string) <= today ? (params.get('date') as string) : today;
  const go = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  return (
    <>
      <div className="pagehead">
        <div className="label">Programme</div>
        <h1>
          Mon <span>rapport</span>
        </h1>
      </div>
      <div className="navdate">
        <button className="iconbtn" type="button" aria-label="Jour précédent" onClick={() => go(addDaysISO(date, -1))}>
          ‹
        </button>
        <h2>
          {cap(fmtDate(date, 'EEEE d MMMM'))}
          {date === today && (
            <div className="small lime" style={{ fontWeight: 500 }}>
              Aujourd'hui
            </div>
          )}
        </h2>
        <button className="iconbtn" type="button" aria-label="Jour suivant" onClick={() => go(addDaysISO(date, 1))} disabled={date >= today}>
          ›
        </button>
      </div>
      <ReportForm key={date} period="day" periodStart={date} collapsible={false} />
      <Link to={`/semaine?date=${mondayOf(date)}`} className="linkcard">
        <Icon name="week" />
        <div className="t">
          <b>Bilan de la semaine</b>
          <small>Note ta semaine, ta plus belle victoire et ce que tu changes</small>
        </div>
        <span className="mono lime">›</span>
      </Link>
      <Link to={`/jour?date=${date}`} className="linkcard">
        <Icon name="day" />
        <div className="t">
          <b>Voir la journée</b>
          <small>Ton programme et tes priorités de ce jour</small>
        </div>
        <span className="mono lime">›</span>
      </Link>
    </>
  );
}
