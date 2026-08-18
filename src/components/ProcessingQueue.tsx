import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { Clock, X } from 'lucide-react';

export default function ProcessingQueue({ onOpenDetail, type }: { onOpenDetail?: (id: string, type: string) => void, type?: 'courier' | 'sea_air' }) {
    const [queue, setQueue] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchQueue = async () => {
        let query = supabase
            .from('tabel_processing_queue')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        // Selagi masih PENDING/PROCESSING, n8n belum mengisi FK (seaair_id/pib_id/cn_id) sehingga
        // tipe dokumennya belum bisa dipastikan -- tetap tampilkan di kedua tab sampai FK terisi
        // dan otomatis pindah ke tab yang benar.
        if (type === 'sea_air') query = query.or('seaair_id.not.is.null,status.eq.PENDING,status.eq.PROCESSING');
        else if (type === 'courier') query = query.or('pib_id.not.is.null,cn_id.not.is.null,status.eq.PENDING,status.eq.PROCESSING');

        const { data, error } = await query;

        if (!error && data) {
            // Auto hide success > 24 hours
            const now = new Date().getTime();
            const filtered = data.filter(item => {
                if (item.status === 'SUCCESS' && item.is_read) {
                    const updated = new Date(item.updated_at).getTime();
                    if (now - updated > 24 * 60 * 60 * 1000) return false;
                }
                if (item.status === 'FAILED' && item.is_read) return false;
                return true;
            });
            setQueue(filtered);
            setUnreadCount(filtered.filter(i => i.status === 'SUCCESS' && !i.is_read).length);
        }
    };

    useEffect(() => {
        fetchQueue();
        const interval = setInterval(fetchQueue, 5000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);
    
    useEffect(() => {
        if (isOpen && unreadCount > 0) {
            const unreadIds = queue.filter(i => i.status === 'SUCCESS' && !i.is_read).map(i => i.id);
            if (unreadIds.length > 0) {
                supabase.from('tabel_processing_queue').update({ is_read: true }).in('id', unreadIds).then(() => {
                    setUnreadCount(0);
                    setQueue(prev => prev.map(item => unreadIds.includes(item.id) ? { ...item, is_read: true } : item));
                });
            }
        }
    }, [isOpen, unreadCount, queue]);

    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    const handleDismiss = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            const { error } = await supabase.from('tabel_processing_queue').delete().eq('id', id);
            if (error) throw error;
            setQueue(prev => prev.filter(item => item.id !== id));
        } catch(err: any) {
            showToast("Gagal menghapus item: " + (err.message || String(err)));
        }
    };

    const formatTime = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    }

    return (
        <div className="mb-6">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md border border-white/60 rounded-xl text-sm font-bold text-[#5A305A] hover:bg-white/90 transition-all shadow-sm relative"
            >
                <Clock size={15} className="text-[#5A305A]" /> Antrian Proses
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="mt-3 bg-white/70 backdrop-blur-md border border-white/60 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-bold text-[#5A305A]">Antrian Proses Dokumen</h2>
                            {queue.some(i => i.status === 'SUCCESS' || i.status === 'FAILED') && (
                                <button 
                                    onClick={async () => {
                                        if (confirm('Bersihkan semua antrian yang sudah selesai/gagal?')) {
                                            const idsToDismiss = queue.filter(i => i.status === 'SUCCESS' || i.status === 'FAILED').map(i => i.id);
                                            if (idsToDismiss.length > 0) {
                                                try {
                                                    const { error } = await supabase
                                                        .from('tabel_processing_queue')
                                                        .delete()
                                                        .in('id', idsToDismiss);
                                                    if (error) throw error;
                                                    showToast("Berhasil membersihkan antrian.");
                                                    setQueue(prev => prev.filter(i => i.status !== 'SUCCESS' && i.status !== 'FAILED'));
                                                } catch(err: any) {
                                                    showToast("Gagal update batch: " + (err.message || String(err)));
                                                }
                                            }
                                        }
                                    }}
                                    className="text-[10px] text-[#5A305A] hover:text-[#5A305A] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                                >
                                    ✕ Bersihkan Selesai/Gagal
                                </button>
                            )}
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-[#5A305A] hover:text-[#5A305A] p-1"><X size={16} /></button>
                    </div>
                    
                    {queue.length === 0 ? (
                        <p className="text-xs text-[#5A305A] italic text-center py-4">Tidak ada antrian dokumen.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {queue.map(item => {
                                let filenames = [];
                                try {
                                    if (typeof item.file_names === 'string') {
                                        filenames = JSON.parse(item.file_names);
                                    } else if (Array.isArray(item.file_names)) {
                                        filenames = item.file_names;
                                    }
                                } catch(e) {}
                                
                                const filesStr = filenames.join(', ');

                                if (item.status === 'PENDING' || item.status === 'PROCESSING') {
                                    return (
                                        <div key={item.id} className="relative bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm">
                                            <div className="font-bold text-amber-800 flex items-center gap-1.5">
                                                <span className="relative flex h-2 w-2">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                </span>
                                                Sedang diproses...
                                            </div>
                                            <div className="text-amber-900 truncate" title={filesStr}>File: {filesStr}</div>
                                            <div className="text-amber-700/70 text-[10px]">Dikirim: {formatTime(item.created_at)}</div>
                                        </div>
                                    )
                                }

                                if (item.status === 'SUCCESS') {
                                    return (
                                        <div key={item.id} className="relative bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm pr-6">
                                            <button onClick={(e) => handleDismiss(item.id, e)} className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 font-bold">&times;</button>
                                            <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                                                ✅ Berhasil — AWB: {item.awb || '-'}
                                            </div>
                                            <div className="flex gap-2 items-center text-[10px]">
                                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${item.status_validasi?.includes('LULUS') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>Validasi: {item.status_validasi || 'N/A'}</span>
                                                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${item.status_cost?.includes('OK') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>Cost: {item.status_cost || 'N/A'}</span>
                                            </div>
                                            <div className="mt-1">
                                                {/* In typical usage, the parent handles opening modal via CN/PIB ID, but we just link to it if we can't open the modal directly... or emit an event. Let's just use a text hint or pseudo-link. */}
                                                <span className="text-emerald-700 font-medium underline cursor-pointer" onClick={() => { if (onOpenDetail && (item.pib_id || item.cn_id)) onOpenDetail(item.pib_id || item.cn_id, item.pib_id ? "pib" : "cn"); else window.location.href = '/dashboard'; }}>Lihat Detail →</span>
                                            </div>
                                        </div>
                                    )
                                }

                                if (item.status === 'FAILED') {
                                    return (
                                        <div key={item.id} className="relative bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs flex flex-col gap-1.5 shadow-sm pr-6">
                                            <button onClick={(e) => handleDismiss(item.id, e)} className="absolute top-2 right-2 text-rose-400 hover:text-rose-600 font-bold">&times;</button>
                                            <div className="font-bold text-rose-800 flex items-center gap-1.5">
                                                ❌ Gagal diproses
                                            </div>
                                            <div className="text-rose-900 truncate" title={filesStr}>File: {filesStr}</div>
                                            <div className="text-rose-700/80 text-[10px] break-words">Error: {item.error_message || '-'}</div>
                                            <div className="mt-1">
                                                <Link to={type === 'sea_air' ? '/sea-air/upload' : '/courier/upload'} onClick={(e) => handleDismiss(item.id, e as any)} className="text-rose-700 font-bold underline">Coba Lagi</Link>
                                            </div>
                                        </div>
                                    )
                                }
                            })}
                        </div>
                    )}
                </div>
            )}
            {toastMessage && (
                <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl font-medium text-sm z-[9999] flex items-center gap-3 animate-in slide-in-from-bottom-5">
                    {toastMessage.includes('Gagal') ? <span className="text-rose-400 text-lg">❌</span> : <span className="text-emerald-400 text-lg">✅</span>}
                    <span className="leading-tight">{toastMessage}</span>
                </div>
            )}
        </div>
    )
}
