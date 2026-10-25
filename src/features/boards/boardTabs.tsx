import type { ReactNode } from 'react';
import { CardsView } from './CardsView';
import { ChatView } from '../chat/ChatView';
import type { BoardData } from './useBoards';
import styles from './Boards.module.css';

export type BoardTabId = 'cartes' | 'discussion' | 'equipe';

export interface BoardTab {
  id: BoardTabId;
  label: string;
  badge?: number;
  render: () => ReactNode;
}

function Waiting({ children }: { children: ReactNode }) {
  return <div className={`card ${styles.placeholder}`}>{children}</div>;
}

/** Onglets du tableau : Cartes · Discussion · Équipe du jour. */
export function boardTabs(data: BoardData, opts: { unread?: number } = {}): BoardTab[] {
  return [
    { id: 'cartes', label: 'Cartes', render: () => <CardsView data={data} /> },
    { id: 'discussion', label: 'Discussion', badge: opts.unread, render: () => <ChatView data={data} /> },
    { id: 'equipe', label: 'Équipe du jour', render: () => <Waiting>Les rapports du jour de l'équipe arrivent bientôt.</Waiting> },
  ];
}
