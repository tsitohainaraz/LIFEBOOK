import { useState, type CSSProperties } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AutoSaveInput } from '../../components/AutoSaveInput';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { nowISO } from '../../lib/serverTime';
import { isMissingTableError } from './boardUtils';
import { BoardsUnavailable } from './BoardsUnavailable';
import { CardsView } from './CardsView';
import { MemberStack } from './BoardsPage';
import { LabelsSheet, MembersSheet } from './MembersSheet';
import { useBoard, useBoardMutations, type BoardData } from './useBoards';
import { useBoardRealtime } from './useBoardRealtime';
import { boardTabs, type BoardTabId } from './boardTabs';
import styles from './Boards.module.css';

export function BoardPage() {
  const { id } = useParams();
  const q = useBoard(id);
  const online = useBoardRealtime(id);
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('vue') as BoardTabId | null) ?? 'cartes';
  const [sheet, setSheet] = useState<'members' | 'menu' | 'labels' | null>(null);

  if (q.isLoading) return <LoadingState label="Chargement du tableau…" />;
  if (q.isError) {
    return isMissingTableError(q.error) ? (
      <BoardsUnavailable />
    ) : (
      <ErrorState message="Impossible de charger ce tableau." onRetry={() => void q.refetch()} />
    );
  }
  if (!q.data) {
    return (
      <div className="card">
        <p className="small" style={{ margin: 0 }}>
          Ce tableau n'existe plus, ou tu n'en fais pas partie.
        </p>
        <Link className="btn sm" to="/tableaux">
          Mes tableaux
        </Link>
      </div>
    );
  }
  const data = q.data;
  const tabs = boardTabs(data);

  return (
    <>
      <BoardHeader data={data} online={online} onMembers={() => setSheet('members')} onMenu={() => setSheet('menu')} />
      <nav className={styles.tabs} aria-label="Vues du tableau">
        {tabs.map((t) => (
          <Link
            key={t.id}
            to={`?vue=${t.id}`}
            replace
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setSearch(t.id === 'cartes' ? {} : { vue: t.id }, { replace: true });
            }}
          >
            {t.label}
            {t.badge ? <span className={styles.badge}>{t.badge}</span> : null}
          </Link>
        ))}
      </nav>
      {tabs.find((t) => t.id === tab)?.render() ?? <CardsView data={data} />}
      <Outlet context={data} />
      {sheet === 'members' && <MembersSheet data={data} online={online} onClose={() => setSheet(null)} />}
      {sheet === 'labels' && <LabelsSheet data={data} onClose={() => setSheet(null)} />}
      {sheet === 'menu' && <BoardMenu data={data} onLabels={() => setSheet('labels')} onClose={() => setSheet(null)} />}
    </>
  );
}


function BoardHeader({
  data,
  online,
  onMembers,
  onMenu,
}: {
  data: BoardData;
  online: Set<string>;
  onMembers: () => void;
  onMenu: () => void;
}) {
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const isOwner = data.myRole === 'owner';
  return (
    <header className={styles.head} style={{ '--c': data.board.color } as CSSProperties}>
      <Link to="/tableaux" className="small muted" style={{ textDecoration: 'none' }}>
        ‹ Mes tableaux
      </Link>
      <div className={styles.titleRow}>
        <span className={styles.dotColor} aria-hidden="true" />
        {isOwner ? (
          <AutoSaveInput
            key={data.board.id}
            aria-label="Titre du tableau"
            maxLength={120}
            value={data.board.title}
            onSave={(v) => v.trim() && m.updateBoard.mutate({ title: v.trim() }, { onError: () => toast('Titre non enregistré.') })}
          />
        ) : (
          <h1>{data.board.title}</h1>
        )}
        <button type="button" className="iconbtn" aria-label="Menu du tableau" onClick={onMenu}>
          ⋯
        </button>
      </div>
      <div className={styles.headActions}>
        <MemberStack
          members={data.members.slice().sort((a, b) => Number(online.has(b.user_id)) - Number(online.has(a.user_id)))}
          online={online}
          max={5}
        />
        <button type="button" className="btn sm" onClick={onMembers}>
          <Icon name="user" /> Membres
        </button>
      </div>
      {data.myRole === 'viewer' && <p className="muted small" style={{ margin: 0 }}>Tu es observateur : tu vois tout, sans rien modifier.</p>}
    </header>
  );
}

function BoardMenu({ data, onLabels, onClose }: { data: BoardData; onLabels: () => void; onClose: () => void }) {
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const isOwner = data.myRole === 'owner';
  return (
    <Sheet title={data.board.title} onClose={onClose}>
      <button type="button" className="btn" onClick={onLabels}>
        Étiquettes
      </button>
      {isOwner && (
        <>
          <button
            type="button"
            className="btn"
            onClick={() =>
              m.updateBoard.mutate(
                { archived_at: nowISO() },
                {
                  onSuccess: () => {
                    toast('Tableau archivé');
                    navigate('/tableaux', { replace: true });
                  },
                  onError: () => toast("Impossible d'archiver."),
                },
              )
            }
          >
            Archiver le tableau
          </button>
          {!confirm ? (
            <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
              Supprimer le tableau
            </button>
          ) : (
            <div className="list">
              <p className="error-text">Toutes les listes, cartes et discussions de ce tableau seront supprimées, pour tous les membres.</p>
              <button
                type="button"
                className="btn danger"
                style={{ borderColor: 'var(--late)' }}
                onClick={() =>
                  m.deleteBoard.mutate(undefined, {
                    onSuccess: () => {
                      toast('Tableau supprimé');
                      navigate('/tableaux', { replace: true });
                    },
                    onError: () => toast('La suppression a échoué.'),
                  })
                }
              >
                Confirmer la suppression
              </button>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Annuler
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
