// Kartu daftar Bunker (2026-10-31, permintaan user: "ambil preferensi dari kartu Invoice Recap Courier"). Pola SAMA `CourierRecapGroupCard`:
// token `SA_CARD` + `Pill` (SeaAirAuditUi), grid dgn container query lebar KARTU (bukan layar), pembatas tipis, aksen warna di kiri.
// Hanya tampilan -- data, filter, aksi & logika halaman TIDAK berubah. Kartu tetap menjadi penanda "Sedang direview" (`data-review-row`, CompareDocCards `useReviewMark`).
//
// 3 tingkat responsif (lebar KARTU; laptop 14" 1920x1080 skala 150% + zoom app 90% => kartu ±1100px => tingkat B kompak):
//   A  >= 1380px : 1 baris 6 kolom lega, aksi = kolom kanan (grid 2x2 rata, 320px).
//   B  1040-1379px: 1 baris 6 kolom KOMPAK (tombol tetap di kanan, grid 2x2 290px).
//   C  760-1039px: baris 1 = 5 kolom info, baris 2 = strip aksi 1 baris rata kanan.
//   D  < 760px   : 2 kolom x 3 baris bertumpuk.
// Class Tailwind WAJIB literal (`@min-[760px]:...`), jangan disusun lewat interpolasi string (tidak terdeteksi build).
import React from 'react';
import { X, MapPin, Ship } from 'lucide-react';
import { Pill, SA_CARD, type Tone } from './SeaAirAuditUi';
import { bersihkanNilai } from '../utils/bunkerBaText';
import { labStatusEfektif, PEMBAYARAN_META, TAHAP_META, type StatusPembayaran, type TahapBunker } from '../utils/bunkerWorkflow';

const SEP = 'border-[rgba(138,123,155,0.18)]';
// Pembatas vertikal antar kolom info (tingkat B & A); di tingkat C diganti pembatas horizontal tipis.
const sepV = `@min-[760px]:border-l @min-[760px]:pl-4 ${SEP}`;
const sepH = `border-t pt-2.5 @min-[760px]:border-t-0 @min-[760px]:pt-0 ${SEP}`;

const TAHAP_TONE: Record<TahapBunker, Tone> = {
  'DOKUMEN BELUM LENGKAP': 'amber', 'OUTSTANDING TIM BUNKER': 'blue', 'OUTSTANDING FINANCE': 'purple', CLEAR: 'green',
};
// Aksen kiri kartu mengikuti tahap (hanya penanda cepat; labelnya tetap ada di pil).
const TAHAP_ACCENT: Record<TahapBunker, string> = {
  'DOKUMEN BELUM LENGKAP': 'border-l-[#E0A21A]', 'OUTSTANDING TIM BUNKER': 'border-l-[#2F4FA8]', 'OUTSTANDING FINANCE': 'border-l-[#5B2E8C]', CLEAR: 'border-l-[#17663D]',
};
const BAYAR_TONE: Record<StatusPembayaran, Tone> = { 'BELUM BAYAR': 'grey', 'DOWN PAYMENT': 'amber', CLEAR: 'green' };

const Field: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-1.5 min-w-0 text-[12px] leading-snug">
    <span className="mt-[2px] text-[#8A7A8B] shrink-0" aria-hidden="true">{icon}</span>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] leading-tight">{label}</div>
      <div className="font-medium text-[#4A3A5C] [overflow-wrap:anywhere] line-clamp-2" title={value}>{value || '—'}</div>
    </div>
  </div>
);

