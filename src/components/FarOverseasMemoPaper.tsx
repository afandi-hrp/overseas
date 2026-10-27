import React, { useEffect, useState } from 'react';
import { downloadSignatureUrl } from '../utils/SignatureHelpers';
import {
  formatMoney, formatDateMemo, LOGO_ASSETS, getApprovalEntries, findApprovalEntry, implicitFxRate,
  type SignerConfig, type ApprovalEntry,
} from '../utils/FarOverseasAirHelpers';

// Kertas memo FAR (replika dokumen resmi) -- DIEKSTRAK dari FarOverseasAirDetailModal.tsx
// (redesain tahap 1, 2026-09-28) supaya modal Approval DAN tab "Memo preview" di modal Edit
// merender kertas yang IDENTIK (Edit mengoper `rec` yang sudah digabung pending edit, jadi
// preview ikut berubah saat user mengetik). Label memo Bahasa Inggris sesuai spek redesain;
// ISI Notes 1-4 tetap teks Bahasa Indonesia apa adanya dari DB (format baku perusahaan).
// `vessel_internal_note` SENGAJA tidak pernah dirender di kertas memo.

function CompanyLogo({ signer }: { signer: SignerConfig | null }) {
  const asset = signer?.company_code ? LOGO_ASSETS[signer.company_code] : null;
  if (asset) {
    return <img src={asset} alt={signer?.company_name_full || 'Logo'} className="h-16 object-contain shrink-0" />;
  }
  return (
    <div className="text-sm font-extrabold text-[#6B3470] leading-tight uppercase text-center px-2">
      {signer?.company_name_full || <span className="text-[#6E5E70] font-medium normal-case italic">Paying PT not set</span>}
    </div>
  );
}

