import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PlaneTakeoff, ChevronDown, ChevronRight as ChevronRightIcon, ChevronLeft, Plus, Settings2, X } from 'lucide-react';
import Greeting from '../components/Greeting';
import { LoadingState } from '../components/LoadingState';

const JENIS_LAYANAN_OPTIONS = ['Air Freight', 'Sea Freight', 'Reguler Freight', 'Express', 'Economy'];
const MATA_UANG_OPTIONS = ['IDR', 'USD', 'RMB'];
const KATEGORI_BARANG_OPTIONS = ['BATTERY', 'SHAMPOO (CAIRAN LIQUID)', 'REGULER ITEM'];
const JIANQIAO_VENDOR_NAME = 'PT. JIANQIAO LOGISTICS INDONESIA';

type VendorMaster = { id: string; vendor_name: string; aktif: boolean };

type Quotation = {
  id: string;
  vendor_name: string;
  jenis_layanan: string;
  origin: string;
  tujuan: string;
  kategori_barang: string | null;
  mata_uang: string;
  periode_mulai: string;
  periode_selesai: string | null;
  aktif: boolean;
};

type QuotationDetail = {
  id: string;
  quotation_id: string;
  berat_min: number;
  berat_max: number | null;
  harga_per_kg: number | null;
  harga_per_cbm: number | null;
  harga_per_cbm_min: number | null;
  harga_per_cbm_max: number | null;
  ppn_status: string;
  notes: string | null;
};

function groupKeyOf(q: Pick<Quotation, 'vendor_name' | 'jenis_layanan' | 'origin' | 'tujuan' | 'kategori_barang'>) {
  return [q.vendor_name, q.jenis_layanan, q.origin, q.tujuan, q.kategori_barang || ''].join('||');
}

function formatWeight(min: number, max: number | null) {
  if (max == null) return `${min}+ Kg`;
  if (min === max) return `${min} Kg`;
  return `${min}-${max} Kg`;
}

