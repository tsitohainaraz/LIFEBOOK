import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoals } from '../../hooks/useGoals';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { BOARD_COLORS, isMissingTableError } from './boardUtils';
import { BoardsUnavailable } from './BoardsUnavailable';
import { memberName, useCreateBoard, useMyBoards, type Member } from './useBoards';
import { useUnreadCounts } from './unread';
import styles from './Boards.module.css';

export function MemberStack({ members, online, max = 3 }: { members: Member[]; online?: Set<string>; max?: number }) {
  return (
    <span className={styles.avatars}>
      {members.slice(0, max).map((m) => (
        <Avatar key={m.user_id} name={memberName(m)} avatar={m.profile?.avatar_url} size={28} online={online?.has(m.user_id)} />
      ))}
      {members.length > max && <span className={styles.more}>+{members.length - max}</span>}
    </span>
  );
}

export function BoardsPage() {
  const q = useMyBoards();
  const unread = useUnreadCounts();
  const [creating, setCreating] = useState(false);

  if (q.isError && isMissingTableError(q.error)) {
    return (
      <>
        <PageHead />
        <BoardsUnavailable />
      </>
    );
  }

  return (
    <>
      <PageHead />
      <button type="button" className="btn primary" onClick={() => setCreating(true)}>
        <Icon name="plus" strokeWidth={2.4} /> Nouveau tableau
      </button>
      {q.isLoading ? (
        <LoadingState label="Chargement de tes tableaux…" />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger tes tableaux." onRetry={() => void q.refetch()} />
      ) : q.data && q.data.length === 0 ? (
        <div className="card">
          <h2 style={{ fontSize: 16 }}>Aucun tableau pour l'instant</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Un tableau réunit une équipe autour d'un projet : des listes (« À faire », « En cours », « Fait »), des
            cartes à se répartir, une discussion et un rapport du jour. Crée le premier, puis invite ton équipe avec un
            lien.
          </p>
        </div>
      ) : (
        <div className="list">
          {q.data?.map(({ board, cardCount, lateCount, members }) => (
            <Link key={board.id} to={`/tableaux/${board.id}`} className={styles.boardCard} style={{ '--c': board.color } as CSSProperties}>
              <span className={styles.band} aria-hidden="true" />
              <span className={styles.boardBody}>
                <b>{board.title}</b>
                <span className={styles.meta}>
                  <span>
                    {cardCount} carte{cardCount > 1 ? 's' : ''}
                    {lateCount > 0 && <span className={styles.lateTxt}> · {lateCount} en retard</span>}
                    {(unread.data?.get(board.id) ?? 0) > 0 && (
                      <span className="lime"> · {unread.data?.get(board.id)} message(s) non lu(s)</span>
                    )}
                  </span>
                  <MemberStack members={members} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {creating && <NewBoardSheet onClose={() => setCreating(false)} />}
    </>
  );
}

function PageHead() {
  return (
    <div className="pagehead">
      <div className="label">Équipe</div>
      <h1>
        Mes <span>tableaux</span>
      </h1>
    </div>
  );
}

function NewBoardSheet({ onClose }: { onClose: () => void }) {
  const goals = (useGoals().data ?? []).filter((g) => !g.done_at);
  const create = useCreateBoard();
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[0]);
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Donne un nom à ce tableau.');
    try {
      const b = await create.mutateAsync({ title: title.trim(), color, goal_id: goalId || null });
      toast('Tableau créé');
      onClose();
      navigate(`/tableaux/${b.id}`);
    } catch (err) {
      setError(isMissingTableError(err) ? 'Les tableaux ne sont pas encore activés.' : "Le tableau n'a pas pu être créé.");
    }
  }

  return (
    <Sheet title="Nouveau tableau" onClose={onClose}>
      <form className="list" onSubmit={onSubmit} noValidate style={{ gap: 14 }}>
        <label className="field">
          <span>Nom du tableau</span>
          <input maxLength={120} placeholder="Ex. Mémoire de fin d'études" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span>Couleur</span>
          <div className={styles.colors} role="radiogroup" aria-label="Couleur">
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Couleur ${c}`}
                style={{ '--c': c } as CSSProperties}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span>Objectif lié (facultatif)</span>
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Aucun</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" type="submit" disabled={create.isPending}>
          Créer le tableau
        </button>
      </form>
    </Sheet>
  );
}
