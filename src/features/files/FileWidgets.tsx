import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useToast } from '../../components/Toast';
import type { AttachmentRow } from '../../types/database';
import { ACCEPT, formatBytes, validateFile } from './fileRules';
import { deleteAttachment, signedUrl } from './upload';
import { useSignedUrl, type UploadItem } from './useFiles';
import styles from './Files.module.css';

/** Deux boutons : galerie ou fichiers, et appareil photo. */
export function FilePicker({ onFiles, disabled, compact }: { onFiles: (files: File[]) => void; disabled?: boolean; compact?: boolean }) {
  const toast = useToast();
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const handle = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const ok: File[] = [];
    for (const f of files) {
      const err = validateFile(f);
      if (err) toast(err);
      else ok.push(f);
    }
    if (ok.length) onFiles(ok);
  };
  return (
    <span className={styles.picker}>
      <input ref={pick} type="file" multiple accept={ACCEPT} className={styles.hidden} onChange={(e) => (handle(e.target.files), (e.target.value = ''))} />
      <input
        ref={camera}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className={styles.hidden}
        onChange={(e) => (handle(e.target.files), (e.target.value = ''))}
      />
      <button type="button" className={compact ? 'iconbtn' : 'btn sm'} aria-label="Joindre un fichier" disabled={disabled} onClick={() => pick.current?.click()}>
        📎{compact ? '' : ' Fichier'}
      </button>
      <button type="button" className={compact ? 'iconbtn' : 'btn sm'} aria-label="Prendre une photo ou une vidéo" disabled={disabled} onClick={() => camera.current?.click()}>
        📷{compact ? '' : ' Photo'}
      </button>
    </span>
  );
}

export function UploadQueue({ items, onCancel, onDismiss }: { items: UploadItem[]; onCancel: (id: string) => void; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="list" style={{ gap: 6 }}>
      {items.map((i) => (
        <div key={i.id} className={styles.upload}>
          <div className={styles.uploadTop}>
            <span className={styles.uploadName}>{i.name}</span>
            {i.error ? (
              <button type="button" className="x" aria-label="Fermer" onClick={() => onDismiss(i.id)}>
                ✕
              </button>
            ) : i.done ? (
              <span className="lime small">✓</span>
            ) : (
              <button type="button" className="linkbtn" style={{ minHeight: 32, padding: 0, fontSize: 12 }} onClick={() => onCancel(i.id)}>
                Annuler
              </button>
            )}
          </div>
          {i.error ? (
            <p className="error-text" style={{ fontSize: 12 }}>
              {i.error}
            </p>
          ) : (
            <div className="prog" aria-label={`Envoi ${Math.round(i.progress * 100)} %`}>
              <i style={{ width: `${Math.round(i.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const isImage = (a: AttachmentRow) => (a.mime ?? '').startsWith('image/');
const isVideo = (a: AttachmentRow) => (a.mime ?? '').startsWith('video/');

function Thumb({ a, onOpen }: { a: AttachmentRow; onOpen: () => void }) {
  const url = useSignedUrl(isImage(a) ? a.path : a.thumb_path).data;
  const name = a.path.split('/').pop() ?? 'fichier';
  if (isImage(a) || isVideo(a)) {
    return (
      <button type="button" className={styles.thumb} onClick={onOpen} aria-label={isVideo(a) ? 'Lire la vidéo' : 'Voir la photo'}>
        {url ? <img src={url} alt="" loading="lazy" /> : <span className={styles.ph}>{isVideo(a) ? '🎬' : '🖼'}</span>}
        {isVideo(a) && <span className={styles.play}>▶{a.duration_s ? ` ${Math.floor(a.duration_s / 60)}:${String(a.duration_s % 60).padStart(2, '0')}` : ''}</span>}
      </button>
    );
  }
  return (
    <button type="button" className={styles.doc} onClick={onOpen}>
      <span aria-hidden="true">📄</span>
      <span className={styles.docName}>{name}</span>
      <small>{formatBytes(a.size_bytes)}</small>
    </button>
  );
}

/** Galerie de pièces jointes ; photos et vidéos s'ouvrent en plein écran, les documents dans un nouvel onglet. */
export function Gallery({ items, canDelete }: { items: AttachmentRow[]; canDelete?: (a: AttachmentRow) => boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const media = items.filter((a) => isImage(a) || isVideo(a));
  if (!items.length) return null;

  async function openDoc(a: AttachmentRow) {
    // Fenêtre ouverte tout de suite (sinon bloquée), puis dirigée vers l'URL signée.
    const w = window.open('', '_blank');
    if (w) w.opener = null;
    try {
      const url = await signedUrl(a.path);
      if (w) w.location.href = url;
      else toast('Autorise les fenêtres pour ce site afin d’ouvrir le document.');
    } catch {
      w?.close();
      toast("Le document n'a pas pu être ouvert.");
    }
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((a) => (
          <Thumb key={a.id} a={a} onOpen={() => (isImage(a) || isVideo(a) ? setOpen(media.indexOf(a)) : void openDoc(a))} />
        ))}
      </div>
      {open != null && media[open] && (
        <Viewer
          items={media}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={
            canDelete && canDelete(media[open])
              ? async () => {
                  try {
                    await deleteAttachment(media[open]);
                    void qc.invalidateQueries({ queryKey: ['attachments'] });
                    toast('Fichier supprimé');
                    setOpen(null);
                  } catch {
                    toast('La suppression a échoué.');
                  }
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function Viewer({
  items,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  items: AttachmentRow[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const a = items[index];
  const url = useSignedUrl(a.path).data;
  const startX = useRef<number | null>(null);
  const go = (d: number) => onIndex((index + d + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const onTouchStart = (e: TouchEvent) => (startX.current = e.touches[0]?.clientX ?? null);
  const onTouchEnd = (e: TouchEvent) => {
    if (startX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX.current) - startX.current;
    if (Math.abs(dx) > 50 && items.length > 1) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  return createPortal(
    <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="Visionneuse" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className={styles.viewerTop}>
        <span className="mono small">
          {index + 1} / {items.length}
        </span>
        <span className="row">
          {onDelete && (
            <button type="button" className="btn sm danger" onClick={onDelete}>
              Supprimer
            </button>
          )}
          <button type="button" className="iconbtn" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </span>
      </div>
      <div className={styles.viewerBody}>
        {!url ? (
          <span className="loader" />
        ) : isVideo(a) ? (
          <video key={a.id} src={url} controls playsInline autoPlay className={styles.media} />
        ) : (
          <img key={a.id} src={url} alt="" className={styles.media} />
        )}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className={`${styles.nav} ${styles.prev}`} aria-label="Précédent" onClick={() => go(-1)}>
            ‹
          </button>
          <button type="button" className={`${styles.nav} ${styles.next}`} aria-label="Suivant" onClick={() => go(1)}>
            ›
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
