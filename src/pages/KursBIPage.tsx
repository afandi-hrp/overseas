import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Landmark, X, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Format DD-MMMM-YYYY (mis. "27-Agustus-2026") -- kolom "tanggal" tersimpan sbg string
// "YYYY-MM-DD" (date murni, tanpa jam), jadi diparse manual dari string, BUKAN via
// `new Date(val)`, supaya tidak ikut kena geser timezone (date-only string diinterpretasi
// UTC tengah malam oleh JS Date, bisa mundur 1 hari di timezone WIB saat ditampilkan).
function formatTanggalID(val: string | null | undefined): string {
  if (!val) return '-';
  const parts = String(val).split('-');
  if (parts.length !== 3) return val;
  const [y, m, d] = parts;
  const monthIdx = Number(m) - 1;
  if (monthIdx < 0 || monthIdx > 11) return val;
  return `${d}-${BULAN_ID[monthIdx]}-${y}`;
}

export default function KursBIPage() {

  const [mataUang, setMataUang] = useState('USD');
  const [tanggal, setTanggal] = useState(new Date().toISOString().substring(0, 10));
  const [kursJual, setKursJual] = useState('');
  const [kursTengah, setKursTengah] = useState('');
  const [catatan, setCatatan] = useState('');
  
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  // editingId -- id baris yang sedang diedit (null = mode tambah baru). Dipakai buat kasih
  // indikasi visual jelas kalau klik "Edit" beneran kena (banner "Sedang mengedit..." + tombol
  // Batal), bukan cuma diam-diam isi form tanpa tanda apa-apa.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pencarian (mata uang / catatan) + paginasi -- data kurs BI ini nambah 1 baris tiap hari,
  // jadi lama-lama bisa ratusan/ribuan baris. Tidak sehat lagi ditarik semua sekaligus.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  // Tab Tahun & Bulan -- dipakai buat filter periode, bukan cuma pengelompokan tampilan.
  // availableYears diisi dari rentang tanggal PALING TUA & PALING BARU di tabel (2 query
  // ringan, bukan tarik semua baris cuma buat tahu tahun apa saja yang ada).
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(new Date().getMonth());

  useEffect(() => {
    const loadYearRange = async () => {
      const [{ data: oldest }, { data: newest }] = await Promise.all([
        supabase.from('kurs_bi_seaair').select('tanggal').order('tanggal', { ascending: true }).limit(1),
        supabase.from('kurs_bi_seaair').select('tanggal').order('tanggal', { ascending: false }).limit(1),
      ]);
      const thisYear = new Date().getFullYear();
      const minYear = oldest?.[0]?.tanggal ? Number(String(oldest[0].tanggal).split('-')[0]) : thisYear;
      const maxYear = newest?.[0]?.tanggal ? Number(String(newest[0].tanggal).split('-')[0]) : thisYear;
      const years: number[] = [];
      for (let y = Math.max(maxYear, thisYear); y >= Math.min(minYear, thisYear); y--) years.push(y);
      setAvailableYears(years);
      // Default: tahun & bulan TERBARU yang benar-benar ada datanya (bukan selalu tahun berjalan
      // -- kalau data terbaru masih dari bulan lalu, langsung buka ke situ biar tidak nampak kosong).
      if (newest?.[0]?.tanggal) {
        const [ny, nm] = String(newest[0].tanggal).split('-');
        setSelectedYear(Number(ny));
        setSelectedMonth(Number(nm) - 1);
      }
    };
    loadYearRange();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedYear, selectedMonth]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      let query = supabase.from('kurs_bi_seaair').select('*', { count: 'exact' });

      if (selectedMonth === 'ALL') {
        query = query.gte('tanggal', `${selectedYear}-01-01`).lte('tanggal', `${selectedYear}-12-31`);
      } else {
        const mm = String(selectedMonth + 1).padStart(2, '0');
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        query = query.gte('tanggal', `${selectedYear}-${mm}-01`).lte('tanggal', `${selectedYear}-${mm}-${String(lastDay).padStart(2, '0')}`);
      }
      if (debouncedSearch) {
        query = query.or(`mata_uang.ilike.%${debouncedSearch}%,catatan.ilike.%${debouncedSearch}%`);
      }
      const start = (page - 1) * pageSize;
      const { data, error, count } = await query
        .order('tanggal', { ascending: false })
        .range(start, start + pageSize - 1);
      if (error) throw error;
      setHistory(data || []);
      setTotalCount(count || 0);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, debouncedSearch, selectedYear, selectedMonth]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Kelompokkan baris di HALAMAN YANG SEDANG TAMPIL berdasar bulan (dipakai saat tab bulan =
  // "Semua Bulan", supaya baris tetap kebaca terkelompok rapi per bulan di dalam tahun terpilih).
  // Saat 1 bulan spesifik dipilih, hasilnya otomatis cuma 1 grup -- tidak masalah, tetap benar.
  const groupedHistory = useMemo(() => {
    const groups: { key: string; label: string; rows: any[] }[] = [];
    history.forEach(rec => {
      const parts = String(rec.tanggal || '').split('-');
      const key = parts.length === 3 ? `${parts[0]}-${parts[1]}` : 'unknown';
      const label = parts.length === 3 && Number(parts[1]) >= 1 && Number(parts[1]) <= 12
        ? `${BULAN_ID[Number(parts[1]) - 1]} ${parts[0]}`
        : 'Tanggal Tidak Diketahui';
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, label, rows: [] };
        groups.push(group);
      }
      group.rows.push(rec);
    });
    return groups;
  }, [history]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!mataUang || !tanggal) {
      showToast('Mata Uang dan Tanggal wajib diisi', 'error');
      return;
    }
    
    try {
      const { error } = await supabase.rpc('upsert_kurs_bi', {
        p_mata_uang: mataUang,
        p_tanggal: tanggal,
        p_kurs_jual: kursJual ? Number(kursJual) : null,
        p_kurs_tengah: kursTengah ? Number(kursTengah) : null,
        p_catatan: catatan || null
      });
      
      if (error) throw error;
      
      showToast('Kurs berhasil disimpan', 'success');
      setKursJual('');
      setKursTengah('');
      setCatatan('');
      setEditingId(null);
      fetchHistory();
    } catch (e: any) {
      showToast('Gagal menyimpan kurs: ' + e.message, 'error');
    }
  };

  const handleEdit = (rec: any) => {
    setEditingId(rec.id);
    setMataUang(rec.mata_uang);
    setTanggal(rec.tanggal);
    setKursJual(rec.kurs_jual?.toString() || '');
    setKursTengah(rec.kurs_tengah?.toString() || '');
    setCatatan(rec.catatan || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setMataUang('USD');
    setTanggal(new Date().toISOString().substring(0, 10));
    setKursJual('');
    setKursTengah('');
    setCatatan('');
  };

  const handleDelete = async (rec: any) => {
    if (!window.confirm(`Hapus kurs ${rec.mata_uang} tanggal ${formatTanggalID(rec.tanggal)}?`)) return;
    setDeletingId(rec.id);
    try {
      const { error } = await supabase.from('kurs_bi_seaair').delete().eq('id', rec.id);
      if (error) throw error;
      showToast('Kurs berhasil dihapus', 'success');
      if (editingId === rec.id) handleCancelEdit();
      fetchHistory();
    } catch (e: any) {
      showToast('Gagal menghapus kurs: ' + e.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <main className="max-w-7xl mx-auto px-4 py-8">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
            <Landmark size={17} />
          </div>
          <div>
            <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Kurs BI Harian</h1>
            <p className="text-[#5A305A] font-light text-sm mt-1">Kelola data nilai tukar mata uang Bank Indonesia (BI).</p>
          </div>
        </div>

        {/* Form Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-semibold text-[#5A305A]">Form Input Kurs</h2>
            {toast && (
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {toast.message}
              </span>
            )}
          </div>
          {/* Banner mode edit -- indikasi visual jelas kalau tombol "Edit" di tabel beneran
              kena klik (sebelumnya form cuma diisi diam-diam tanpa tanda apa pun, gampang
              disangka tombolnya tidak berfungsi). */}
          {editingId && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-amber-800">✏️ Sedang mengedit kurs {mataUang} tanggal {formatTanggalID(tanggal)}.</span>
              <button onClick={handleCancelEdit} className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline flex items-center gap-1 shrink-0">
                <X size={12} /> Batal
              </button>
            </div>
          )}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Mata Uang</label>
                <select 
                  value={mataUang}
                  onChange={(e) => setMataUang(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="SGD">SGD</option>
                  <option value="EUR">EUR</option>
                  <option value="JPY">JPY</option>
                  <option value="RMB">RMB</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tanggal</label>
                <input 
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kurs Jual</label>
                <input 
                  type="number"
                  placeholder="Contoh: 16500"
                  value={kursJual}
                  onChange={(e) => setKursJual(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kurs Tengah</label>
                <input 
                  type="number"
                  placeholder="Contoh: 16400"
                  value={kursTengah}
                  onChange={(e) => setKursTengah(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="mb-5">
              <label className="block text-xs font-semibold text-[#5A305A] mb-1">Catatan (Opsional)</label>
              <textarea 
                rows={2}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Tambahkan catatan jika perlu..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex justify-between items-center bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              <div className="flex items-start gap-2">
                <i className="ti ti-info-circle text-blue-500 mt-0.5"></i>
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Kurs Efektif</strong> = Kurs Jual (jika diisi), atau Kurs Tengah + Rp200 (jika Kurs Jual kosong).
                </p>
              </div>
              <button 
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap ml-4"
              >
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tab Tahun */}
          <div className="px-5 pt-4 pb-1 flex items-center gap-1.5 flex-wrap">
            {availableYears.map(y => (
              <button
                key={y}
                type="button"
                onClick={() => setSelectedYear(y)}
                className={`px-3.5 py-1.5 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                  selectedYear === y ? 'bg-[#5A305A] text-white' : 'bg-slate-100 text-[#5A305A] hover:bg-slate-200'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          {/* Tab Bulan (dari tahun yang sedang dipilih) */}
          <div className="px-5 pb-4 pt-1 flex items-center gap-1.5 flex-wrap border-b border-slate-100">
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                selectedMonth === 'ALL' ? 'bg-[#5A305A] text-white' : 'bg-white border border-slate-200 text-[#5A305A] hover:bg-slate-50'
              }`}
            >
              Semua Bulan
            </button>
            {BULAN_ID.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedMonth(idx)}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${
                  selectedMonth === idx ? 'bg-[#5A305A] text-white' : 'bg-white border border-slate-200 text-[#5A305A] hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-[#5A305A]">Riwayat Kurs BI{totalCount > 0 ? ` (${totalCount} data)` : ''}</h2>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A305A]/50 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari mata uang / catatan..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5A305A]/50 hover:text-[#5A305A]">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Tanggal</th>
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Mata Uang</th>
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-right">Kurs Jual</th>
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-right">Kurs Tengah</th>
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Catatan</th>
                  <th className="px-5 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#5A305A]">
                      Memuat data...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#5A305A]">
                      {debouncedSearch ? 'Tidak ada kurs yang cocok dengan pencarian.' : 'Belum ada data kurs.'}
                    </td>
                  </tr>
                ) : (
                  groupedHistory.map(group => (
                    <React.Fragment key={group.key}>
                      <tr>
                        <td colSpan={6} className="px-5 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider bg-[#FFF5C5]/60 border-y border-[#5A305A]/10">
                          {group.label} <span className="font-normal normal-case text-[#5A305A]/60">({group.rows.length} data)</span>
                        </td>
                      </tr>
                      {group.rows.map(rec => (
                        <tr key={rec.id} className={`hover:bg-slate-50/50 transition-colors ${editingId === rec.id ? 'bg-amber-50/70' : ''}`}>
                          <td className="px-5 py-3 text-sm text-[#5A305A] font-medium whitespace-nowrap">
                            {formatTanggalID(rec.tanggal)}
                          </td>
                          <td className="px-5 py-3 text-sm">
                            <span className="bg-slate-100 text-[#5A305A] font-bold px-2 py-0.5 rounded text-xs border border-slate-200">
                              {rec.mata_uang}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm font-mono text-[#5A305A] text-right">
                            {rec.kurs_jual ? rec.kurs_jual.toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="px-5 py-3 text-sm font-mono text-[#5A305A] text-right">
                            {rec.kurs_tengah ? rec.kurs_tengah.toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="px-5 py-3 text-xs text-[#5A305A] max-w-xs truncate">
                            {rec.catatan || '-'}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEdit(rec)}
                                className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] hover:text-blue-600 font-medium px-3 py-1.5 rounded transition-colors shadow-sm"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(rec)}
                                disabled={deletingId === rec.id}
                                className="text-xs bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-medium px-3 py-1.5 rounded transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                              >
                                <Trash2 size={12} /> {deletingId === rec.id ? '...' : 'Hapus'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalCount > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-[#5A305A]">
                Menampilkan <span className="font-bold">{(page - 1) * pageSize + 1}</span>–<span className="font-bold">{Math.min(page * pageSize, totalCount)}</span> dari <span className="font-bold">{totalCount}</span> data
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-[#5A305A] font-semibold">Hal. {page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
