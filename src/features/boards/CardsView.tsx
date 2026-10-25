import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { nowISO } from '../../lib/serverTime';
import { fmtDate, hhmm, todayISO } from '../../utils/dates';
import { cardDueStatus } from './boardUtils';
import { memberName, useBoardMutations, type BoardData } from './useBoards';
import { useBoardAttachmentCounts } from '../files/useFiles';
import styles from './Boards.module.css';
import type { CardRow } from '../../types/database';

const LIST_PREFIX = 'list:';
const EDGE_PX = 36;
const EDGE_DELAY = 450;

type Columns = Record<string, string[]>;

function buildColumns(data: BoardData): Columns {
  const cols: Columns = {};
  for (const l of data.lists) cols[l.id] = [];
  for (const c of data.cards.slice().sort((a, b) => a.position - b.position)) cols[c.list_id]?.push(c.id);
  return cols;
}

function findContainer(cols: Columns, id: string): string | undefined {
  if (id.startsWith(LIST_PREFIX)) return id.slice(LIST_PREFIX.length);
  return Object.keys(cols).find((k) => cols[k].includes(id));
}

export function CardsView({ data }: { data: BoardData }) {
  const extras = { attachments: useBoardAttachmentCounts(data.board.id).data };
  const canEdit = data.myRole !== 'viewer';
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const lanesRef = useRef<HTMLDivElement>(null);
  const [lane, setLane] = useState(0);
  const [columns, setColumns] = useState<Columns>(() => buildColumns(data));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edge, setEdge] = useState<'left' | 'right' | null>(null);
  const [menuCard, setMenuCard] = useState<CardRow | null>(null);
  const edgeTimer = useRef<ReturnType<typeof setTimeout>>();
  const lists = data.lists;
  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards]);

  // Hors glisser-déposer, les colonnes suivent les données (temps réel, autres appareils).
  useEffect(() => {
    if (!activeId) setColumns(buildColumns(data));
  }, [data, activeId]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const goLane = (i: number) => {
    const el = lanesRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(i, lists.length));
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
    setLane(idx);
  };

  function onScroll() {
    const el = lanesRef.current;
    if (el) setLane(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragMove(e: DragMoveEvent) {
    const start = e.activatorEvent as PointerEvent | TouchEvent;
    const x0 = 'touches' in start ? (start.touches[0]?.clientX ?? 0) : start.clientX;
    const x = x0 + e.delta.x;
    const side = x < EDGE_PX ? 'left' : x > window.innerWidth - EDGE_PX ? 'right' : null;
    if (side !== edge) {
      setEdge(side);
      clearTimeout(edgeTimer.current);
      if (side) {
        // Près du bord : on passe à la liste voisine après un court instant.
        edgeTimer.current = setTimeout(() => {
          setEdge(null);
          goLane(lane + (side === 'left' ? -1 : 1));
        }, EDGE_DELAY);
      }
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    const from = findContainer(columns, a);
    const to = findContainer(columns, o);
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const fromItems = cols[from].filter((id) => id !== a);
      const toItems = cols[to].slice();
      const overIndex = o.startsWith(LIST_PREFIX) ? toItems.length : toItems.indexOf(o);
      toItems.splice(overIndex < 0 ? toItems.length : overIndex, 0, a);
      return { ...cols, [from]: fromItems, [to]: toItems };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    clearTimeout(edgeTimer.current);
    setEdge(null);
    const a = String(e.active.id);
    setActiveId(null);
    const over = e.over ? String(e.over.id) : null;
    const container = findContainer(columns, a);
    const card = cardById.get(a);
    if (!container || !card) return;
    let items = columns[container];
    if (over && !over.startsWith(LIST_PREFIX) && over !== a && items.includes(over)) {
      const oldIndex = items.indexOf(a);
      const newIndex = items.indexOf(over);
      items = items.slice();
      items.splice(oldIndex, 1);
      items.splice(newIndex, 0, a);
    }
    const index = items.indexOf(a);
    // Lâchée à sa place d'origine : rien à enregistrer.
    if (container === card.list_id && buildColumns(data)[container]?.indexOf(a) === index) return;
    const updates = m.planCardMove(a, container, index);
    m.moveCard.mutate(
      { cardId: a, listId: container, index, updates },
      { onError: () => toast("Le déplacement n'a pas pu être enregistré. La carte est revenue à sa place.") },
    );
  }

  const activeCard = activeId ? cardById.get(activeId) : undefined;

  return (
    <>
      <div className={styles.pills} role="tablist" aria-label="Listes">
        {lists.map((l, i) => (
          <button key={l.id} type="button" aria-current={lane === i} onClick={() => goLane(i)}>
            {l.title}
            <small>{(columns[l.id] ?? []).length}</small>
          </button>
        ))}
        {canEdit && (
          <button type="button" aria-current={lane === lists.length} onClick={() => goLane(lists.length)}>
            + Liste
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ threshold: { x: 0, y: 0.15 } }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setEdge(null);
          setColumns(buildColumns(data));
        }}
      >
        <div className={styles.lanes} ref={lanesRef} onScroll={onScroll}>
          {lists.map((l) => (
            <Lane
              key={l.id}
              listId={l.id}
              title={l.title}
              ids={columns[l.id] ?? []}
              data={data}
              canEdit={canEdit}
              attachments={extras?.attachments}
              onMenu={setMenuCard}
            />
          ))}
          {canEdit && <NewLane boardId={data.board.id} onAdded={() => setTimeout(() => goLane(lists.length), 300)} />}
        </div>
        <DragOverlay>
          {activeCard ? <CardFace card={activeCard} data={data} overlay attachments={extras?.attachments} /> : null}
        </DragOverlay>
      </DndContext>

      {edge && <span className={styles.edgeHint} style={edge === 'left' ? { left: 0 } : { right: 0 }} aria-hidden="true" />}
      {menuCard && <CardMenu card={menuCard} data={data} onClose={() => setMenuCard(null)} />}
    </>
  );
}

function Lane({
  listId,
  title,
  ids,
  data,
  canEdit,
  attachments,
  onMenu,
}: {
  listId: string;
  title: string;
  ids: string[];
  data: BoardData;
  canEdit: boolean;
  attachments?: Map<string, number>;
  onMenu: (c: CardRow) => void;
}) {
  const { setNodeRef } = useDroppable({ id: LIST_PREFIX + listId, disabled: !canEdit });
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const byId = new Map(data.cards.map((c) => [c.id, c]));

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await m.addCard.mutateAsync({ listId, title: text.trim() });
      setText('');
    } catch {
      toast("La carte n'a pas pu être ajoutée.");
    }
  }

  return (
    <section className={styles.lane} aria-label={title}>
      <div className={styles.laneInner}>
        <div className={styles.laneHead}>
          <h2>{title}</h2>
          <span className={styles.laneCount}>{ids.length}</span>
        </div>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className={styles.cardList}>
            {ids.length === 0 && <p className="empty">{canEdit ? 'Glisse une carte ici ou ajoute-en une.' : 'Aucune carte.'}</p>}
            {ids.map((id) => {
              const c = byId.get(id);
              return c ? <SortableCard key={id} card={c} data={data} canEdit={canEdit} attachments={attachments} onMenu={onMenu} /> : null;
            })}
          </div>
        </SortableContext>
        {canEdit &&
          (adding ? (
            <form className={styles.addForm} onSubmit={onAdd}>
              <input
                autoFocus
                maxLength={200}
                placeholder="Titre de la carte"
                aria-label="Titre de la nouvelle carte"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => !text.trim() && setAdding(false)}
              />
              <button className="btn primary sm" type="submit" disabled={m.addCard.isPending}>
                Ajouter
              </button>
            </form>
          ) : (
            <button type="button" className={styles.addCard} onClick={() => setAdding(true)}>
              + Ajouter une carte
            </button>
          ))}
      </div>
    </section>
  );
}

