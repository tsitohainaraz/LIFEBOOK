import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { BOARD_COLORS, inviteLink } from './boardUtils';
import { memberName, useBoardMutations, useLeaveBoard, type BoardData } from './useBoards';
import styles from './Boards.module.css';

const ROLE_LABEL = { owner: 'Propriétaire', member: 'Membre', viewer: 'Observateur' } as const;

export function MembersSheet({ data, online, onClose }: { data: BoardData; online: Set<string>; onClose: () => void }) {
  const { user } = useAuth();
  const m = useBoardMutations(data.board.id);
  const leave = useLeaveBoard();
  const toast = useToast();
  const navigate = useNavigate();
  const isOwner = data.myRole === 'owner';
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const [link, setLink] = useState('');

  async function makeLink(): Promise<string | null> {
    try {
      const token = await m.createInvite.mutateAsync(role);
      const l = inviteLink(window.location.origin, token);
      setLink(l);
      return l;
    } catch {
      toast("Le lien d'invitation n'a pas pu être créé.");
      return null;
    }
  }

  async function copy() {
    const l = link || (await makeLink());
    if (!l) return;
    try {
      await navigator.clipboard.writeText(l);
      toast('Lien copié');
    } catch {
      toast('Copie impossible : sélectionne le lien ci-dessous.');
    }
  }

  async function share() {
    const l = link || (await makeLink());
    if (!l) return;
    const text = `Rejoins mon tableau « ${data.board.title} » sur LifeBook`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'LifeBook', text, url: l });
        return;
      } catch {
        /* partage annulé : on copie à la place */
      }
    }
    await copy();
  }

  return (
    <Sheet title="Membres" onClose={onClose}>
      <div className="list">
        {data.members.map((mm) => (
          <div key={mm.user_id} className="item">
            <Avatar name={memberName(mm)} avatar={mm.profile?.avatar_url} size={36} online={online.has(mm.user_id)} />
            <div className="t">
              <span>
                {memberName(mm)}
                {mm.user_id === user?.id ? ' (toi)' : ''}
              </span>
              <small>{online.has(mm.user_id) ? 'en ligne' : ROLE_LABEL[mm.role]}</small>
            </div>
            {isOwner && mm.role !== 'owner' ? (
              <>
                <select
                  aria-label={`Rôle de ${memberName(mm)}`}
                  value={mm.role}
                  style={{ width: 'auto' }}
                  onChange={(e) =>
                    m.setRole.mutate(
                      { userId: mm.user_id, role: e.target.value as 'member' | 'viewer' },
                      { onSuccess: () => toast('Rôle mis à jour'), onError: () => toast('Impossible de changer le rôle.') },
                    )
                  }
                >
                  <option value="member">Membre</option>
                  <option value="viewer">Observateur</option>
                </select>
                <button
                  type="button"
                  className="x"
                  aria-label={`Retirer ${memberName(mm)}`}
                  onClick={() => m.removeMember.mutate(mm.user_id, { onSuccess: () => toast('Membre retiré') })}
                >
                  ✕
                </button>
              </>
            ) : (
              <span className="chip">{ROLE_LABEL[mm.role]}</span>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="card">
          <div className="label">Inviter avec un lien</div>
          <label className="field">
            <span>Rôle de la personne invitée</span>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as 'member' | 'viewer');
                setLink('');
              }}
            >
              <option value="member">Membre (peut modifier)</option>
              <option value="viewer">Observateur (lecture seule)</option>
            </select>
          </label>
          <div className="grid2">
            <button type="button" className="btn" onClick={() => void copy()} disabled={m.createInvite.isPending}>
              Copier le lien
            </button>
            <button type="button" className="btn primary" onClick={() => void share()} disabled={m.createInvite.isPending}>
              Partager
            </button>
          </div>
          {link && (
            <input readOnly value={link} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} className="mono small" />
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Le lien est valable 7 jours, pour une seule personne.
          </p>
        </div>
      )}

      {!isOwner && (
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            leave.mutate(data.board.id, {
              onSuccess: () => {
                toast('Tu as quitté le tableau');
                onClose();
                navigate('/tableaux', { replace: true });
              },
              onError: () => toast('Impossible de quitter le tableau.'),
            })
          }
        >
          Quitter le tableau
        </button>
      )}
    </Sheet>
  );
}

export function LabelsSheet({ data, onClose }: { data: BoardData; onClose: () => void }) {
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const canEdit = data.myRole !== 'viewer';
  const [name, setName] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[1]);
  return (
    <Sheet title="Étiquettes" onClose={onClose}>
      <div className="list">
        {data.labels.length === 0 && <p className="empty">Aucune étiquette. Crée-en une pour trier les cartes (Urgent, Design…).</p>}
        {data.labels.map((l) => (
          <div key={l.id} className="item">
            <span className={styles.labelChip} style={{ '--c': l.color } as CSSProperties}>
              <i />
              {l.name || 'Sans nom'}
            </span>
            <span style={{ flex: 1 }} />
            {canEdit && (
              <button type="button" className="x" aria-label={`Supprimer l'étiquette ${l.name}`} onClick={() => m.deleteLabel.mutate(l.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          className="list"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await m.addLabel.mutateAsync({ name: name.trim(), color });
              setName('');
              toast('Étiquette ajoutée');
            } catch {
              toast("L'étiquette n'a pas pu être ajoutée.");
            }
          }}
        >
          <label className="field">
            <span>Nouvelle étiquette</span>
            <input maxLength={40} placeholder="Ex. Urgent" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className={styles.colors} role="radiogroup" aria-label="Couleur">
            {BOARD_COLORS.concat('#ff6161').map((c) => (
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
          <button className="btn primary" type="submit" disabled={m.addLabel.isPending}>
            Ajouter
          </button>
        </form>
      )}
    </Sheet>
  );
}