function MemoField({ label, value, bold, labelWidth = 'w-32' }: { label: string; value: React.ReactNode; bold?: boolean; labelWidth?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`${labelWidth} shrink-0 ${bold ? 'font-bold' : ''}`}>{label}</span>
      <span className="shrink-0">:</span>
      <span className={`break-words min-w-0 ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

// Gambar tanda tangan (snapshot, `approvals[].signature_path`) diunduh berotentikasi -> object URL (sql/083). Gagal / tanpa tanda tangan = tidak ada gambar (garis kosong).
function useSignatureUrls(paths: string[]): Record<string, string> {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) { setUrls({}); return; }
    let alive = true;
    const created: string[] = [];
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(key.split('|').map(async p => { const u = await downloadSignatureUrl(p); if (u) { created.push(u); out[p] = u; } }));
      if (alive) setUrls(out);
    })();
    return () => { alive = false; created.forEach(u => URL.revokeObjectURL(u)); };
  }, [key]);
  return urls;
}

function SignatureColumn({ label, role, entry, nama, signatureUrl }: { label: string; role: string | null; entry?: ApprovalEntry; nama: string | null; signatureUrl?: string | null }) {
  return (
    <div className="flex-1 min-w-0 text-center px-1.5">
      <div className="relative">
        <p className="text-[11px] mb-12 min-h-[16px]">{label}</p>
        <div className="border-b border-[#2A1A2C] h-6" />
        {/* Tanda tangan di atas garis, di atas nama (area label + ruang kosong = 64px). */}
        {signatureUrl && <img src={signatureUrl} alt={`Signature of ${nama || 'approver'}`} data-memo-signature className="absolute left-1/2 -translate-x-1/2 bottom-[2px] max-h-[62px] max-w-[88%] object-contain pointer-events-none" />}
      </div>
      <div className="mb-1" />
      <p className="text-[11px] font-bold uppercase break-words">{nama || '( _______________ )'}</p>
      <p className="text-[10px] text-[#6E5E70] mt-0.5 uppercase">{role || '-'}</p>
      <p className="text-[10px] text-[#6E5E70] mt-1">{entry?.approved_at ? `Date: ${formatDateMemo(entry.approved_at)}` : ' '}</p>
    </div>
  );
}

export default function FarOverseasMemoPaper({ rec, signer }: { rec: any; signer: SignerConfig | null }) {
  const entries = getApprovalEntries(rec);
  const eximEntry = findApprovalEntry(entries, 'TIER1');
  const picEntry = findApprovalEntry(entries, 'PIC');
  const tier2Entry = findApprovalEntry(entries, 'TIER2');
  const tier3Entry = findApprovalEntry(entries, 'TIER3');
  const fx = implicitFxRate(rec);
  const hasOther = rec.clearance_other_total != null && rec.clearance_other_total !== '' && Number(rec.clearance_other_total) !== 0;
  const preparedRole = signer?.tier1_role || 'EXIM OFFICER';
  // PIC Shipment OPSIONAL (sql/072): kolom tanda tangan PIC (kolom ke-2 "Exim Officer") HANYA tampil bila PIC dipilih (`pic_user_id`) atau tahap PIC sudah
  // benar-benar ditandatangani (data lama). Skip -> disembunyikan, juga di cetak & preview Edit memo (rec = memo + perubahan belum tersimpan).
  const showPicColumn = !!rec.pic_user_id || !!picEntry;
  const sigUrls = useSignatureUrls([eximEntry, showPicColumn ? picEntry : undefined, tier2Entry, tier3Entry].map(e => e?.signature_path || '').filter(Boolean));
  const sigOf = (e?: ApprovalEntry) => (e?.signature_path ? sigUrls[e.signature_path] || null : null);

  return (
    <div className="bg-white border-2 border-[#2A1A2C] text-[#2A1A2C] print:border-[#2A1A2C]">
      {/* Header: logo | judul | Memo No / Date */}
      <div className="flex flex-col sm:flex-row print:flex-row border-b-2 border-[#2A1A2C]">
        <div className="sm:w-[34%] print:w-[34%] border-b-2 sm:border-b-0 print:border-b-0 sm:border-r-2 print:border-r-2 border-[#2A1A2C] flex items-center justify-center p-1 min-h-[64px]">
          <CompanyLogo signer={signer} />
        </div>
        <div className="flex-1 flex items-center justify-center p-2 bg-[#F5EDF3]/60 print:bg-transparent">
          <h1 className="text-base md:text-lg font-extrabold uppercase tracking-wide text-center">{rec.memo_title || '-'}</h1>
        </div>
        <div className="sm:w-[28%] print:w-[28%] border-t-2 sm:border-t-0 print:border-t-0 sm:border-l-2 print:border-l-2 border-[#2A1A2C] text-xs flex flex-col justify-center">
          {rec.memo_no && (
            <div className="px-3 py-1.5 border-b border-[#2A1A2C]"><MemoField label="Memo No" labelWidth="w-16" value={<span className="font-bold">{rec.memo_no}</span>} /></div>
          )}
          <div className="px-3 py-1.5"><MemoField label="Date" labelWidth="w-16" value={<span className="font-bold">{formatDateMemo(rec.created_at)}</span>} /></div>
        </div>
      </div>

      {/* Field -- PO/Supplier (kiri) & Inv. No/Date (kanan) SENGAJA 2 kolom independen supaya
          Inv. No & Inv. Date tetap rapat walau PO. No panjang/wrap banyak baris. */}
      <div className="p-4 text-[13px]">
        <div className="flex flex-col md:flex-row print:flex-row md:items-start print:items-start gap-2 md:gap-6 print:gap-6">
          <div className="flex-1 min-w-0 space-y-1.5">
            <MemoField label="PO. No." value={rec.po_ori || '—'} />
            <MemoField label="Supplier" value={rec.vendor || '—'} />
            <MemoField label="Buyer" value={rec.buyer_name || '—'} />
            <MemoField label="Ship Via" value={<span className="font-bold">{rec.ship_via || '—'}</span>} />
            <MemoField label="Departure Date" value={rec.departure_date ? formatDateMemo(rec.departure_date) : '—'} />
            <MemoField label="Weight" value={rec.qty != null && rec.qty !== '' ? `${rec.qty} ${rec.weight_unit || ''}`.trim() : '—'} />
            <MemoField label="Price /Kg" value={formatMoney(rec.unit_price, rec.unit_price_currency)} />
            {hasOther && <MemoField label="Freight" value={formatMoney(rec.freight_amount, rec.total_amount_currency)} />}
            {hasOther && <MemoField label="Other Charges" value={formatMoney(rec.clearance_other_total, rec.total_amount_currency)} />}
            <MemoField
              label="TOTAL AMOUNT"
              bold
              value={
                <span className="text-[15px]">
                  {formatMoney(rec.total_amount, rec.total_amount_currency)}
                  {fx != null && (
                    <span className="font-normal text-[11px] ml-1.5">
                      (Rp {Number(rec.total_amount_idr).toLocaleString('id-ID', { maximumFractionDigits: 0 })} · 1 {rec.total_amount_currency} = IDR {fx.toLocaleString('id-ID', { maximumFractionDigits: 2 })})
                    </span>
                  )}
                </span>
              }
            />
          </div>
          <div className="md:w-56 print:w-56 space-y-1.5">
            <MemoField label="Inv. No" labelWidth="w-20" value={rec.no_invoice || '—'} />
            <MemoField label="Inv. Date" labelWidth="w-20" value={rec.invoice_date ? formatDateMemo(rec.invoice_date) : '—'} />
          </div>
        </div>
      </div>

      {/* NOTE 1-4 -- isi Bahasa Indonesia apa adanya (format baku). Baris kosong tidak dirender. */}
      <div className="border-t-2 border-[#2A1A2C] p-4 text-[13px] flex gap-3">
        <span className="underline font-bold shrink-0">NOTE :</span>
        <div className="space-y-1 min-w-0">
          {rec.route_note && <p>1. {rec.route_note}</p>}
          {(rec.item_description || rec.item_description_manual) && (
            <p>
              2. ITEMS : {rec.item_description || ''}
              {rec.item_description_manual && <span>{rec.item_description ? ' ' : ''}({rec.item_description_manual})</span>}
            </p>
          )}
          {rec.status_note && <p>3. {rec.status_note}</p>}
          {rec.other_note && <p>4. {rec.other_note}</p>}
          {!rec.route_note && !rec.item_description && !rec.item_description_manual && !rec.status_note && !rec.other_note && <p className="text-[#6E5E70] italic">—</p>}
        </div>
      </div>

      {/* Tanda tangan 4 kolom (spek): Prepared By x2 (Exim & PIC Shipment), Checked By x2.
          Nama Prepared By/PIC HANYA muncul setelah tahap itu benar2 ditandatangani (tidak ada
          fallback ke `pic_name` pilihan dropdown); Checked By pakai nama jabatan resmi dari
          `far_overseas_signer_config` (sama perilaku lama). */}
      <div className="border-t-2 border-[#2A1A2C] pt-4 pb-3 px-2">
        <div className="flex">
          {showPicColumn ? (
            <div className="flex-[2] min-w-0 flex border-r border-dashed border-[#EADFD6] print:border-transparent">
              <SignatureColumn label="Prepared By," role={preparedRole} entry={eximEntry} nama={eximEntry?.nama || null} signatureUrl={sigOf(eximEntry)} />
              <SignatureColumn label="" role={preparedRole} entry={picEntry} nama={picEntry?.nama || null} signatureUrl={sigOf(picEntry)} />
            </div>
          ) : (
            /* PIC Shipment dilewati (skip): kolom tanda tangan PIC disembunyikan -> 3 kolom sama lebar (Prepared By, Checked By x2). */
            <div className="flex-1 min-w-0 flex border-r border-dashed border-[#EADFD6] print:border-transparent" data-memo-no-pic>
              <SignatureColumn label="Prepared By," role={preparedRole} entry={eximEntry} nama={eximEntry?.nama || null} signatureUrl={sigOf(eximEntry)} />
            </div>
          )}
          <SignatureColumn label="Checked By," role={signer?.tier2_role || null} entry={tier2Entry} nama={tier2Entry?.nama || signer?.tier2_name || null} signatureUrl={sigOf(tier2Entry)} />
          <SignatureColumn label="Checked By," role={signer?.tier3_role || null} entry={tier3Entry} nama={tier3Entry?.nama || signer?.tier3_name || null} signatureUrl={sigOf(tier3Entry)} />
        </div>
      </div>
    </div>
  );
}

// Baris di bawah kotak memo (tetap ikut tercetak).
export function MemoPaymentLine({ rec }: { rec: any }) {
  return (
    <p className="text-[11px] text-[#2A1A2C] mt-2 px-1">
      PLEASE ARRANGE PAYMENT ON : <span className="font-bold">{rec.expected_payment_date ? formatDateMemo(rec.expected_payment_date) : '____________'}</span>
    </p>
  );
}
