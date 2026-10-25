import type { ReactNode } from 'react';
import { CardsView } from './CardsView';
import { ChatView } from '../chat/ChatView';
import { TeamView } from '../team/TeamReport';
import type { BoardData } from './useBoards';

export type BoardTabId = 'cartes' | 'discussion' | 'equipe';

export interface BoardTab {
  id: BoardTabId;
  label: string;
  badge?: number;
  render: () => ReactNode;
}

/** Onglets du tableau : Cartes · Discussion · Équipe du jour. */
export function boardTabs(data: BoardData, opts: { unread?: number; openReport?: boolean } = {}): BoardTab[] {
  return [
    { id: 'cartes', label: 'Cartes', render: () => <CardsView data={data} /> },
    { id: 'discussion', label: 'Discussion', badge: opts.unread, render: () => <ChatView data={data} /> },
    { id: 'equipe', label: 'Équipe du jour', render: () => <TeamView data={data} openReport={!!opts.openReport} /> },
  ];
}
