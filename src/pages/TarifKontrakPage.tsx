import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, ArrowUp, Tag, ChevronDown, ChevronUp, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import Greeting from '../components/Greeting';

const KATEGORI_OPTIONS = ['PPJK', 'FREIGHT', 'STORAGE', 'SURVEYOR', 'LOLO'];
const SHIPMENT_TYPE_OPTIONS = ['', 'FCL', 'LCL', 'AIR', 'ALL'];
const TARIF_TYPE_OPTIONS = ['FLAT', 'PER_UNIT', 'PERCENTAGE', 'AT_COST', 'VARIABLE'];
const MATA_UANG_OPTIONS = ['IDR', 'USD', 'SGD', 'EUR', 'JPY'];
const PPN_STATUS_OPTIONS = ['BELUM_TERMASUK', 'SUDAH_TERMASUK', 'TIDAK_DISEBUTKAN'];

export default function TarifKontrakPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Filter states
  const [filterKategori, setFilterKategori] = useState('semua');
  const [filterSearch, setFilterSearch] = useState('');

  // Pagination (client-side -- data sudah di-fetch semua sekaligus)
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [kategori, setKategori] = useState('PPJK');
  const [namaJasa, setNamaJasa] = useState('');
  const [shipmentType, setShipmentType] = useState('');
  const [containerLine, setContainerLine] = useState('');
  const [satuan, setSatuan] = useState('');
  const [tarifType, setTarifType] = useState('FLAT');
  const [nominal, setNominal] = useState('');
  const [pctRate, setPctRate] = useState('');
  const [mataUang, setMataUang] = useState('IDR');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [minimumCharge, setMinimumCharge] = useState('');
  const [minimumChargeSatuan, setMinimumChargeSatuan] = useState('');
  const [ppnStatus, setPpnStatus] = useState('BELUM_TERMASUK');
  const [ppnPct, setPpnPct] = useState('');
  const [noQuotation, setNoQuotation] = useState('');
  const [tglTerbit, setTglTerbit] = useState('');
  const [tglBerlaku, setTglBerlaku] = useState('');
  const [syaratKetentuan, setSyaratKetentuan] = useState('');
  const [catatan, setCatatan] = useState('');
  
  // Advanced states
  const [kaliHariJuga, setKaliHariJuga] = useState(false);
  const [roundUpQty, setRoundUpQty] = useState(false);
  const [doubleChargeThreshold, setDoubleChargeThreshold] = useState('');
