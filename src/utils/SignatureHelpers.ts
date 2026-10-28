// Tanda tangan per user (2026-10-27, permintaan user; SQL sql/083). Gambar PNG privat di bucket `user-signatures` (`<user_id>/<epoch-ms>.png`, nama SELALU baru,
// file tidak pernah diubah / dihapus = dasar SNAPSHOT), penunjuk terbaru di `user_signatures` (ditulis hanya lewat RPC `fn_set_my_signature`). Saat Sign, RPC
// `approve_far_overseas_air` menyalin path tanda tangan penanda tangan ke `approvals[].signature_path` entri itu; kertas memo menampilkannya di atas nama.
// Pola ini bisa dipakai modul lain (cukup salin `signature_path` ke entri approval-nya).
import { supabase } from '../lib/supabase';

export const SIGNATURE_BUCKET = 'user-signatures';
export const SIGNATURE_MAX_W = 600;
export const SIGNATURE_MAX_H = 220;
export const SIGNATURE_MAX_BYTES = 512 * 1024; // sama batas bucket (sql/083)
export const SIGNATURE_MAX_UPLOAD_MB = 5;       // batas file asli yang dipilih user (diperkecil jadi PNG kecil sebelum diunggah)

// ─── Pengolahan gambar (murni, bisa diuji) ──────────────────────────────────────────────────────────────
// Putih / hampir putih -> transparan (utk foto / scan tanda tangan di kertas putih). Transisi halus 200..235 supaya tepi goresan tidak bergerigi.
export function makeNearWhiteTransparent(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum >= 235) data[i + 3] = 0;
    else if (lum > 200) data[i + 3] = Math.round(data[i + 3] * (235 - lum) / 35);
  }
}
// Kotak pembatas piksel yang TERLIHAT (alpha > 16); null = kosong. Dipakai memangkas margin kosong.
export function contentBounds(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
export function fitInside(w: number, h: number, maxW = SIGNATURE_MAX_W, maxH = SIGNATURE_MAX_H): { w: number; h: number } {
  const r = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * r)), h: Math.max(1, Math.round(h * r)) };
}

const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/png'));

// Kanvas sumber (gambar langsung / hasil muat file) -> PNG kecil: opsional putih jadi transparan, margin kosong dipangkas, ukuran maks 600x220.
// null = gambarnya kosong (tidak ada goresan).
export async function canvasToSignaturePng(src: HTMLCanvasElement, opts: { whiteTransparent?: boolean } = {}): Promise<Blob | null> {
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  const img = sctx.getImageData(0, 0, src.width, src.height);
  if (opts.whiteTransparent) makeNearWhiteTransparent(img.data);
  const box = contentBounds(img.data, src.width, src.height);
  if (!box) return null;
  const tmp = document.createElement('canvas');
  tmp.width = src.width; tmp.height = src.height;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  const pad = 4;
  const sx = Math.max(0, box.x - pad), sy = Math.max(0, box.y - pad);
  const sw = Math.min(src.width - sx, box.w + pad * 2), sh = Math.min(src.height - sy, box.h + pad * 2);
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const fit = fitInside(Math.round(sw * scale), Math.round(sh * scale));
    const out = document.createElement('canvas');
    out.width = fit.w; out.height = fit.h;
    const octx = out.getContext('2d')!;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(tmp, sx, sy, sw, sh, 0, 0, fit.w, fit.h);
    const blob = await canvasBlob(out);
    if (blob && blob.size <= SIGNATURE_MAX_BYTES) return blob;
    scale *= 0.7; // masih terlalu besar -> perkecil lagi
  }
  return null;
}

// File gambar (PNG / JPG / WebP) -> kanvas sumber.
export async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The image could not be read.')); i.src = url; });
    const fit = fitInside(img.naturalWidth || img.width, img.naturalHeight || img.height, 1600, 800); // simpan resolusi cukup utk dipangkas
    const c = document.createElement('canvas');
    c.width = fit.w; c.height = fit.h;
    c.getContext('2d')!.drawImage(img, 0, 0, fit.w, fit.h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

// ─── Akses data ─────────────────────────────────────────────────────────────────────────────────────────
export async function fetchMySignaturePath(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('user_signatures').select('storage_path').eq('user_id', userId).maybeSingle();
  if (error) { console.error('[Signature] gagal membaca tanda tangan:', error.message); return null; }
  return (data as any)?.storage_path ?? null;
}

// Unduh gambar (berotentikasi) -> object URL utk <img>. Pemanggil WAJIB `URL.revokeObjectURL` saat tak dipakai. Gagal = null (kolom tetap garis kosong).
export async function downloadSignatureUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path);
  if (error || !data) { console.warn('[Signature] gagal mengunduh tanda tangan:', error?.message); return null; }
  return URL.createObjectURL(data);
}

// Unggah PNG baru (nama baru, tidak menimpa) lalu arahkan penunjuk ke sana. File lama TIDAK dihapus (memo yang sudah menyalinnya tetap utuh).
export async function saveMySignature(userId: string, blob: Blob): Promise<{ error: string | null; path?: string }> {
  const path = `${userId}/${Date.now()}.png`;
  const up = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false });
  if (up.error) return { error: up.error.message };
  const rpc = await supabase.rpc('fn_set_my_signature', { p_path: path });
  if (rpc.error) return { error: rpc.error.message };
  return { error: null, path };
}
export async function removeMySignature(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('fn_set_my_signature', { p_path: null });
  return { error: error ? error.message : null };
}
