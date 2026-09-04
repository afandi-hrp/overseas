import React, { useEffect, useState } from 'react';
import { X, History } from 'lucide-react';
import { fetchBunkerAuditLog, formatDateTimeID, BunkerAuditLogEntry } from '../utils/BunkerHelpers';

// Pecah kembali format "{field} — Lama: X → Baru: Y" (ditulis logBunkerAudit, tabel audit_trail
// tidak punya kolom field/old_value/new_value terpisah) jadi 3 bagian utk ditampilkan rapi --
// fallback tampilkan apa adanya kalau formatnya tidak cocok (mis. entri dari sumber lain).
function splitAuditCatatan(catatan: string | null): { field: string; old: string; new: string } | null {
  if (!catatan) return null;
  const match = catatan.match(/^(.*?) — Lama: (.*) → Baru: (.*)$/s);
  if (!match) return null;
  return { field: match[1], old: match[2], new: match[3] };
}

// Riwayat perubahan PER BARIS bunker_dokumen -- lihat catatan lengkap di BunkerHelpers.ts
// (logBunkerAudit/fetchBunkerAuditLog) soal kenapa ini pakai ulang tabel audit_trail global.
export default function BunkerAuditLogModal({ record, onClose }: {
  record: any;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<BunkerAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await fetchBunkerAuditLog(record.no_po);
      if (cancelled) return;
      if (error) {
        setError('Gagal memuat riwayat: ' + error.message);
      } else {
        setEntries(data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [record.no_po]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-[#5A305A] flex items-center gap-2">
              <History size={18} /> Riwayat Perubahan
            </h2>
            <p className="text-xs font-light text-[#5A305A] mt-0.5 truncate">No PO: {record.no_po || '-'} · {record.vendor || '-'} · {record.kapal || '-'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-[#5A305A] transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          {loading ? (
            <p className="text-xs text-[#5A305A]/70 italic text-center py-8">Memuat riwayat...</p>
          ) : error ? (
            <p className="text-xs text-rose-600 text-center py-8">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-[#5A305A]/70 italic text-center py-8">Belum ada perubahan manual tercatat untuk baris ini.</p>
          ) : (
            <ol className="space-y-3">
              {entries.map(e => {
                const diff = splitAuditCatatan(e.catatan);
                return (
                  <li key={e.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-[#5A305A]">{diff?.field || '-'}</span>
                      <span className="text-[10px] text-[#5A305A]/60">{formatDateTimeID(e.created_at)}</span>
                    </div>
                    <p className="text-xs text-[#5A305A]/70 mb-1.5">
                      Oleh: <span className="font-semibold text-[#5A305A]">{e.user_email || 'Tidak diketahui'}</span>
                    </p>
                    {diff ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 break-words">{diff.old}</span>
                        <span className="text-[#5A305A]/40 shrink-0">→</span>
                        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 break-words">{diff.new}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[#5A305A] break-words">{e.catatan || '-'}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