export function BunkerCard({ row, tahap, matchPct, marked = null, onClearMark, workflow, status, updated, actions }: {
  key?: React.Key;
  row: any;
  tahap?: TahapBunker;
  matchPct: number;
  marked?: string | null;
  onClearMark?: () => void;
  workflow: React.ReactNode; // WorkflowSelect (milik halaman)
  status: React.ReactNode; // StatusBadge (milik halaman)
  updated: string;
  actions: React.ReactNode; // 3 tombol teks + 1 pembungkus ikon (History/Delete), semua `fullWidth`
}) {
  const noPo = bersihkanNilai(row.no_po) || '—';
  const vendor = bersihkanNilai(row.vendor);
  const lokasi = bersihkanNilai(row.lokasi);
  const kapal = bersihkanNilai(row.kapal);
  const lab = labStatusEfektif(row);
  const bayar = row.submitted_to_finance_at ? (row.status_pembayaran as StatusPembayaran) : null;
  const pctClass = matchPct >= 90 ? 'text-[#0D8A5F]' : matchPct >= 60 ? 'text-[#B45309]' : 'text-[#C0262D]';

  const cardCls = marked
    ? 'bg-[#FBF5FA] border border-[#6B3470] border-l-[5px] border-l-[#6B3470] rounded-[14px] ring-2 ring-[#6B3470]/30 shadow-md'
    : `${SA_CARD} border-l-[5px] ${tahap ? TAHAP_ACCENT[tahap] : 'border-l-[#EADFD6]'} hover:shadow-[0_2px_8px_rgba(59,27,61,0.12)]`;

  return (
    <div data-review-row={row.id} data-marked={marked ? 'true' : undefined} className={`relative ${cardCls} overflow-hidden @container transition-shadow`}>
      {marked && (
        <span className="absolute top-1.5 right-3 z-10 inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-[#6B3470] text-white text-[10px] font-bold" title={marked}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" aria-hidden />Sedang direview
          {onClearMark && <button type="button" onClick={onClearMark} aria-label="Hapus penanda" className="ml-0.5 w-4 h-4 rounded-full hover:bg-white/20 inline-flex items-center justify-center"><X size={10} /></button>}
        </span>
      )}
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-3.5 py-3 items-start @min-[760px]:grid-cols-[minmax(200px,1.4fr)_minmax(170px,1fr)_minmax(170px,1.1fr)_minmax(170px,1fr)_90px] @min-[760px]:gap-x-4 @min-[760px]:px-4 @min-[760px]:py-3.5 @min-[760px]:items-center @min-[1040px]:grid-cols-[minmax(170px,1.2fr)_190px_minmax(150px,1fr)_minmax(150px,1fr)_80px_290px] @min-[1040px]:gap-x-3 @min-[1380px]:grid-cols-[minmax(220px,1.3fr)_210px_minmax(170px,1fr)_minmax(190px,0.9fr)_96px_320px] @min-[1380px]:gap-x-4">
        {/* 1. No PO + vendor */}
        <div className="min-w-0 col-start-1 row-start-1 @min-[760px]:[grid-area:auto]">
          <div className="text-[10.5px] text-[#8A7A8B] leading-tight mb-1">Updated {updated}</div>
          <div className="text-[14px] @min-[760px]:text-[15px] font-extrabold text-[#3B2260] leading-tight [overflow-wrap:anywhere]" title={noPo}>
            {noPo.split('/').map((bagian, i) => <React.Fragment key={i}>{i > 0 && <>/<wbr /></>}{bagian}</React.Fragment>)}
          </div>
          <div className="text-[11.5px] text-[#6E5E70] mt-1 line-clamp-2" title={vendor}>{vendor || '—'}</div>
        </div>

        {/* 2. Tahap / lab / pembayaran (pil bertumpuk) */}
        <div className={`min-w-0 col-start-2 row-start-1 @min-[760px]:[grid-area:auto] ${sepV}`}>
          <div className="flex justify-center">
            <div className="flex flex-col items-start gap-1.5">
              {tahap && <Pill tone={TAHAP_TONE[tahap]}>{TAHAP_META[tahap].label}</Pill>}
              {lab && <Pill tone={lab === 'OFFSPEC' ? 'red' : 'green'} title="Lab result status">{lab}</Pill>}
              {row.perlu_test_lab === false && !lab && <Pill tone="grey" title="Test lab decision">No lab test</Pill>}
              {bayar && PEMBAYARAN_META[bayar] && <Pill tone={BAYAR_TONE[bayar]} title="Payment status">Payment · {PEMBAYARAN_META[bayar].label}</Pill>}
            </div>
          </div>
        </div>

        {/* 3. Lokasi & kapal */}
        <div className={`min-w-0 col-start-1 row-start-2 space-y-1.5 @min-[760px]:[grid-area:auto] ${sepV} ${sepH}`}>
          <Field icon={<MapPin size={12} />} label="Location" value={lokasi} />
          <Field icon={<Ship size={12} />} label="Vessel" value={kapal} />
        </div>

        {/* 4. Workflow + status verifikasi */}
        <div className={`min-w-0 col-start-2 row-start-2 @min-[760px]:[grid-area:auto] ${sepV} ${sepH}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] mb-1">Workflow status</div>
          <div className="flex items-center gap-1.5 flex-wrap">{workflow}</div>
          <div className="flex items-center gap-2 flex-wrap mt-2">{status}</div>
        </div>

        {/* 5. Doc match */}
        <div className={`min-w-0 col-start-1 row-start-3 @min-[760px]:[grid-area:auto] ${sepV} ${sepH}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8A7A8B] whitespace-nowrap">Doc match</div>
          <div className={`text-[22px] font-extrabold leading-tight tabular-nums ${pctClass}`} data-card-doc-match>{matchPct}%</div>
        </div>

        {/* 6. Aksi: C = grid 2 kolom (kolom kanan baris 3) | B = strip 1 baris selebar kartu, rata kanan | A = kolom kanan grid 2x2 */}
        <div className={`min-w-0 col-start-2 row-start-3 ${sepH} @min-[760px]:col-span-5 @min-[760px]:col-start-1 @min-[760px]:row-start-auto @min-[760px]:border-t @min-[760px]:pt-3 @min-[1040px]:col-span-1 @min-[1040px]:col-start-auto @min-[1040px]:border-t-0 @min-[1040px]:border-l @min-[1040px]:pl-3 @min-[1040px]:pt-0 @min-[1380px]:pl-4`}>
          <div className="grid grid-cols-2 gap-1.5 w-full max-w-[320px] @min-[760px]:max-w-none @min-[760px]:grid-cols-[repeat(3,minmax(150px,190px))_96px] @min-[760px]:justify-end @min-[1040px]:max-w-[290px] @min-[1040px]:grid-cols-2 @min-[1040px]:justify-stretch @min-[1380px]:max-w-[320px]">{actions}</div>
        </div>
      </div>
    </div>
  );
}