const [doubleChargeMultiplier, setDoubleChargeMultiplier] = useState('2');
  const [aliasNames, setAliasNames] = useState('');
  const [thresholdBasisQty, setThresholdBasisQty] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: result, error } = await supabase
        .from('tarif_kontrak_seaair')
        .select('*')
        .eq('aktif', true)
        .order('vendor_name');
      
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
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchKat = filterKategori === 'semua' || item.kategori === filterKategori;
      const matchSearch = item.vendor_name?.toLowerCase().includes(filterSearch.toLowerCase()) ||
                          item.nama_jasa?.toLowerCase().includes(filterSearch.toLowerCase());
      return matchKat && matchSearch;
    });
  }, [data, filterKategori, filterSearch]);

  // Reset ke halaman 1 setiap kali filter berubah -- kalau tidak, bisa nyangkut di halaman
  // kosong (mis. sedang di hal. 3, lalu filter dipersempit sampai cuma 1 halaman hasil).
  useEffect(() => {
    setPage(1);
  }, [filterKategori, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const validPage = Math.min(page, totalPages);
  const paginatedData = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, validPage]);

  const openModal = (record?: any) => {
    if (record) {
      setEditingId(record.id);
      setVendorName(record.vendor_name || '');
      setKategori(record.kategori || 'PPJK');
      setNamaJasa(record.nama_jasa || '');
      setShipmentType(record.shipment_type || '');
      setContainerLine(record.container_line || '');
      setSatuan(record.satuan || '');
      setTarifType(record.tarif_type || 'FLAT');
      setNominal(record.nominal?.toString() || '');
      setPctRate(record.pct_rate?.toString() || '');
      setMataUang(record.mata_uang || 'IDR');
      setRangeMin(record.range_min?.toString() || '');
      setRangeMax(record.range_max?.toString() || '');
      setMinimumCharge(record.minimum_charge?.toString() || '');
      setMinimumChargeSatuan(record.minimum_charge_satuan || '');
      setPpnStatus(record.ppn_status || 'BELUM_TERMASUK');
      setPpnPct(record.ppn_pct?.toString() || '');
      setNoQuotation(record.no_quotation || '');
      setTglTerbit(record.tgl_terbit || '');
      setTglBerlaku(record.tgl_berlaku || '');
      setSyaratKetentuan(record.syarat_ketentuan || '');
      setCatatan(record.catatan || '');
      setKaliHariJuga(record.kali_hari_juga || false);
      setRoundUpQty(record.round_up_qty || false);
      setDoubleChargeThreshold(record.double_charge_threshold?.toString() || '');
setDoubleChargeMultiplier(record.double_charge_multiplier?.toString() || '2');
      setAliasNames(record.alias_names || '');
      setThresholdBasisQty(record.threshold_basis_qty?.toString() || '');
      
      if (record.kali_hari_juga || record.round_up_qty || record.double_charge_threshold || record.alias_names || record.threshold_basis_qty) {
         setShowAdvanced(true);
      } else {
         setShowAdvanced(false);
      }
    } else {
      setEditingId(null);
      setVendorName('');
      setKategori('PPJK');
      setNamaJasa('');
      setShipmentType('');
      setContainerLine('');
      setSatuan('');
      setTarifType('FLAT');
      setNominal('');
      setPctRate('');
      setMataUang('IDR');
      setRangeMin('');
      setRangeMax('');
      setMinimumCharge('');
      setMinimumChargeSatuan('');
      setPpnStatus('BELUM_TERMASUK');
      setPpnPct('');
      setNoQuotation('');
      setTglTerbit('');
      setTglBerlaku('');
      setSyaratKetentuan('');
      setCatatan('');
      setKaliHariJuga(false);
      setRoundUpQty(false);
      setDoubleChargeThreshold('');
setDoubleChargeMultiplier('2');
      setAliasNames('');
      setThresholdBasisQty('');
      setShowAdvanced(false);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload: any = {
        vendor_name: vendorName,
        kategori: kategori,
        nama_jasa: namaJasa,
        shipment_type: shipmentType || null,
        container_line: containerLine || null,
        satuan: satuan || null,
        tarif_type: tarifType,
        nominal: nominal ? Number(nominal) : null,
        pct_rate: pctRate ? Number(pctRate) : null,
        mata_uang: mataUang,
        range_min: rangeMin ? Number(rangeMin) : null,
        range_max: rangeMax ? Number(rangeMax) : null,
        minimum_charge: minimumCharge ? Number(minimumCharge) : null,
        minimum_charge_satuan: minimumChargeSatuan || null,
        ppn_status: ppnStatus,
        ppn_pct: ppnPct ? Number(ppnPct) : null,
        no_quotation: noQuotation || null,
        tgl_terbit: tglTerbit || null,
        tgl_berlaku: tglBerlaku || null,
        syarat_ketentuan: syaratKetentuan || null,
        catatan: catatan || null,
        kali_hari_juga: kaliHariJuga,
        round_up_qty: roundUpQty,
        double_charge_threshold: doubleChargeThreshold ? Number(doubleChargeThreshold) : null,
        double_charge_multiplier: doubleChargeMultiplier ? Number(doubleChargeMultiplier) : 2,
        alias_names: aliasNames || null,
        threshold_basis_qty: thresholdBasisQty ? Number(thresholdBasisQty) : null,
        aktif: true
      };
      
      if (editingId) {
         payload.id = editingId;
      }
      
      const { error } = await supabase.from('tarif_kontrak_seaair').upsert(payload);

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

  const handleNonaktifkan = async (id: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menonaktifkan tarif ini?')) return;
    try {
      const { error } = await supabase.rpc('nonaktifkan_tarif_kontrak', { p_id: id });
      if (error) throw error;
      showToast('Tarif dinonaktifkan', 'success');
      fetchData();
    } catch (err: any) {
      showToast('Gagal menonaktifkan tarif: ' + err.message, 'error');
    }
  };

  const formatNominal = (val: number, cur: string) => {
    if (val == null) return '-';
    if (cur === 'IDR') {
      return 'Rp ' + val.toLocaleString('id-ID');
    }
    return cur + ' ' + val.toLocaleString('id-ID');
  };

  const isNominalHidden = ['PERCENTAGE', 'AT_COST', 'VARIABLE'].includes(tarifType);

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-6 pt-1 pb-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <FileText size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Tarif Kontrak Vendor</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">Kelola master tarif dari vendor (Sea & Air).</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-3 pb-8">

        {toast && (
          <div className={`mb-4 p-3 rounded-lg border font-medium text-sm flex items-center ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="flex-1 md:w-48">
              <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kategori</label>
              <select
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              >
                <option value="semua">Semua Kategori</option>
                {KATEGORI_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex-1 md:w-64">
              <label className="block text-xs font-semibold text-[#5A305A] mb-1">Cari Vendor / Jasa</label>
              <input
                type="text"
                placeholder="Ketik nama vendor..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-sm text-[#5A305A] font-medium whitespace-nowrap">
              Total: {filteredData.length} tarif
            </div>
            <button
              onClick={() => openModal()}
              className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2 shrink-0"
            >
              <span>+</span> Tambah Tarif Baru
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Vendor</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Kategori</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Nama Jasa</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Shipment Type</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Satuan</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider">Tarif Type</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-right">Nominal</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-center">PPN Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-[#5A305A] uppercase tracking-wider text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#5A305A]">
                      Memuat data...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#5A305A]">
                      Tidak ada tarif ditemukan.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-[#5A305A] font-semibold">{rec.vendor_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="bg-slate-100 text-[#5A305A] font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                          {rec.kategori}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#5A305A] font-medium">
                        <div>{rec.nama_jasa}</div>
                        {(rec.kali_hari_juga || rec.round_up_qty || rec.double_charge_threshold || rec.alias_names || rec.threshold_basis_qty) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {rec.kali_hari_juga && <span className="inline-flex items-center text-[10px] bg-slate-100 text-[#5A305A] px-1 py-0.5 rounded border border-slate-200" title="Dikali Jumlah Hari"><Clock size={10} className="mr-0.5"/> x Hari</span>}
                            {rec.round_up_qty && <span className="inline-flex items-center text-[10px] bg-slate-100 text-[#5A305A] px-1 py-0.5 rounded border border-slate-200" title="Pembulatan ke atas"><ArrowUp size={10} className="mr-0.5"/> Round Up</span>}
                            {rec.double_charge_threshold && <span className="inline-flex items-center text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-200" title={`Double Charge jika > ${rec.double_charge_threshold} CBM`}>{rec.double_charge_multiplier}x &gt; {rec.double_charge_threshold}</span>}
{rec.alias_names && <span className="inline-flex items-center text-[10px] bg-slate-100 text-[#5A305A] px-1 py-0.5 rounded border border-slate-200" title={`Alias: ${rec.alias_names}`}><Tag size={10} className="mr-0.5"/> Alias</span>}
                            {rec.threshold_basis_qty && <span className="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded border border-amber-200" title="Ambang Kuantitas Dasar">≤ {rec.threshold_basis_qty}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#5A305A]">{rec.shipment_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#5A305A] font-mono">{rec.satuan || '-'}</td>
                      <td className="px-4 py-3 text-xs text-[#5A305A]">{rec.tarif_type}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#5A305A] text-right font-medium whitespace-nowrap">
                        {rec.tarif_type === 'PERCENTAGE' 
                          ? `${rec.pct_rate}%` 
                          : rec.tarif_type === 'VARIABLE' || rec.tarif_type === 'AT_COST'
                            ? '-'
                            : formatNominal(rec.nominal, rec.mata_uang)}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-[#5A305A] text-center uppercase">{rec.ppn_status.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => openModal(rec)}
                            className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-[#5A305A] hover:text-blue-600 font-medium px-2 py-1 rounded transition-colors shadow-sm"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleNonaktifkan(rec.id)}
                            className="text-xs bg-white border border-slate-200 hover:bg-red-50 text-[#5A305A] hover:text-red-600 font-medium px-2 py-1 rounded transition-colors shadow-sm"
                          >
                            Nonaktifkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filteredData.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-[#5A305A]">
                Menampilkan <span className="font-bold">{(validPage - 1) * pageSize + 1}</span>–<span className="font-bold">{Math.min(validPage * pageSize, filteredData.length)}</span> dari <span className="font-bold">{filteredData.length}</span> tarif
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
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-navy-900/70 backdrop-blur-sm pt-10">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-6 animate-fade-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-[#5A305A] text-lg">{editingId ? 'Edit Tarif Kontrak' : 'Tambah Tarif Baru'}</h3>
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
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Informasi Jasa</h4>
                    
                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Kategori <span className="text-red-500">*</span></label>
                      <select required value={kategori} onChange={e => setKategori(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        {KATEGORI_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Vendor Name <span className="text-red-500">*</span></label>
                      <input required type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Nama Vendor" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Nama Jasa <span className="text-red-500">*</span></label>
                      <input required type="text" value={namaJasa} onChange={e => setNamaJasa(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Contoh: THC / Custom Clearance" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Shipment Type</label>
                        <select value={shipmentType} onChange={e => setShipmentType(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                          {SHIPMENT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o || '(Kosong)'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Container Line</label>
                        <input type="text" value={containerLine} onChange={e => setContainerLine(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: 20', MSL" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Kontrak & PPN</h4>
                    
                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Status PPN <span className="text-red-500">*</span></label>
                      <select required value={ppnStatus} onChange={e => setPpnStatus(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        {PPN_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">PPN Pct (%)</label>
                      <input type="number" step="any" value={ppnPct} onChange={e => setPpnPct(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Contoh: 11" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">No Quotation</label>
                      <input type="text" value={noQuotation} onChange={e => setNoQuotation(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tgl Terbit</label>
                        <input type="date" value={tglTerbit} onChange={e => setTglTerbit(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tgl Berlaku</label>
                        <input type="date" value={tglBerlaku} onChange={e => setTglBerlaku(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kolom 2 */}
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Detail Tarif</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Tarif Type <span className="text-red-500">*</span></label>
                        <select required value={tarifType} onChange={e => setTarifType(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                          {TARIF_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Mata Uang <span className="text-red-500">*</span></label>
                        <select required value={mataUang} onChange={e => setMataUang(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                          {MATA_UANG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    {!isNominalHidden && (
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Nominal Tarif <span className="text-red-500">*</span></label>
                        <input required type="number" step="any" value={nominal} onChange={e => setNominal(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" placeholder="Nominal angka" />
                      </div>
                    )}

                    {tarifType === 'PERCENTAGE' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Persentase (Pct Rate) <span className="text-red-500">*</span></label>
                        <input required type="number" step="any" value={pctRate} onChange={e => setPctRate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono" placeholder="Contoh: 1.5 untuk 1.5%" />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Satuan</label>
                      <input type="text" value={satuan} onChange={e => setSatuan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Contoh: /Cont, Per B/L, dsb" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Range Min (opsional)</label>
                        <input type="number" step="any" value={rangeMin} onChange={e => setRangeMin(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: 0" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Range Max (opsional)</label>
                        <input type="number" step="any" value={rangeMax} onChange={e => setRangeMax(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: 1000" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Min Charge (opsional)</label>
                        <input type="number" step="any" value={minimumCharge} onChange={e => setMinimumCharge(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#5A305A] mb-1">Min Charge Satuan</label>
                        <input type="text" value={minimumChargeSatuan} onChange={e => setMinimumChargeSatuan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Cth: /Shipment" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-[#5A305A] border-b border-slate-200 pb-2">Tambahan</h4>
                    
                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Syarat & Ketentuan</label>
                      <textarea rows={2} value={syaratKetentuan} onChange={e => setSyaratKetentuan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5A305A] mb-1">Catatan Internal</label>
                      <textarea rows={2} value={catatan} onChange={e => setCatatan(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

              </div>

              {/* Aturan Perhitungan Lanjutan */}
              <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                <button 
                  type="button" 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between p-4 bg-slate-100 hover:bg-slate-200 transition-colors text-[#5A305A] font-bold text-sm"
                >
                  <span>Aturan Perhitungan Lanjutan</span>
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showAdvanced && (
                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {/* Kolom Kiri */}
                       <div className="space-y-5">
                         <div>
                            <label className="flex items-start gap-3 cursor-pointer group">
                               <input type="checkbox" checked={kaliHariJuga} onChange={e => setKaliHariJuga(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                               <div>
                                 <span className="text-sm font-semibold text-[#5A305A] block group-hover:text-blue-600 transition-colors">Kalikan dengan jumlah hari juga</span>
                                 <span className="text-[11px] text-[#5A305A] leading-tight block mt-1">Aktifkan kalau tarif ini dihitung 2 dimensi, cth CBM DAN jumlah hari sekaligus (tarif x max(CBM,minimum) x jumlah hari). Kalau satuan sudah '/Hari' saja, TIDAK perlu diaktifkan.</span>
                               </div>
                            </label>
                         </div>
                         <div>
                            <label className="flex items-start gap-3 cursor-pointer group">
                               <input type="checkbox" checked={roundUpQty} onChange={e => setRoundUpQty(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                               <div>
                                 <span className="text-sm font-semibold text-[#5A305A] block group-hover:text-blue-600 transition-colors">Bulatkan ke atas (round up)</span>
                                 <span className="text-[11px] text-[#5A305A] leading-tight block mt-1">Aktifkan kalau nilai CBM/Revton dibulatkan ke atas ke bilangan bulat sebelum dikalikan tarif (cth 4.23 CBM jadi 5 CBM).</span>
                               </div>
                            </label>
                         </div>
                       </div>

                       {/* Kolom Kanan */}
                       <div className="space-y-5">
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                             <h5 className="text-sm font-bold text-[#5A305A] mb-3">Biaya Ganda (Double Charge)</h5>
                             <div className="flex items-center gap-3 mb-2">
                               <div className="flex-1">
                                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Ambang CBM</label>
                                  <input type="number" step="any" value={doubleChargeThreshold} onChange={e => setDoubleChargeThreshold(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Kosongkan kalau tak ada" />
                               </div>
                               <div className="w-24">
                                  <label className="block text-xs font-semibold text-[#5A305A] mb-1">Pengali</label>
                                  <input type="number" step="any" disabled={!doubleChargeThreshold} value={doubleChargeMultiplier} onChange={e => setDoubleChargeMultiplier(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-[#5A305A]" />
                               </div>
                             </div>
                             <p className="text-[11px] text-[#5A305A] leading-tight">Kalau CBM shipment melebihi ambang ini, nominal tarif dikalikan sejumlah Pengali (cth ambang=6, pengali=2 artinya CBM&gt;6 maka tarif dikali 2).</p>
                          </div>
                          
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                             <h5 className="text-sm font-bold text-[#5A305A] mb-2">Ambang Kuantitas Dasar</h5>
                             <div className="mb-2">
                                <input type="number" step="any" value={thresholdBasisQty} onChange={e => setThresholdBasisQty(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Kosongkan kalau tarif ini flat/tidak ada ambang" />
                             </div>
                             <p className="text-[11px] text-[#5A305A] leading-tight">Kuantitas yang SUDAH TERMASUK tarif dasar sebelum biaya tambahan berlaku (cth 10 untuk 'Max 10 Item', 5 untuk '0 s/d 5 CBM', 250 untuk '0 s/d 250 Kgs'). Baris tarif lain dengan nama mengandung 'Additional' akan otomatis dipakai untuk kelebihan di atas ambang ini.</p>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-semibold text-[#5A305A] mb-1">Nama Alternatif</label>
                            <input type="text" value={aliasNames} onChange={e => setAliasNames(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Pisahkan dengan koma, cth: Stripping, Container Unload" />
                            <p className="text-[11px] text-[#5A305A] leading-tight mt-1">Nama lain yang mungkin dipakai di invoice vendor untuk baris tarif yang SAMA (istilah beda tapi maksudnya sama). Sistem akan mencocokkan baris invoice ke SALAH SATU nama ini juga, bukan cuma Nama Jasa.</p>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
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
