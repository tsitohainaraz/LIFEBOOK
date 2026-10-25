/** Recadre une image au centre en carré, la réduit à `size` px et la compresse en JPEG. */
export async function squareJpeg(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