function SortableCard({
  card,
  data,
  canEdit,
  attachments,
  onMenu,
}: {
  card: CardRow;
  data: BoardData;
  canEdit: boolean;
  attachments?: Map<string, number>;
  onMenu: (c: CardRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !canEdit });
  const navigate = useNavigate();
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardFace
        card={card}
        data={data}
        dragging={isDragging}
        attachments={attachments}
        onOpen={() => navigate(`/tableaux/${data.board.id}/carte/${card.id}`)}
        onMenu={canEdit ? () => onMenu(card) : undefined}
      />
    </div>
  );
}

export function CardFace({
  card,
  data,
  dragging,
  overlay,
  attachments,
  onOpen,
  onMenu,
}: {
  card: CardRow;
  data: BoardData;
  dragging?: boolean;
  overlay?: boolean;
  attachments?: Map<string, number>;
  onOpen?: () => void;
  onMenu?: () => void;
}) {
  const labels = data.cardLabels.filter((l) => l.card_id === card.id).map((l) => data.labels.find((x) => x.id === l.label_id)).filter(Boolean);
  const members = data.cardMembers.filter((x) => x.card_id === card.id).map((x) => data.members.find((mm) => mm.user_id === x.user_id));
  const checks = data.checklist.filter((i) => i.card_id === card.id);
  const status = cardDueStatus(card, todayISO());
  const files = attachments?.get(card.id) ?? 0;
  return (
    <div className={`${styles.card} ${dragging ? styles.dragging : ''} ${overlay ? styles.overlay : ''} ${card.done_at ? styles.cardDone : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
        aria-label={`Ouvrir la carte ${card.title}`}
      >
        {labels.length > 0 && (
          <span className={styles.labels}>
            {labels.map((l) =>
              l ? (
                <span key={l.id} style={{ '--c': l.color } as CSSProperties}>
                  {l.name || '•'}
                </span>
              ) : null,
            )}
          </span>
        )}
        <span className={styles.cardTitle}>{card.title}</span>
        <span className={styles.cardMeta}>
          {status && card.due_date && (
            <span className={`${styles.due} ${styles[`due_${status}`]}`}>
              {status === 'done' ? '✓ ' : ''}
              {fmtDate(card.due_date, 'd MMM')}
              {card.due_time ? ` ${hhmm(card.due_time)}` : ''}
            </span>
          )}
          {checks.length > 0 && (
            <span className="mono">
              ☑ {checks.filter((i) => i.done_at).length}/{checks.length}
            </span>
          )}
          {files > 0 && <span aria-label={`${files} fichier(s)`}>📎 {files}</span>}
          {members.length > 0 && (
            <span className={styles.avatars} style={{ marginLeft: 'auto' }}>
              {members.slice(0, 3).map((mm) => (mm ? <Avatar key={mm.user_id} name={memberName(mm)} avatar={mm.profile?.avatar_url} size={24} /> : null))}
            </span>
          )}
        </span>
      </button>
      {onMenu && (
        <button
          type="button"
          className={styles.cardMenu}
          aria-label={`Options de la carte ${card.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
        >
          ⋯
        </button>
      )}
    </div>
  );
}

