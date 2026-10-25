// Règles des fichiers joints : types acceptés, tailles maximales, chemins dans le bucket.

export type FileKind = 'image' | 'video' | 'document';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
/** Une image est réduite avant l'envoi ; on refuse seulement les fichiers vraiment énormes. */
export const MAX_IMAGE_SOURCE_BYTES = 40 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_QUALITY = 0.8;

const DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
];
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv'];

/** Valeur de l'attribut `accept` des sélecteurs de fichiers. */
export const ACCEPT = ['image/*', 'video/*', ...DOC_MIME, ...DOC_EXT.map((e) => `.${e}`)].join(',');

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function kindOf(file: { type: string; name: string }): FileKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (DOC_MIME.includes(file.type) || DOC_EXT.includes(extensionOf(file.name))) return 'document';
  return null;
}

/** Message d'erreur en français, ou null si le fichier peut être envoyé. */
export function validateFile(file: { type: string; name: string; size: number }): string | null {
  const kind = kindOf(file);
  if (!kind) return `« ${file.name} » : type de fichier non pris en charge (photos, vidéos, PDF et documents Office).`;
  if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
    return 'Vidéo trop lourde (50 Mo max). Envoie plutôt un lien YouTube ou Google Drive.';
  }
  if (kind === 'document' && file.size > MAX_DOC_BYTES) return `« ${file.name} » est trop lourd (20 Mo max pour un document).`;
  if (kind === 'image' && file.size > MAX_IMAGE_SOURCE_BYTES) return `« ${file.name} » est trop lourde (40 Mo max).`;
  return null;
}

/** Chemin dans le bucket board-files : {board_id}/{uuid}.{ext} */
export function storagePath(boardId: string, id: string, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${boardId}/${id}.${clean}`;
}

/** Dimensions après réduction : le plus grand côté passe à `max` px au plus, proportions gardées. */
export function fitSize(width: number, height: number, max = IMAGE_MAX_SIDE): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const r = Math.min(max / width, max / height);
  return { width: Math.round(width * r), height: Math.round(height * r) };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} Go`;
}

/** Liens collés dans un texte (YouTube, Google Drive, etc.). */
export function findLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"]+/g)].map((m) => m[0].replace(/[.,;:!?)]+$/, ''));
}
