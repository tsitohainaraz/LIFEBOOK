import { supabase } from '../../lib/supabase';
import type { AttachmentRow } from '../../types/database';
import { IMAGE_QUALITY, extensionOf, fitSize, kindOf, storagePath, validateFile } from './fileRules';

const BUCKET = 'board-files';

export interface Prepared {
  blob: Blob;
  ext: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb: Blob | null;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality),
  );
}

/** Photo : 1600 px au plus, JPEG qualité 0,8, orientation EXIF respectée. */
async function prepareImage(file: File): Promise<Prepared> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Repli : les navigateurs récents appliquent aussi l'orientation EXIF aux <img>.
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image illisible'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const w0 = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h0 = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const { width, height } = fitSize(w0, h0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();
  const blob = await canvasToJpeg(canvas, IMAGE_QUALITY);
  return { blob, ext: 'jpg', mime: 'image/jpeg', width, height, duration: null, thumb: null };
}

/** Vidéo : envoyée telle quelle, avec une miniature prise à 1 s. */
async function prepareVideo(file: File): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  const base: Prepared = {
    blob: file,
    ext: extensionOf(file.name) || 'mp4',
    mime: file.type || 'video/mp4',
    width: null,
    height: null,
    duration: null,
    thumb: null,
  };
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Vidéo illisible'));
    });
    base.duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
    base.width = video.videoWidth || null;
    base.height = video.videoHeight || null;
    video.currentTime = Math.min(1, (video.duration || 1) / 2);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 3000);
    });
    const { width, height } = fitSize(video.videoWidth || 640, video.videoHeight || 360, 480);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
    base.thumb = await canvasToJpeg(canvas, 0.7);
  } catch {
    /* pas de miniature : la vidéo reste envoyable */
  } finally {
    URL.revokeObjectURL(url);
  }
  return base;
}

export async function prepareFile(file: File): Promise<Prepared> {
  const kind = kindOf(file);
  if (kind === 'image') return prepareImage(file);
  if (kind === 'video') return prepareVideo(file);
  return {
    blob: file,
    ext: extensionOf(file.name) || 'bin',
    mime: file.type || 'application/octet-stream',
    width: null,
    height: null,
    duration: null,
    thumb: null,
  };
}

/** Envoi dans le Storage avec progression (XMLHttpRequest : supabase-js ne donne pas la progression). */
async function putObject(path: string, blob: Blob, contentType: string, onProgress: (ratio: number) => void, signal: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée : reconnecte-toi.');
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '');
  const url = `${base}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('cache-control', '3600');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envoi refusé (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Pas de connexion internet.'));
    xhr.onabort = () => reject(new DOMException('Envoi annulé', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export interface UploadTarget {
  boardId: string;
  cardId?: string | null;
  messageId?: string | null;
  reportId?: string | null;
}

/** Vérifie, prépare, envoie le fichier puis crée la ligne attachments. */
export async function uploadAttachment(
  file: File,
  target: UploadTarget,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<AttachmentRow> {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);
  const prepared = await prepareFile(file);
  const id = crypto.randomUUID();
  const path = storagePath(target.boardId, id, prepared.ext);
  await putObject(path, prepared.blob, prepared.mime, onProgress, signal);
  let thumbPath: string | null = null;
  if (prepared.thumb) {
    thumbPath = storagePath(target.boardId, `${id}-thumb`, 'jpg');
    const { error } = await supabase.storage.from(BUCKET).upload(thumbPath, prepared.thumb, { contentType: 'image/jpeg' });
    if (error) thumbPath = null;
  }
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      board_id: target.boardId,
      card_id: target.cardId ?? null,
      message_id: target.messageId ?? null,
      report_id: target.reportId ?? null,
      path,
      mime: prepared.mime,
      size_bytes: prepared.blob.size,
      width: prepared.width,
      height: prepared.height,
      duration_s: prepared.duration,
      thumb_path: thumbPath,
    })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path, ...(thumbPath ? [thumbPath] : [])]);
    throw error;
  }
  return data;
}

/** Supprime le fichier (et sa miniature) puis sa ligne. */
export async function deleteAttachment(a: AttachmentRow): Promise<void> {
  await supabase.storage.from(BUCKET).remove([a.path, ...(a.thumb_path ? [a.thumb_path] : [])]);
  const { error } = await supabase.from('attachments').delete().eq('id', a.id);
  if (error) throw error;
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