function formatMoney(val: number | null | undefined, cur: string) {
  if (val == null) return '-';
  const formatted = val.toLocaleString('id-ID');
  return cur === 'IDR' ? `Rp ${formatted}` : `${cur} ${formatted}`;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format tampilan periode DD-MMM-YYYY (cth "01-Sep-2026") -- HANYA display, kolom DB &
// <input type="date"> tetap ISO (YYYY-MM-DD), native date picker browser tidak bisa diubah
// formatnya. Parse manual dari string ISO (bukan `new Date(iso)` polos) supaya tidak kena
// pergeseran timezone lokal.
function formatDateDMY(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${String(d).padStart(2, '0')}-${MONTH_ABBR[m - 1]}-${y}`;
}

function addOneDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function FarOverseasVendorTarifPage() {
  const { canEdit } = useAuth();
  const canEditVendorTarif = canEdit('settings_tarif_far_overseas_vendor');

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [detailsByQuotation, setDetailsByQuotation] = useState<Record<string, QuotationDetail[]>>({});

  const [filterVendor, setFilterVendor] = useState('semua');
  const [filterSearch, setFilterSearch] = useState('');
  const [showInactiveQuotations, setShowInactiveQuotations] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedQuotations, setExpandedQuotations] = useState<Set<string>>(new Set());

  // Pagination client-side atas daftar rute (grup) -- data quotation sudah di-fetch semua
  // sekaligus, jadi paging cukup slice di JS spt versi lama halaman ini.
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [savingVendor, setSavingVendor] = useState(false);

  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [savingQuotation, setSavingQuotation] = useState(false);
  const [qEditingId, setQEditingId] = useState<string | null>(null);
  const [qCloseOldId, setQCloseOldId] = useState<string | null>(null); // mode "Update Harga (Buat Periode Baru)"
  const [qVendorName, setQVendorName] = useState('');
  const [qJenisLayanan, setQJenisLayanan] = useState(JENIS_LAYANAN_OPTIONS[0]);
  const [qOrigin, setQOrigin] = useState('');
  const [qTujuan, setQTujuan] = useState('');
  const [qKategoriBarang, setQKategoriBarang] = useState('');
  const [qMataUang, setQMataUang] = useState('IDR');
  const [qPeriodeMulai, setQPeriodeMulai] = useState('');
  const [qPeriodeSelesai, setQPeriodeSelesai] = useState('');

  const [detailForms, setDetailForms] = useState<Record<string, {
    id: string | null; berat_min: string; berat_max: string; harga_per_kg: string;
    isCbmRange: boolean; harga_per_cbm: string; harga_per_cbm_min: string; harga_per_cbm_max: string;
    ppn_status: string; notes: string;
  } | null>>({});
  const [savingDetailFor, setSavingDetailFor] = useState<string | null>(null);

  const showKategoriBarang = qVendorName === JIANQIAO_VENDOR_NAME && qJenisLayanan === 'Sea Freight';

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [vendorRes, quotationRes] = await Promise.all([
        supabase.from('far_overseas_vendor_master').select('*').order('vendor_name'),
        supabase.from('far_overseas_tarif_quotation').select('*').order('periode_mulai', { ascending: false }),
      ]);
      if (vendorRes.error) throw vendorRes.error;
      if (quotationRes.error) throw quotationRes.error;
      const qRows: Quotation[] = quotationRes.data || [];
      setVendors(vendorRes.data || []);
      setQuotations(qRows);

      const ids = qRows.map(q => q.id);
      if (ids.length > 0) {
        const { data: detailRows, error: detailErr } = await supabase
          .from('far_overseas_tarif_quotation_detail')
          .select('*')
          .in('quotation_id', ids)
          .order('berat_min');
        if (detailErr) throw detailErr;
        const grouped: Record<string, QuotationDetail[]> = {};
        (detailRows || []).forEach((d: QuotationDetail) => {
          if (!grouped[d.quotation_id]) grouped[d.quotation_id] = [];
          grouped[d.quotation_id].push(d);
        });
        setDetailsByQuotation(grouped);
      } else {
        setDetailsByQuotation({});
      }
    } catch (e: any) {
      showToast('Gagal memuat data: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const activeVendors = useMemo(() => vendors.filter(v => v.aktif), [vendors]);

  // Kelompokkan quotation per kombinasi vendor+jenis+origin+tujuan+kategori_barang -- 1 grup =
  // 1 rute layanan, isinya riwayat periode (bisa >1 quotation kalau harga pernah berubah).
  const groups = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    const map = new Map<string, Quotation[]>();
    for (const rec of quotations) {
      if (!showInactiveQuotations && !rec.aktif) continue;
      if (filterVendor !== 'semua' && rec.vendor_name !== filterVendor) continue;
      if (q) {
        const hay = `${rec.origin} ${rec.tujuan} ${rec.jenis_layanan} ${rec.kategori_barang || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = groupKeyOf(rec);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rec);
    }
    const list = Array.from(map.entries()).map(([key, recs]) => {
      recs.sort((a, b) => (b.periode_mulai || '').localeCompare(a.periode_mulai || ''));
      return { key, recs, head: recs[0] };
    });
    list.sort((a, b) => {
      const va = a.head.vendor_name.localeCompare(b.head.vendor_name);
      if (va !== 0) return va;
      const vo = a.head.origin.localeCompare(b.head.origin);
      if (vo !== 0) return vo;
      return a.head.tujuan.localeCompare(b.head.tujuan);
    });
    return list;
  }, [quotations, filterVendor, filterSearch, showInactiveQuotations]);

  // Reset ke halaman 1 tiap kali filter berubah -- kalau tidak, bisa nyangkut di halaman
  // kosong (mis. sedang di hal. 3, lalu filter dipersempit sampai cuma 1 halaman hasil).
  useEffect(() => {
    setPage(1);
  }, [filterVendor, filterSearch, showInactiveQuotations]);

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const validPage = Math.min(page, totalPages);
  const paginatedGroups = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, validPage]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleQuotation = (id: string) => {
    setExpandedQuotations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resetQuotationForm = () => {
    setQEditingId(null);
    setQCloseOldId(null);
    setQVendorName(activeVendors[0]?.vendor_name || '');
    setQJenisLayanan(JENIS_LAYANAN_OPTIONS[0]);
    setQOrigin('');
    setQTujuan('');
    setQKategoriBarang('');
    setQMataUang('IDR');
    setQPeriodeMulai('');
    setQPeriodeSelesai('');
  };

  const openNewQuotationModal = () => {
    resetQuotationForm();
    setIsQuotationModalOpen(true);
  };

  const openEditQuotationModal = (rec: Quotation) => {
    setQEditingId(rec.id);
    setQCloseOldId(null);
    setQVendorName(rec.vendor_name);
    setQJenisLayanan(rec.jenis_layanan);
    setQOrigin(rec.origin);
    setQTujuan(rec.tujuan);
    setQKategoriBarang(rec.kategori_barang || '');
    setQMataUang(rec.mata_uang);
    setQPeriodeMulai(rec.periode_mulai);
    setQPeriodeSelesai(rec.periode_selesai || '');
    setIsQuotationModalOpen(true);
  };

  // "Update Harga (Buat Periode Baru)" -- prefill quotation baru dgn kombinasi SAMA persis dari
  // quotation lama, periode_mulai default = periode tutup + 1 hari. Quotation lama BARU ditutup
  // saat submit berhasil (2 langkah dijalankan sekaligus di handleSaveQuotation).
  const openRenewQuotationModal = (rec: Quotation) => {
    setQEditingId(null);
    setQCloseOldId(rec.id);
    setQVendorName(rec.vendor_name);
    setQJenisLayanan(rec.jenis_layanan);
    setQOrigin(rec.origin);
    setQTujuan(rec.tujuan);
    setQKategoriBarang(rec.kategori_barang || '');
    setQMataUang(rec.mata_uang);
    const today = new Date().toISOString().slice(0, 10);
    setQPeriodeMulai(today);
    setQPeriodeSelesai('');
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingQuotation(true);
      if (qCloseOldId) {
        const closeDate = addOneDay(qPeriodeMulai) === qPeriodeMulai ? qPeriodeMulai : (() => {
          // Tutup quotation lama PERSIS 1 hari sebelum periode_mulai quotation baru.
          const d = new Date(qPeriodeMulai + 'T00:00:00');
          d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })();
        const { error: closeErr } = await supabase.rpc('upsert_far_overseas_tarif_quotation', {
          p_id: qCloseOldId,
          p_vendor_name: qVendorName,
          p_jenis_layanan: qJenisLayanan,
          p_origin: qOrigin,
          p_tujuan: qTujuan,
          p_kategori_barang: showKategoriBarang && qKategoriBarang ? qKategoriBarang : null,
          p_mata_uang: qMataUang,
          p_periode_mulai: quotations.find(q => q.id === qCloseOldId)?.periode_mulai,
          p_periode_selesai: closeDate,
        });
        if (closeErr) throw closeErr;
      }

      const { error } = await supabase.rpc('upsert_far_overseas_tarif_quotation', {
        p_id: qEditingId,
        p_vendor_name: qVendorName || null,
        p_jenis_layanan: qJenisLayanan || null,
        p_origin: qOrigin || null,
        p_tujuan: qTujuan || null,
        p_kategori_barang: showKategoriBarang && qKategoriBarang ? qKategoriBarang : null,
        p_mata_uang: qMataUang || null,
        p_periode_mulai: qPeriodeMulai || null,
        p_periode_selesai: qPeriodeSelesai || null,
      });
      if (error) throw error;

      showToast('Quotation berhasil disimpan', 'success');
      setIsQuotationModalOpen(false);
      fetchAll();
    } catch (err: any) {
      showToast('Gagal menyimpan quotation: ' + err.message, 'error');
    } finally {
      setSavingQuotation(false);
    }
  };

  const handleNonaktifkanQuotation = async (id: string) => {
    if (!window.confirm('Nonaktifkan quotation ini? (jarang dipakai, hanya kalau quotation salah total)')) return;
    try {
      const { error } = await supabase.rpc('nonaktifkan_far_overseas_tarif_quotation', { p_id: id });
      if (error) throw error;
      showToast('Quotation dinonaktifkan', 'success');
      fetchAll();
    } catch (err: any) {
      showToast('Gagal menonaktifkan quotation: ' + err.message, 'error');
    }
  };

  const openDetailForm = (quotationId: string, existing?: QuotationDetail) => {
    setDetailForms(prev => ({
      ...prev,
      [quotationId]: existing ? {
        id: existing.id,
        berat_min: String(existing.berat_min),
        berat_max: existing.berat_max != null ? String(existing.berat_max) : '',
        harga_per_kg: existing.harga_per_kg != null ? String(existing.harga_per_kg) : '',
        isCbmRange: existing.harga_per_cbm_min != null || existing.harga_per_cbm_max != null,
        harga_per_cbm: existing.harga_per_cbm != null ? String(existing.harga_per_cbm) : '',
        harga_per_cbm_min: existing.harga_per_cbm_min != null ? String(existing.harga_per_cbm_min) : '',
        harga_per_cbm_max: existing.harga_per_cbm_max != null ? String(existing.harga_per_cbm_max) : '',
        ppn_status: existing.ppn_status || 'Non-PPN',
        notes: existing.notes || '',
      } : {
        id: null, berat_min: '', berat_max: '', harga_per_kg: '',
        isCbmRange: false, harga_per_cbm: '', harga_per_cbm_min: '', harga_per_cbm_max: '',
        ppn_status: 'Non-PPN', notes: '',
      },
    }));
  };

  const closeDetailForm = (quotationId: string) => {
    setDetailForms(prev => ({ ...prev, [quotationId]: null }));
  };

  const handleSaveDetail = async (quotationId: string) => {
    const form = detailForms[quotationId];
    if (!form) return;
    if (form.berat_min === '') {
      showToast('Berat Min wajib diisi', 'error');
      return;
    }
    try {
      setSavingDetailFor(quotationId);
      const { error } = await supabase.rpc('upsert_far_overseas_tarif_quotation_detail', {
        p_id: form.id,
        p_quotation_id: quotationId,
        p_berat_min: Number(form.berat_min),
        p_berat_max: form.berat_max !== '' ? Number(form.berat_max) : null,
        p_harga_per_kg: form.harga_per_kg !== '' ? Number(form.harga_per_kg) : null,
        p_harga_per_cbm: !form.isCbmRange && form.harga_per_cbm !== '' ? Number(form.harga_per_cbm) : null,
        p_harga_per_cbm_min: form.isCbmRange && form.harga_per_cbm_min !== '' ? Number(form.harga_per_cbm_min) : null,
        p_harga_per_cbm_max: form.isCbmRange && form.harga_per_cbm_max !== '' ? Number(form.harga_per_cbm_max) : null,
        p_ppn_status: form.ppn_status,
        p_notes: form.notes || null,
      });
      if (error) throw error;
      showToast('Detail harga disimpan', 'success');
      closeDetailForm(quotationId);
      fetchAll();
    } catch (err: any) {
      showToast('Gagal menyimpan detail harga: ' + err.message, 'error');
    } finally {
      setSavingDetailFor(null);
    }
  };

  const handleDeleteDetail = async (id: string) => {
    if (!window.confirm('Hapus rentang berat ini?')) return;
    try {
      const { error } = await supabase.rpc('hapus_far_overseas_tarif_quotation_detail', { p_id: id });
      if (error) throw error;
      showToast('Rentang berat dihapus', 'success');
      fetchAll();
    } catch (err: any) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim()) return;
    try {
      setSavingVendor(true);
      const { error } = await supabase.rpc('upsert_far_overseas_vendor_master', {
        p_id: null, p_vendor_name: newVendorName.trim(), p_aktif: true,
      });
      if (error) throw error;
      showToast('Vendor baru ditambahkan', 'success');
      setNewVendorName('');
      fetchAll();
    } catch (err: any) {
      showToast('Gagal menambah vendor: ' + err.message, 'error');
    } finally {
      setSavingVendor(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-1 pb-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <PlaneTakeoff size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Tarif Vendor FAR Overseas Air</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Kelola quotation & riwayat harga per vendor, rute, dan periode.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-8">
        {toast && (
          <div className={`mb-4 p-3 rounded-lg border font-medium text-sm ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-nowrap items-center gap-3 overflow-x-auto">
          <select
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
            className="shrink-0 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-[#5A305A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] w-56"
          >
            <option value="semua">Semua Vendor</option>
            {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
          </select>
          <input
            type="text"
            placeholder="Cari Origin / Tujuan / Jenis Layanan / Kategori..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="shrink-0 w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A]"
          />
          <label className="shrink-0 flex items-center gap-2 cursor-pointer text-sm text-[#5A305A] font-medium whitespace-nowrap">
            <input type="checkbox" checked={showInactiveQuotations} onChange={e => setShowInactiveQuotations(e.target.checked)} className="w-4 h-4 rounded text-[#5A305A] focus:ring-[#5A305A]" />
            Tampilkan yang nonaktif juga
          </label>
          <div className="shrink-0 text-sm text-[#5A305A] font-medium whitespace-nowrap">
            {groups.length} rute
          </div>
          {canEditVendorTarif && (
            <div className="shrink-0 ml-auto flex items-center gap-2">
              <button
                onClick={() => setIsVendorModalOpen(true)}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-[#5A305A] font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2"
              >
                <Settings2 size={15} /> Kelola Vendor
              </button>
              <button
                onClick={openNewQuotationModal}
                className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2"
              >
                <Plus size={15} /> Tambah Quotation Baru
              </button>
            </div>
          )}
        </div>

        {/* List riwayat per rute */}
        <div className="space-y-3">
          {loading ? (
            <LoadingState fullHeight={false} />
          ) : groups.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-sm text-[#5A305A]">
              Tidak ada quotation ditemukan.
            </div>
          ) : (
            paginatedGroups.map(({ key, recs, head }) => {
              const isOpen = expandedGroups.has(key);
              const activeRec = recs.find(r => r.aktif && r.periode_selesai == null) || recs[0];
              return (
                <div key={key} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? <ChevronDown size={16} className="text-[#5A305A] shrink-0" /> : <ChevronRightIcon size={16} className="text-[#5A305A] shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#5A305A] truncate">
                          {head.vendor_name} — {head.origin} → {head.tujuan}
                        </div>
                        <div className="text-xs text-[#5A305A] font-light truncate">
                          {head.jenis_layanan}{head.kategori_barang ? ` · ${head.kategori_barang}` : ''} · {recs.length} periode
                        </div>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      activeRec?.periode_selesai == null && activeRec?.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-[#5A305A]'
                    }`}>
                      {activeRec?.periode_selesai == null && activeRec?.aktif ? 'Berlaku' : 'Semua ditutup'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {recs.map(rec => {
                        const isQuotationOpen = expandedQuotations.has(rec.id);
                        const details = detailsByQuotation[rec.id] || [];
                        const form = detailForms[rec.id];
                        const isMasihBerlaku = rec.periode_selesai == null;
                        return (
                          <div key={rec.id} className={`px-4 py-3 ${!rec.aktif ? 'opacity-50' : ''}`}>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <button
                                onClick={() => toggleQuotation(rec.id)}
                                className="flex items-center gap-2 text-left"
                              >
                                {isQuotationOpen ? <ChevronDown size={14} className="text-[#5A305A]" /> : <ChevronRightIcon size={14} className="text-[#5A305A]" />}
                                <span className="text-sm font-semibold text-[#5A305A]">
                                  {formatDateDMY(rec.periode_mulai)} {'->'} {rec.periode_selesai ? formatDateDMY(rec.periode_selesai) : 'Sekarang'}
                                </span>
                                <span className="text-xs text-[#5A305A] font-light">({rec.mata_uang}, {details.length} rentang berat)</span>
                                {!rec.aktif && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-[#5A305A]">Nonaktif</span>}
                              </button>
                              {canEditVendorTarif && rec.aktif && (
                                <div className="flex items-center gap-2">
                                  {isMasihBerlaku && (
                                    <button
                                      onClick={() => { openRenewQuotationModal(rec); }}
                                      className="text-xs bg-[#5A305A]/5 hover:bg-[#5A305A]/10 text-[#5A305A] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                                    >
                                      Update Harga (Buat Periode Baru)
                                    </button>
                                  )}
                                  <button
                                    onClick={() => openEditQuotationModal(rec)}
                                    className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] font-medium px-2.5 py-1 rounded-lg transition-colors shadow-sm"
                                  >
                                    Edit Info
                                  </button>
                                  <button
                                    onClick={() => handleNonaktifkanQuotation(rec.id)}
                                    className="text-xs bg-white border border-slate-200 hover:bg-red-50 text-[#5A305A] hover:text-red-600 font-medium px-2.5 py-1 rounded-lg transition-colors shadow-sm"
                                  >
                                    Nonaktifkan
                                  </button>
                                </div>
                              )}
                            </div>

                            {isQuotationOpen && (
                              <div className="mt-3 ml-6">
                                <div className="overflow-x-auto rounded-xl border border-slate-100">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-3 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider">Berat (Kg)</th>
                                        <th className="px-3 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider">Unit Price</th>
                                        <th className="px-3 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider">PPN</th>
                                        <th className="px-3 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider">Notes</th>
                                        {canEditVendorTarif && <th className="px-3 py-2 text-[11px] font-bold text-[#5A305A] uppercase tracking-wider text-center">Aksi</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {details.length === 0 && !form ? (
                                        <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-[#5A305A]">Belum ada rentang berat.</td></tr>
                                      ) : details.map(d => (
                                        <tr key={d.id} className="hover:bg-slate-50/50">
                                          <td className="px-3 py-2 text-sm text-[#5A305A] font-mono whitespace-nowrap">{formatWeight(d.berat_min, d.berat_max)}</td>
                                          <td className="px-3 py-2 text-sm text-[#5A305A] font-mono whitespace-nowrap">
                                            {d.harga_per_kg != null
                                              ? formatMoney(d.harga_per_kg, rec.mata_uang)
                                              : (d.harga_per_cbm_min != null || d.harga_per_cbm_max != null)
                                                ? `${formatMoney(d.harga_per_cbm_min, rec.mata_uang)} - ${formatMoney(d.harga_per_cbm_max, rec.mata_uang)} /CBM`
                                                : d.harga_per_cbm != null ? `${formatMoney(d.harga_per_cbm, rec.mata_uang)} /CBM` : '-'}
                                          </td>
                                          <td className="px-3 py-2 text-sm text-[#5A305A] whitespace-nowrap">{d.ppn_status}</td>
                                          <td className="px-3 py-2 text-sm text-[#5A305A]">{d.notes || '-'}</td>
                                          {canEditVendorTarif && (
                                            <td className="px-3 py-2 text-center">
                                              <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => openDetailForm(rec.id, d)} className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] font-medium px-2 py-1 rounded transition-colors shadow-sm">Edit</button>
                                                <button onClick={() => handleDeleteDetail(d.id)} className="text-xs bg-white border border-slate-200 hover:bg-red-50 text-[#5A305A] hover:text-red-600 font-medium px-2 py-1 rounded transition-colors shadow-sm">Hapus</button>
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {canEditVendorTarif && (
                                  form ? (
                                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Berat Min <span className="text-red-500">*</span></label>
                                          <input type="number" step="any" value={form.berat_min} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, berat_min: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Berat Max (kosongkan = "+")</label>
                                          <input type="number" step="any" value={form.berat_max} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, berat_max: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Harga / Kg</label>
                                          <input type="number" step="any" value={form.harga_per_kg} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, harga_per_kg: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">PPN</label>
                                          <select value={form.ppn_status} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, ppn_status: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                                            <option value="Non-PPN">Non-PPN</option>
                                            <option value="PPN">PPN</option>
                                          </select>
                                        </div>
                                      </div>

                                      <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-[#5A305A]">
                                        <input type="checkbox" checked={form.isCbmRange} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, isCbmRange: e.target.checked } }))} className="w-3.5 h-3.5 rounded" />
                                        Pakai Harga/CBM (bukan Harga/Kg)
                                      </label>
                                      {form.isCbmRange ? (
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Harga / CBM Min</label>
                                            <input type="number" step="any" value={form.harga_per_cbm_min} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, harga_per_cbm_min: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                                          </div>
                                          <div>
                                            <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Harga / CBM Max</label>
                                            <input type="number" step="any" value={form.harga_per_cbm_max} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, harga_per_cbm_max: e.target.value } }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Harga / CBM</label>
                                          <input type="number" step="any" value={form.harga_per_cbm} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, harga_per_cbm: e.target.value } }))} className="w-full max-w-xs border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
                                        </div>
                                      )}

                                      <div>
                                        <label className="block text-[11px] font-semibold text-[#5A305A] mb-1">Notes</label>
                                        <input type="text" value={form.notes} onChange={e => setDetailForms(p => ({ ...p, [rec.id]: { ...p[rec.id]!, notes: e.target.value } }))} placeholder="Cth: Estimasi 3-7 hari" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                                      </div>

                                      <div className="flex justify-end gap-2">
                                        <button onClick={() => closeDetailForm(rec.id)} className="px-3 py-1.5 text-xs font-semibold text-[#5A305A] hover:bg-slate-100 rounded-lg transition-colors">Batal</button>
                                        <button onClick={() => handleSaveDetail(rec.id)} disabled={savingDetailFor === rec.id} className="px-3 py-1.5 text-xs font-semibold bg-[#5A305A] hover:bg-[#73507B] text-white rounded-lg transition-colors">
                                          {savingDetailFor === rec.id ? 'Menyimpan...' : 'Simpan'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => openDetailForm(rec.id)}
                                      className="mt-3 text-xs font-semibold text-[#5A305A] bg-[#5A305A]/5 hover:bg-[#5A305A]/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                      <Plus size={13} /> Tambah Range Berat
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!loading && groups.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-[#5A305A]">
              Menampilkan <span className="font-bold">{(validPage - 1) * pageSize + 1}</span>–<span className="font-bold">{Math.min(validPage * pageSize, groups.length)}</span> dari <span className="font-bold">{groups.length}</span> rute
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={validPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-[#5A305A] font-semibold">Hal. {validPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-[#5A305A] disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Informasi Quotation */}
      {isQuotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-slate-900/50 backdrop-blur-sm pt-10">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="font-bold text-[#5A305A] text-lg">
                {qCloseOldId ? 'Update Harga (Buat Periode Baru)' : qEditingId ? 'Edit Quotation' : 'Tambah Quotation Baru'}
              </h3>
              <button onClick={() => setIsQuotationModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A] transition-all">
                <X size={16} />
              </button>
            </div>

            {qCloseOldId && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Quotation lama akan otomatis ditutup (periode selesai = sehari sebelum periode mulai baru), lalu quotation baru ini dibuat dgn harga baru.
              </div>
            )}

            <form onSubmit={handleSaveQuotation} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Nama Vendor <span className="text-red-500">*</span></label>
                <select required disabled={!!qCloseOldId} value={qVendorName} onChange={e => setQVendorName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#5A305A]/30 disabled:bg-slate-100">
                  <option value="" disabled>Pilih vendor...</option>
                  {activeVendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Periode Mulai <span className="text-red-500">*</span></label>
                  <input required type="date" value={qPeriodeMulai} onChange={e => setQPeriodeMulai(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Periode Selesai (kosongkan = masih berlaku)</label>
                  <input type="date" value={qPeriodeSelesai} onChange={e => setQPeriodeSelesai(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Jenis Layanan <span className="text-red-500">*</span></label>
                <select required disabled={!!qCloseOldId} value={qJenisLayanan} onChange={e => setQJenisLayanan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100">
                  {JENIS_LAYANAN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Origin <span className="text-red-500">*</span></label>
                  <input required disabled={!!qCloseOldId} type="text" value={qOrigin} onChange={e => setQOrigin(e.target.value.toUpperCase())} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" placeholder="Cth: GUANGZHOU" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Destination <span className="text-red-500">*</span></label>
                  <input required disabled={!!qCloseOldId} type="text" value={qTujuan} onChange={e => setQTujuan(e.target.value.toUpperCase())} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" placeholder="Cth: JAKARTA" />
                </div>
              </div>

              {showKategoriBarang && (
                <div>
                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kategori Barang</label>
                  <select disabled={!!qCloseOldId} value={qKategoriBarang} onChange={e => setQKategoriBarang(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100">
                    <option value="">(Tidak spesifik)</option>
                    {KATEGORI_BARANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <p className="text-[11px] text-[#5A305A] leading-tight mt-1">Khusus Jianqiao Sea Freight — kategori barang menentukan tarif yang berbeda.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kurs <span className="text-red-500">*</span></label>
                <select required value={qMataUang} onChange={e => setQMataUang(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  {MATA_UANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsQuotationModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-[#5A305A] hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={savingQuotation} className="px-5 py-2.5 text-sm font-semibold bg-[#5A305A] hover:bg-[#73507B] text-white rounded-xl shadow-sm transition-colors">
                  {savingQuotation ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kelola Vendor */}
      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="font-bold text-[#5A305A] text-lg">Kelola Vendor</h3>
              <button onClick={() => setIsVendorModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A] transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleSaveVendor} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newVendorName}
                  onChange={e => setNewVendorName(e.target.value)}
                  placeholder="Nama vendor baru..."
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#5A305A]/30"
                />
                <button type="submit" disabled={savingVendor || !newVendorName.trim()} className="px-4 py-2 text-sm font-semibold bg-[#5A305A] hover:bg-[#73507B] text-white rounded-lg transition-colors disabled:opacity-50">
                  Tambah
                </button>
              </form>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {vendors.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[#5A305A]">Belum ada vendor.</div>
                ) : vendors.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-[#5A305A]">{v.vendor_name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-[#5A305A]'}`}>
                      {v.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
