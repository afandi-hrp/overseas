import { SECTIONS, hitungDppCmp } from './ValidasiHelper';

export const generateValues = (raw: any, docAwb: string, localNpwps: any[]) => {
let newV: any = {};
SECTIONS.forEach(s => s.rows.forEach(r => { newV[r.id] = { src: "", cmp: "" }; }));

  const invF = raw.invoice_freight_v || {};
  const fpF = raw.faktur_pajak_freight || {};
  const idOther = raw.invoice_freight_cost || {}; 
  const awbDet = raw.awb_detail_v || {};
  const invD = raw.invoice_duty_v || {};
  const invDutyCost = raw.invoice_duty_cost || {};
  const fpD = raw.faktur_pajak_duty || {};
  const fi = raw.final_invoice || {};
  const bdjbc = raw.billing_djbc_amount;
  
  const npwpClean = (val: any) => val ? String(val).replace(/D/g, '') : '';
  const findNpwp = (clean: string) => {
     if (!clean) return null;
     const c = npwpClean(clean);
     return localNpwps.find(n => npwpClean(n.npwp) === c) || null;
  };

  const fill = (id: string, srcVal: any, cmpVal: any, srcDisplay?: string, srcNote?: string) => {
           if (newV[id]) {
              newV[id] = { 
                 src: srcVal === null ? null : (srcVal === undefined ? "" : srcVal.toString()), 
                 cmp: cmpVal === null ? null : (cmpVal === undefined ? "" : cmpVal.toString()),
                 srcDisplay: srcDisplay,
                 srcNote: srcNote
              };
           }
        };

        const pibV = raw.pib_v || {};
        const sppbV = raw.sppb_v || {};
        const bpnV = raw.bpn_v || {};
        const ciplV = raw.cipl_v || {};

        const hasInvoiceFreight = invF.subtotal != null || invF.ppn != null || invF.pt_penerima != null;
        const cmpAwbFisik = Object.keys(awbDet).length > 0 ? docAwb : "";

        fill("if01", hasInvoiceFreight ? docAwb : "", docAwb);
        fill("if02", hasInvoiceFreight ? invF.subtotal : "", fpF.subtotal);
        fill("if03", hasInvoiceFreight ? invF.ppn : "", fpF.ppn);
        fill("if04", hasInvoiceFreight ? invF.pt_penerima : "", fpF.pt_pembeli);
        fill("if06", hasInvoiceFreight ? invF.pt_penerima : "", awbDet.pt_name);

        // INVOICE DUTY
        fill("id01", invDutyCost.vat_duty_basis_idr || "", fpD.harga_jual || "");
        fill("id02", invD.ppn, fpD.ppn);
        fill("id03", invD.pt_penerima, fpD.pt_pembeli || "");
        fill("id04", hasInvoiceFreight ? idOther.actual_weight_kg : null, hasInvoiceFreight ? awbDet.weight : null);
        fill("id05", invD.pt_penerima, awbDet.pt_name);

        fill("id06", docAwb, cmpAwbFisik);
        fill("id07", docAwb, sppbV.no_awb || "");
        fill("id08", invD.pt_penerima, sppbV.nama_pt || "");

        // PIB
        fill("pib01", pibV.no_pengajuan || "", sppbV.no_pengajuan || "");
        fill("pib02", pibV.no_awb || "", sppbV.no_awb || "");
        fill("pib03", pibV.no_invoice || "", ciplV.no_invoice || "");
        fill("pib04", pibV.item_value || "", ciplV.total_value || "");
        fill("pib06", pibV.no_invoice || "", fi.inv_no || "");
        fill("pib07", pibV.item_value || "", fi.total_value || "");
        
        // PIB NPWP Lookup
        const pibNpwp = findNpwp(pibV.npwp);
        fill("pib08", pibV.npwp || "", pibNpwp?.npwp || "");
        fill("pib09", pibV.nama_pt || "", pibNpwp?.nama || "");
        fill("pib10", pibV.alamat_npwp || "", pibNpwp?.alamat || "");
        if (newV["pib08"]) newV["pib08"].npwp_status = pibV.npwp && !pibNpwp ? 'not_found' : null;

        // SPPBMCP
        fill("sppb01", sppbV.total_nilai_pabean ?? null, bpnV.cif_penetapan ?? null);
        
        // SPPBMCP NPWP Lookup
        const sppbNpwp = findNpwp(sppbV.npwp);
        fill("sppb02", sppbV.npwp || "", sppbNpwp?.npwp || "");
        fill("sppb03", sppbV.nama_pt || "", sppbNpwp?.nama || "");
        fill("sppb04", sppbV.alamat || "", sppbNpwp?.alamat || "");
        if (newV["sppb02"]) newV["sppb02"].npwp_status = sppbV.npwp && !sppbNpwp ? 'not_found' : null;

        // BILLING DJBC
        fill("bdjbc01", bpnV.nomor_aju || "", pibV.no_pengajuan || "");
        fill("bdjbc02", bdjbc || "", pibV.total_bayar || "");
        fill("bdjbc03", bpnV.nomor_aju || "", bpnV.nomor_dokumen || "");
        fill("bdjbc04", bdjbc || "", bpnV.total || "");

        // CIPL
        fill("cipl01", ciplV.total_value || "", raw.po_total_value || "");
        fill("cipl02", ciplV.penerima_barang || "", raw.po_penerima || "");
        fill("cipl03", ciplV.no_invoice || "", fi.inv_no || "");
        fill("cipl04", ciplV.total_value || "", fi.total_value || "");
        fill("cipl05", raw.cipl_vessel || "", "");

        // PO
        fill("po01", raw.po_vessel || "", "");

        // FINAL INVOICE
        const fiVessel = [
          raw.final_invoice?.vessel,
          raw.final_invoice?.imo_number
        ].filter(Boolean).join(' | ') || "";
        fill("fi01", fiVessel, "");

        // FP FREIGHT Lookup
        const fpFdNpwp = findNpwp(raw.faktur_pajak_freight_npwp);
        fill("fpfd01", raw.faktur_pajak_freight_npwp || "", fpFdNpwp?.npwp || "");
        fill("fpfd02", raw.faktur_pajak_freight_alamat || "", fpFdNpwp?.alamat || "");
        if (newV["fpfd01"]) newV["fpfd01"].npwp_status = raw.faktur_pajak_freight_npwp && !fpFdNpwp ? 'not_found' : null;

        // FP FREIGHT DPP & Referensi
        fill("fpfd05", fpF.dpp || "", hitungDppCmp(fpF.subtotal, fpF.no_seri));
        fill("fpfd06", fpF.no_referensi || "", invF.no_invoice || "");

        // FP DUTY Lookup
        const fpDutyNpwp = findNpwp(raw.faktur_pajak_duty_npwp);
        fill("fpfd03", raw.faktur_pajak_duty_npwp || "", fpDutyNpwp?.npwp || "");
        fill("fpfd04", raw.faktur_pajak_duty_alamat || "", fpDutyNpwp?.alamat || "");
        if (newV["fpfd03"]) newV["fpfd03"].npwp_status = raw.faktur_pajak_duty_npwp && !fpDutyNpwp ? 'not_found' : null;

        // FP DUTY DPP & Referensi
        fill("fpfd07", fpD.dpp || "", hitungDppCmp(fpD.harga_jual, fpD.no_seri));
        fill("fpfd08", fpD.no_referensi || "", invD.no_invoice || "");

        // FP REVISI FREIGHT Lookup
        const fpRF = raw.fp_revisi_freight || {};
        const hasFpRF = Object.keys(fpRF).length > 0 || raw.fp_revisi_freight_npwp !== undefined && raw.fp_revisi_freight_npwp !== null;
        if (hasFpRF) {
            const fpRevNpwp = findNpwp(raw.fp_revisi_freight_npwp);
            fill("fpr01", raw.fp_revisi_freight_npwp || "", fpRevNpwp?.npwp || "");
            fill("fpr02", raw.fp_revisi_freight_alamat || "", fpRevNpwp?.alamat || "");
            if (newV["fpr01"]) newV["fpr01"].npwp_status = raw.fp_revisi_freight_npwp && !fpRevNpwp ? 'not_found' : null;
            fill("fpr05", fpRF.dpp || "", hitungDppCmp(fpRF.subtotal, fpRF.no_seri));
            fill("fpr06", fpRF.no_referensi || "", invF.no_invoice || "");
        } else {
            fill("fpr01", null, null);
            fill("fpr02", null, null);
            fill("fpr05", null, null);
            fill("fpr06", null, null);
        }

        // FP REVISI DUTY Lookup
        const fpRD = raw.fp_revisi_duty || {};
        const hasFpRD = Object.keys(fpRD).length > 0 || raw.fp_revisi_duty_npwp !== undefined && raw.fp_revisi_duty_npwp !== null;
        if (hasFpRD) {
           const fpRevDutyNpwp = findNpwp(raw.fp_revisi_duty_npwp);
           fill("fpr03", raw.fp_revisi_duty_npwp || "", fpRevDutyNpwp?.npwp || "");
           fill("fpr04", raw.fp_revisi_duty_alamat || "", fpRevDutyNpwp?.alamat || "");
           if (newV["fpr03"]) newV["fpr03"].npwp_status = raw.fp_revisi_duty_npwp && !fpRevDutyNpwp ? 'not_found' : null;
           fill("fpr07", fpRD.dpp || "", hitungDppCmp(fpRD.subtotal, fpRD.no_seri));
           fill("fpr08", fpRD.no_referensi || "", invD.no_invoice || "");
        } else {
           fill("fpr03", null, null);
           fill("fpr04", null, null);
           fill("fpr07", null, null);
           fill("fpr08", null, null);
        }

        // SPTNP
        const sptnpV = raw.sptnp_v || {};
        const billingSptnp = raw.billing_sptnp || {};
        const bpnSptnp = raw.bpn_sptnp || {};
        const hasSptnp = sptnpV.no_dokumen != null || sptnpV.total != null;
        if (hasSptnp) {
           fill("sptnp01_a", sptnpV.no_dokumen, billingSptnp.no_dokumen);
           fill("sptnp01_b", sptnpV.no_dokumen, bpnSptnp.no_dokumen);
           fill("sptnp02_a", sptnpV.total, billingSptnp.total);
           fill("sptnp02_b", sptnpV.total, bpnSptnp.total);
           fill("sptnp03_a", sptnpV.npwp, billingSptnp.npwp);
           fill("sptnp03_b", sptnpV.npwp, bpnSptnp.npwp);
           fill("sptnp04_a", sptnpV.nama_pt, billingSptnp.nama_pt);
           fill("sptnp04_b", sptnpV.nama_pt, bpnSptnp.nama_pt);
        } else {
           const ids = ["sptnp01_a", "sptnp01_b", "sptnp02_a", "sptnp02_b", "sptnp03_a", "sptnp03_b", "sptnp04_a", "sptnp04_b"];
           ids.forEach(id => fill(id, null, null));
        }

        // CN INVOICE FREIGHT
        const cnF = raw.credit_note_freight_v || {};
        const hasCnFreight = cnF.subtotal != null || cnF.ppn != null;
        if (hasCnFreight) {
           fill("cnf01_a", cnF.awb_no, docAwb);

           const cnFCount = cnF.count || 1;
           const noteF = cnFCount > 1 ? `(jumlah dari ${cnFCount} credit note)` : undefined;

           const calcOtherFeesF = (invF.subtotal != null && cnF.subtotal != null) ? Number(invF.subtotal) - Number(cnF.subtotal) : null;
           fill("cnf02_b", calcOtherFeesF, fpRF.subtotal, (invF.subtotal != null && cnF.subtotal != null) ? `${Number(invF.subtotal).toLocaleString('id-ID')} - ${Number(cnF.subtotal).toLocaleString('id-ID')}` : undefined, noteF);

           const calcPpnF = (fpF.ppn != null && cnF.ppn != null) ? Number(fpF.ppn) - Number(cnF.ppn) : null;
           fill("cnf03_b", calcPpnF, fpRF.ppn, (fpF.ppn != null && cnF.ppn != null) ? `${Number(fpF.ppn).toLocaleString('id-ID')} - ${Number(cnF.ppn).toLocaleString('id-ID')}` : undefined, noteF);

           fill("cnf04_a", cnF.pt_penerima, invF.pt_penerima);
        } else {
           const ids = ["cnf01_a", "cnf02_b", "cnf03_b", "cnf04_a"];
           ids.forEach(id => fill(id, null, null));
        }

        // CN INVOICE DUTY
        const cnD = raw.credit_note_duty_v || {};
        const hasCnDuty = cnD.subtotal != null || cnD.ppn != null;
        if (hasCnDuty) {
           fill("cnd01_a", cnD.awb_no, docAwb);

           const cnDCount = cnD.count || 1;
           const noteD = cnDCount > 1 ? `(jumlah dari ${cnDCount} credit note)` : undefined;

           const calcOtherFeesD = (fpD.harga_jual != null && cnD.subtotal != null) ? Number(fpD.harga_jual) - Number(cnD.subtotal) : null;
           fill("cnd02_b", calcOtherFeesD, fpRD.subtotal, (fpD.harga_jual != null && cnD.subtotal != null) ? `${Number(fpD.harga_jual).toLocaleString('id-ID')} - ${Number(cnD.subtotal).toLocaleString('id-ID')}` : undefined, noteD);

           const calcPpnD = (fpD.ppn != null && cnD.ppn != null) ? Number(fpD.ppn) - Number(cnD.ppn) : null;
           fill("cnd03_b", calcPpnD, fpRD.ppn, (fpD.ppn != null && cnD.ppn != null) ? `${Number(fpD.ppn).toLocaleString('id-ID')} - ${Number(cnD.ppn).toLocaleString('id-ID')}` : undefined, noteD);

           fill("cnd04_a", cnD.pt_penerima, invD.pt_penerima);
        } else {
           const ids = ["cnd01_a", "cnd02_b", "cnd03_b", "cnd04_a"];
           ids.forEach(id => fill(id, null, null));
        }

        return newV;
};