function NewLane({ boardId, onAdded }: { boardId: string; onAdded: () => void }) {
  const m = useBoardMutations(boardId);
  const toast = useToast();
  const [title, setTitle] = useState('');
  return (
    <section className={styles.lane} aria-label="Nouvelle liste">
      <form
        className={`${styles.laneInner} ${styles.newLane}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try {
            await m.addList.mutateAsync(title.trim());
            setTitle('');
            onAdded();
          } catch {
            toast("La liste n'a pas pu être ajoutée.");
          }
        }}
      >
        <h2 style={{ fontSize: 15 }}>+ Ajouter une liste</h2>
        <input maxLength={80} placeholder="Ex. À valider" aria-label="Nom de la liste" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn primary" type="submit" disabled={m.addList.isPending}>
          Ajouter la liste
        </button>
      </form>
    </section>
  );
}

/** Menu d'une carte : déplacer, terminer, archiver. */
function CardMenu({ card, data, onClose }: { card: CardRow; data: BoardData; onClose: () => void }) {
  const m = useBoardMutations(data.board.id);
  const toast = useToast();
  const [listId, setListId] = useState(card.list_id);
  const inTarget = data.cards.filter((c) => c.list_id === listId && c.id !== card.id).sort((a, b) => a.position - b.position);
  const [index, setIndex] = useState(0);
  const doneList = data.lists.find((l) => /^fait$/i.test(l.title.trim()));

  async function move() {
    try {
      await m.moveCard.mutateAsync({ cardId: card.id, listId, index, updates: m.planCardMove(card.id, listId, index) });
      toast('Carte déplacée');
      onClose();
    } catch {
      toast("Le déplacement n'a pas pu être enregistré.");
    }
  }

  return (
    <Sheet title={card.title} onClose={onClose}>
      <div className="list">
        <div className="label">Déplacer vers…</div>
        <div className="grid2">
          <label className="field">
            <span>Liste</span>
            <select
              value={listId}
              onChange={(e) => {
                setListId(e.target.value);
                setIndex(0);
              }}
            >
              {data.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Position</span>
            <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
              {Array.from({ length: inTarget.length + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'En haut' : i === inTarget.length ? 'En bas' : `Position ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary" type="button" onClick={() => void move()} disabled={m.moveCard.isPending}>
          Déplacer
        </button>
      </div>
      <button
        className="btn"
        type="button"
        onClick={async () => {
          const values = card.done_at ? { done_at: null } : { done_at: nowISO(), ...(doneList ? { list_id: doneList.id } : {}) };
          try {
            await m.updateCard.mutateAsync({ id: card.id, values });
            toast(card.done_at ? 'Carte remise en cours' : 'Carte terminée, bravo !');
            onClose();
          } catch {
            toast("Impossible d'enregistrer.");
          }
        }}
      >
        {card.done_at ? 'Remettre en cours' : 'Terminer'}
      </button>
      <button
        className="btn danger"
        type="button"
        onClick={async () => {
          try {
            await m.updateCard.mutateAsync({ id: card.id, values: { archived_at: nowISO() } });
            toast('Carte archivée');
            onClose();
          } catch {
            toast("Impossible d'archiver.");
          }
        }}
      >
        Archiver
      </button>
    </Sheet>
  );
}
