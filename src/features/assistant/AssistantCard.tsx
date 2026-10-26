import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { SUGGESTIONS } from './assistantUtils';
import { useSpeech } from './useSpeech';
import styles from './Assistant.module.css';

export interface AssistantNavState {
  send?: string;
  draft?: string;
  context?: 'home' | 'day' | 'week' | 'life';
  replan?: boolean;
}

/** Carte « Ton assistante » de l'accueil : champ, micro et 4 suggestions. */
export function AssistantCard() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const speech = useSpeech((t) => setText((v) => (v ? `${v} ${t}` : t)));

  const open = (state: AssistantNavState) => navigate('/assistante', { state });

  return (
    <section className={`card ${styles.homeCard}`} aria-label="Ton assistante">
      <div className="row">
        <span className={styles.spark}>
          <Icon name="spark" />
        </span>
        <div className="label">Ton assistante</div>
      </div>
      <form
        className={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) open({ send: text.trim(), context: 'home' });
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Demande-moi de planifier quelque chose…"
          aria-label="Demande à l'assistante"
          maxLength={2000}
        />
        {speech.supported && (
          <button
            type="button"
            className={`iconbtn ${speech.listening ? styles.listening : ''}`}
            aria-label={speech.listening ? 'Arrêter la dictée' : 'Dicter'}
            aria-pressed={speech.listening}
            onClick={speech.toggle}
          >
            <Icon name="mic" />
          </button>
        )}
        <button type="submit" className="iconbtn" aria-label="Envoyer" disabled={!text.trim()}>
          <Icon name="send" />
        </button>
      </form>
      <div className={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={styles.suggestion}
            onClick={() => {
              if (s.key === 'replan') open({ replan: true, context: 'day' });
              else open({ send: s.label, context: 'home' });
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Bouton « Demander à l'assistante » des pages Journée, Semaine et Ma vie. */
export function AskAssistantButton({ context, draft, label = "Demander à l'assistante" }: { context: 'day' | 'week' | 'life'; draft: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" className={`btn outline sm ${styles.ask}`} onClick={() => navigate('/assistante', { state: { context, draft } satisfies AssistantNavState })}>
      <Icon name="spark" /> {label}
    </button>
  );
}
