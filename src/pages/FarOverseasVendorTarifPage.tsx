import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const VENDOR_OPTIONS = ['OCTAGON LOGISTIC', 'PT. JIANQIAO LOGISTICS INDONESIA'];
const JENIS_LAYANAN_OPTIONS = ['Air Freight', 'Sea Freight', 'Reguler Freight', 'Door to Door (Pick Up)', 'Port to Door (Drop Warehouse)'];
const MATA_UANG_OPTIONS = ['IDR', 'RMB'];
const KATEGORI_BARANG_OPTIONS = ['BATTERY', 'SHAMPOO (CAIRAN LIQUID)', 'REGULER ITEM'];

export default function FarOverseasVendorTarifPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Filter states
  const [filterVendor, setFilterVendor] = useState('semua');
  const [filterSearch, setFilterSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState(VENDOR_OPTIONS[0]);
  const [origin, setOrigin] = useState('');
  const [jenisLayanan, setJenisLayanan] = useState(JENIS_LAYANAN_OPTIONS[0]);
  const [tipeLayanan, setTipeLayanan] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [kategoriBeratLabel, setKategoriBeratLabel] = useState('');
  const [beratMin, setBeratMin] = useState('');
  const [beratMax, setBeratMax] = useState('');
  const [hargaPerKg, setHargaPerKg] = useState('');
  const [isRentangCbm, setIsRentangCbm] = useState(false);
  const [hargaPerCbm, setHargaPerCbm] = useState('');
  const [hargaPerCbmMin, setHargaPerCbmMin] = useState('');
  const [hargaPerCbmMax, setHargaPerCbmMax] = useState('');
  const [mataUang, setMataUang] = useState('IDR');
  const [kategoriBarang, setKategoriBarang] = useState('');
  const [minimalBerat, setMinimalBerat] = useState('');
  const [minimalBeratSatuan, setMinimalBeratSatuan] = useState('');
  const [estimasiWaktu, setEstimasiWaktu] = useState('');
  const [catatan, setCatatan] = useState('');
  const [aktif, setAktif] = useState(true);

  // kategori_barang cuma relevan untuk Jianqiao Sea Freight -- vendor lain / jenis layanan lain tidak pakai field ini.
  const showKategoriBarang = vendorName === 'PT. JIANQIAO LOGISTICS INDONESIA' && jenisLayanan === 'Sea Freight';

  const fetchData = async () => {
    try {
      setLoading(true);
      let query = supabase.from('far_overseas_tarif_vendor').select('*').order('vendor_name').order('origin');
      if (!showInactive) query = query.eq('aktif', true);
      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
    } catch (e: any) {
      showToast('Gagal memuat data: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredData = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return data.filter(item => {
      const matchVendor = filterVendor === 'semua' || item.vendor_name === filterVendor;
      const matchSearch = !q ||
        item.origin?.toLowerCase().includes(q) ||
        item.jenis_layanan?.toLowerCase().includes(q) ||
        item.kategori_barang?.toLowerCase().includes(q);
      return matchVendor && matchSearch;
    });
  }, [data, filterVendor, filterSearch]);

  const resetForm = () => {
    setEditingId(null);
    setVendorName(VENDOR_OPTIONS[0]);
    setOrigin('');
    setJenisLayanan(JENIS_LAYANAN_OPTIONS[0]);
    setTipeLayanan('');
    setTujuan('');
    setKategoriBeratLabel('');
    setBeratMin('');
    setBeratMax('');
    setHargaPerKg('');
    setIsRentangCbm(false);
    setHargaPerCbm('');
    setHargaPerCbmMin('');
    setHargaPerCbmMax('');
    setMataUang('IDR');
    setKategoriBarang('');
    setMinimalBerat('');
    setMinimalBeratSatuan('');
    setEstimasiWaktu('');
    setCatatan('');
    setAktif(true);
  };

  const openModal = (record?: any) => {
    if (record) {
      setEditingId(record.id);
      setVendorName(record.vendor_name || VENDOR_OPTIONS[0]);
      setOrigin(record.origin || '');
      setJenisLayanan(record.jenis_layanan || JENIS_LAYANAN_OPTIONS[0]);
      setTipeLayanan(record.tipe_layanan || '');
      setTujuan(record.tujuan || '');
      setKategoriBeratLabel(record.kategori_berat_label || '');
      setBeratMin(record.berat_min?.toString() || '');
      setBeratMax(record.berat_max?.toString() || '');
      setHargaPerKg(record.harga_per_kg?.toString() || '');
      const rentang = record.harga_per_cbm_min != null || record.harga_per_cbm_max != null;
      setIsRentangCbm(rentang);
      setHargaPerCbm(record.harga_per_cbm?.toString() || '');
      setHargaPerCbmMin(record.harga_per_cbm_min?.toString() || '');
      setHargaPerCbmMax(record.harga_per_cbm_max?.toString() || '');
      setMataUang(record.mata_uang || 'IDR');
      setKategoriBarang(record.kategori_barang || '');
      setMinimalBerat(record.minimal_berat?.toString() || '');
      setMinimalBeratSatuan(record.minimal_berat_satuan || '');
      setEstimasiWaktu(record.estimasi_waktu || '');
      setCatatan(record.catatan || '');
      setAktif(record.aktif !== false);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      // Kirim SEMUA field (bukan cuma yang berubah) -- RPC mengganti nilai lama dengan apapun
      // yang dikirim di sini, kecuali vendor_name/jenis_layanan/mata_uang/aktif yang pakai
      // COALESCE di server jadi aman kalau null.
      const { error } = await supabase.rpc('upsert_tarif_far_overseas_vendor', {
        p_id: editingId,
        p_vendor_name: vendorName || null,
        p_origin: origin || null,
        p_jenis_layanan: jenisLayanan || null,
        p_tipe_layanan: tipeLayanan || null,
        p_tujuan: tujuan || null,
        p_kategori_berat_label: kategoriBeratLabel || null,
        p_berat_min: beratMin !== '' ? Number(beratMin) : null,
        p_berat_max: beratMax !== '' ? Number(beratMax) : null,
        p_harga_per_kg: hargaPerKg !== '' ? Number(hargaPerKg) : null,
        p_harga_per_cbm: isRentangCbm ? null : (hargaPerCbm !== '' ? Number(hargaPerCbm) : null),
        p_harga_per_cbm_min: isRentangCbm ? (hargaPerCbmMin !== '' ? Number(hargaPerCbmMin) : null) : null,
        p_harga_per_cbm_max: isRentangCbm ? (hargaPerCbmMax !== '' ? Number(hargaPerCbmMax) : null) : null,
        p_mata_uang: mataUang || null,
        p_kategori_barang: showKategoriBarang && kategoriBarang ? kategoriBarang : null,
        p_minimal_berat: minimalBerat !== '' ? Number(minimalBerat) : null,
        p_minimal_berat_satuan: minimalBeratSatuan || null,
        p_estimasi_waktu: estimasiWaktu || null,
        p_catatan: catatan || null,
        p_aktif: aktif,
      });

      if (error) throw error;

      showToast('Tarif berhasil disimpan', 'success');
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast('Gagal menyimpan tarif: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNonaktifkan = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menonaktifkan tarif ini?')) return;
    try {
      const { error } = await supabase.rpc('nonaktifkan_tarif_far_overseas_vendor', { p_id: id });
      if (error) throw error;
      showToast('Tarif dinonaktifkan', 'success');
      fetchData();
    } catch (err: any) {
      showToast('Gagal menonaktifkan tarif: ' + err.message, 'error');
    }
  };

  const formatHarga = (val: number | null | undefined, cur: string | null | undefined) => {
    if (val == null) return '-';
    const formatted = val.toLocaleString('id-ID');
    if (!cur) return formatted;
    return cur === 'IDR' ? 'Rp ' + formatted : cur + ' ' + formatted;
  };

  return (
    <div className="flex-1 h-full min-h-screen overflow-y-auto pb-10 bg-gradient-to-br from-[#FFF5C5] to-[#F58C77]">
      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* Header & Back Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/settings" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/60 hover:bg-white shadow-sm text-[#5A305A] transition-all">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Tarif Vendor FAR Overseas Air</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Kelola rate card Octagon Logistic & PT. Jianqiao Logistics Indonesia.</p>
            </div>
          </div>
          <button
            onClick={() => openModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2 shrink-0"
          >
            <span>+</span> Tambah Tarif Baru
          </button>
        </div>

        {toast && (
          <div className={`mb-4 p-3 rounded-lg border font-medium text-sm flex items-center ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {[{ id: 'semua', label: 'Semua Vendor' }, ...VENDOR_OPTIONS.map(v => ({ id: v, label: v }))].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterVendor(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  filterVendor === tab.id ? 'bg-[#5A305A] text-white border-[#5A305A]' : 'bg-white text-[#5A305A] border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1 md:max-w-xs w-full">
              <label className="block text-xs font-semibold text-[#5A305A] mb-1">Cari Origin / Jenis Layanan / Kategori Barang</label>
              <input
                type="text"
                placeholder="Ketik kata kunci..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-[#5A305A] font-medium">
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                Tampilkan yang nonaktif juga
              </label>
              <div className="text-sm text-[#5A305A] font-medium whitespace-nowrap">
                Total: {filteredData.length} tarif
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Origin</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Jenis Layanan</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Tipe Layanan</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Tujuan</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Kategori Berat</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Berat Min-Max</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-right">Harga/Kg</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-right">Harga/CBM</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Kategori Barang</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Min. Berat</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Estimasi Waktu</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-center">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-sm text-[#5A305A]">
                      Memuat data...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-sm text-[#5A305A]">
                      Tidak ada tarif ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((rec) => (
                    <tr key={rec.id} className={`hover:bg-slate-50/50 transition-colors ${!rec.aktif ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-sm text-[#5A305A] font-semibold whitespace-nowrap">{rec.vendor_name}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.origin || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.jenis_layanan || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.tipe_layanan || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.tujuan || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.kategori_berat_label || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A] font-mono whitespace-nowrap">
                        {rec.berat_min != null || rec.berat_max != null ? `${rec.berat_min ?? '-'} - ${rec.berat_max ?? '-'}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-[#5A305A] text-right whitespace-nowrap">{formatHarga(rec.harga_per_kg, rec.mata_uang)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#5A305A] text-right whitespace-nowrap">
                        {rec.harga_per_cbm_min != null || rec.harga_per_cbm_max != null
                          ? `${formatHarga(rec.harga_per_cbm_min, rec.mata_uang)} - ${formatHarga(rec.harga_per_cbm_max, rec.mata_uang)}`
                          : formatHarga(rec.harga_per_cbm, rec.mata_uang)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.kategori_barang || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A] whitespace-nowrap">{rec.minimal_berat != null ? `${rec.minimal_berat} ${rec.minimal_berat_satuan || ''}`.trim() : '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.estimasi_waktu || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${rec.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-[#5A305A]'}`}>
                          {rec.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openModal(rec)}
                            className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] hover:text-blue-600 font-medium px-2 py-1 rounded transition-colors shadow-sm"
                          >
                            Edit
                          </button>
                          {rec.aktif && (
                            <button
                              onClick={() => handleNonaktifkan(rec.id)}
                              className="text-xs bg-white border border-slate-200 hover:bg-red-50 text-[#5A305A] hover:text-red-600 font-medium px-2 py-1 rounded transition-colors shadow-sm"
                            >
                              Nonaktifkan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-navy-900/70 backdrop-blur-sm pt-10">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-6 animate-fade-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-[#5A305A] text-lg">{editingId ? 'Edit Tarif Vendor' : 'Tambah Tarif Baru'}</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[#5A305A] text-sm transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

                {/* Kolom 1 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Informasi Layanan</h4>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Vendor <span className="text-red-500">*</span></label>
                      <select required value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        {VENDOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Jenis Layanan <span className="text-red-500">*</span></label>
                      <select required value={jenisLayanan} onChange={e => setJenisLayanan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        {JENIS_LAYANAN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tipe Layanan</label>
                      <input type="text" value={tipeLayanan} onChange={e => setTipeLayanan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: Consolidation, Direct" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Origin</label>
                        <input type="text" value={origin} onChange={e => setOrigin(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: China" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tujuan</label>
                        <input type="text" value={tujuan} onChange={e => setTujuan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: Jakarta" />
                      </div>
                    </div>

                    {showKategoriBarang && (
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kategori Barang</label>
                        <select value={kategoriBarang} onChange={e => setKategoriBarang(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                          <option value="">(Tidak spesifik)</option>
                          {KATEGORI_BARANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <p className="text-[11px] text-[#5A305A] leading-tight mt-1">Khusus Jianqiao Sea Freight — kategori barang menentukan tarif yang berbeda.</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Kategori & Berat</h4>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kategori Berat Label</label>
                      <input type="text" value={kategoriBeratLabel} onChange={e => setKategoriBeratLabel(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: Semua Berat, 0-100kg" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Berat Min</label>
                        <input type="number" step="any" value={beratMin} onChange={e => setBeratMin(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Berat Max</label>
                        <input type="number" step="any" value={beratMax} onChange={e => setBeratMax(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Minimal Berat</label>
                        <input type="number" step="any" value={minimalBerat} onChange={e => setMinimalBerat(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Satuan Minimal Berat</label>
                        <input type="text" value={minimalBeratSatuan} onChange={e => setMinimalBeratSatuan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: KG, CBM" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kolom 2 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Harga</h4>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Mata Uang <span className="text-red-500">*</span></label>
                      <select required value={mataUang} onChange={e => setMataUang(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        {MATA_UANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Harga / Kg</label>
                      <input type="number" step="any" value={hargaPerKg} onChange={e => setHargaPerKg(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" />
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" checked={isRentangCbm} onChange={e => setIsRentangCbm(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                        <span className="text-xs font-semibold text-[#5A305A]">Harga / CBM berbentuk rentang (bukan angka tunggal)</span>
                      </label>

                      {!isRentangCbm ? (
                        <div>
                          <label className="block text-xs font-semibold text-[#5A305A] mb-1">Harga / CBM</label>
                          <input type="number" step="any" value={hargaPerCbm} onChange={e => setHargaPerCbm(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#5A305A] mb-1">Harga / CBM Min</label>
                            <input type="number" step="any" value={hargaPerCbmMin} onChange={e => setHargaPerCbmMin(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#5A305A] mb-1">Harga / CBM Max</label>
                            <input type="number" step="any" value={hargaPerCbmMax} onChange={e => setHargaPerCbmMax(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Tambahan</h4>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Estimasi Waktu</label>
                      <input type="text" value={estimasiWaktu} onChange={e => setEstimasiWaktu(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: 7-10 hari" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Catatan</label>
                      <textarea rows={3} value={catatan} onChange={e => setCatatan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aktif} onChange={e => setAktif(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm font-semibold text-[#5A305A]">Aktif</span>
                    </label>
                  </div>
                </div>

              </div>

              <div className="mt-6 flex justify-end gap-3 pt-5 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-[#5A305A] hover:bg-slate-100 rounded-xl transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-colors flex items-center gap-2">
                  {saving ? 'Menyimpan...' : 'Simpan Tarif'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}