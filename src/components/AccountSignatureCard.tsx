// Kartu "My signature" di halaman Account (2026-10-27, permintaan user; SQL sql/083). Dua cara: upload gambar (PNG / JPG / WebP) atau gambar langsung di layar
// (mouse / layar sentuh). Gambar dipangkas, putih -> transparan (opsional utk upload), diperkecil jadi PNG kecil, lalu diunggah dgn nama BARU ke bucket privat.
// SNAPSHOT: tanda tangan disalin ke memo saat user menekan Sign; mengganti tanda tangan di sini TIDAK mengubah memo yang sudah ditandatangani.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PenLine, Upload, Trash2, Eraser } from 'lucide-react';
import {
  canvasToSignaturePng, imageFileToCanvas, fetchMySignaturePath, downloadSignatureUrl, saveMySignature, removeMySignature, SIGNATURE_MAX_UPLOAD_MB,
} from '../utils/SignatureHelpers';

const DRAW_W = 900;
const DRAW_H = 300;

export default function AccountSignatureCard({ userId }: { userId: string | undefined }) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [hasCurrent, setHasCurrent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'upload' | 'draw'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [whiteTransparent, setWhiteTransparent] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // hasil olahan (yang akan disimpan)
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const urlsToRevoke = useRef<string[]>([]);

  const track = (u: string | null) => { if (u) urlsToRevoke.current.push(u); return u; };
  useEffect(() => () => { urlsToRevoke.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const loadCurrent = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const path = await fetchMySignaturePath(userId);
    setHasCurrent(!!path);
    setCurrentUrl(path ? track(await downloadSignatureUrl(path)) : null);
    setLoading(false);
  }, [userId]);
  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  // Upload: olah ulang tiap file / opsi berubah -> pratinjau.
  useEffect(() => {
    if (mode !== 'upload') return;
    setBlob(null); setPreviewUrl(null);
    if (!file) return;
    let alive = true;
    (async () => {
      try {
        const c = await imageFileToCanvas(file);
        const out = await canvasToSignaturePng(c, { whiteTransparent });
        if (!alive) return;
        if (!out) { setMsg({ type: 'err', text: 'No signature found in the image, or it is too large. Use a clearer image.' }); return; }
        setMsg(null); setBlob(out); setPreviewUrl(track(URL.createObjectURL(out)));
      } catch (e: any) { if (alive) setMsg({ type: 'err', text: e?.message || 'The image could not be read.' }); }
    })();
    return () => { alive = false; };
  }, [file, whiteTransparent, mode]);

  const pickFile = (f: File | null) => {
    setMsg(null);
    if (!f) { setFile(null); return; }
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) { setMsg({ type: 'err', text: 'Use a PNG, JPG or WebP image.' }); return; }
    if (f.size > SIGNATURE_MAX_UPLOAD_MB * 1024 * 1024) { setMsg({ type: 'err', text: `The image is larger than ${SIGNATURE_MAX_UPLOAD_MB} MB.` }); return; }
    setFile(f);
  };

  // ── Gambar langsung ──
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * DRAW_W, y: ((e.clientY - r.top) / r.height) * DRAW_H };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = pos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && last.current) { ctx.fillStyle = '#16163F'; ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 2, 0, Math.PI * 2); ctx.fill(); }
    setDrawn(true);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d'); const p = pos(e);
    if (!ctx || !last.current) return;
    ctx.strokeStyle = '#16163F'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const onUp = () => { drawing.current = false; last.current = null; };
  const clearCanvas = () => { canvasRef.current?.getContext('2d')?.clearRect(0, 0, DRAW_W, DRAW_H); setDrawn(false); setMsg(null); };

  const save = async () => {
    if (!userId) return;
    setBusy(true); setMsg(null);
    let out = blob;
    if (mode === 'draw') {
      if (!canvasRef.current || !drawn) { setBusy(false); setMsg({ type: 'err', text: 'Draw your signature first.' }); return; }
      out = await canvasToSignaturePng(canvasRef.current);
    }
    if (!out) { setBusy(false); setMsg({ type: 'err', text: 'There is no signature to save.' }); return; }
    const r = await saveMySignature(userId, out);
    setBusy(false);
    if (r.error) { setMsg({ type: 'err', text: 'Failed to save signature: ' + r.error }); return; }
    setMsg({ type: 'ok', text: 'Signature saved. It will be added to memos you sign from now on.' });
    setFile(null); setBlob(null); setPreviewUrl(null); clearCanvas();
    await loadCurrent();
  };
  const remove = async () => {
    if (!window.confirm('Remove your signature? Memos you already signed keep their signature.')) return;
    setBusy(true); setMsg(null);
    const r = await removeMySignature();
    setBusy(false);
    if (r.error) { setMsg({ type: 'err', text: 'Failed to remove signature: ' + r.error }); return; }
    setMsg({ type: 'ok', text: 'Signature removed.' });
    await loadCurrent();
  };

  const tabCls = (on: boolean) => `px-3 h-8 rounded-lg text-xs font-bold flex items-center gap-1.5 ${on ? 'bg-[#5A305A] text-white' : 'text-[#5A305A] hover:bg-slate-100'}`;
  const canSave = mode === 'upload' ? !!blob : drawn;

  return (
    <div className="pt-5 border-t border-slate-100 mt-6" data-account-signature>
      <h3 className="text-sm font-bold text-[#5A305A] mb-1 flex items-center gap-1.5"><PenLine size={15} /> My Signature</h3>
      <p className="text-xs text-slate-500 mb-3">
        Added above your name on memos when you sign them. A memo keeps the signature you had at the moment you signed — changing it here does not change memos you already signed.
        Only you, Admins and users who can open a memo you signed can see the image.
      </p>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Current signature</p>
        {loading ? <p className="text-xs text-slate-400">Loading…</p> : currentUrl ? (
          <div className="flex items-end justify-between gap-3">
            <img src={currentUrl} alt="Your signature" className="max-h-[80px] max-w-[70%] object-contain bg-white rounded-lg border border-slate-200 p-1.5" data-signature-current />
            <button type="button" onClick={remove} disabled={busy} className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 disabled:opacity-50"><Trash2 size={13} /> Remove</button>
          </div>
        ) : <p className="text-xs text-slate-400">{hasCurrent ? 'The signature image could not be loaded.' : 'No signature yet — memos you sign will show an empty line.'}</p>}
      </div>

      <div className="flex items-center gap-1 mb-2" role="tablist" aria-label="Signature method">
        <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => { setMode('upload'); setMsg(null); }} className={tabCls(mode === 'upload')}><Upload size={13} /> Upload image</button>
        <button type="button" role="tab" aria-selected={mode === 'draw'} onClick={() => { setMode('draw'); setMsg(null); }} className={tabCls(mode === 'draw')}><PenLine size={13} /> Draw</button>
      </div>

      {mode === 'upload' ? (
        <div className="space-y-2">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => pickFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#5A305A] file:text-white file:px-3 file:py-1.5 file:text-xs file:font-semibold" data-signature-file />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="accent-[#5A305A]" checked={whiteTransparent} onChange={e => setWhiteTransparent(e.target.checked)} />
            Make the white background transparent (for a photo or scan on white paper)
          </label>
          {previewUrl && (
            <div className="rounded-xl border border-dashed border-slate-300 p-2 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] [background-size:12px_12px] [background-position:0_0,6px_6px]">
              <img src={previewUrl} alt="Preview" className="max-h-[90px] object-contain mx-auto" data-signature-preview />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <canvas ref={canvasRef} width={DRAW_W} height={DRAW_H} data-signature-canvas
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
            className="w-full max-w-[600px] aspect-[3/1] rounded-xl border border-slate-300 bg-white touch-none cursor-crosshair" />
          <button type="button" onClick={clearCanvas} className="text-xs font-semibold text-slate-600 hover:text-[#5A305A] flex items-center gap-1"><Eraser size={13} /> Clear</button>
        </div>
      )}

      {msg && <p className={`text-xs mt-2 ${msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`} role="status">{msg.text}</p>}
      <button type="button" onClick={save} disabled={busy || !canSave}
        className="mt-3 bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm" data-signature-save>
        {busy ? 'Saving…' : 'Save signature'}
      </button>
    </div>
  );
}
