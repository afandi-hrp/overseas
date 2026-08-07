
// Copied and adapted from ValidasiPerhitunganPIB.tsx
const toNum = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v || "").trim();
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const formatCurrency = (val: string) => {
  if (!val) return '';
  const isNegative = val.startsWith('-');
  let str = val.replace(/[^0-9,]/g, '');
  const parts = str.split(',');
  parts[0] = parts[0].replace(/B(?=(d{3})+(?!d))/g, '.');
  let res = parts.join(',');
  return isNegative ? '-' + res : res;
};

const formatForInput = (val: any) => {
  if (val == null || val === '') return '';
  let s = String(val).trim();
  if (/^-?d+(.d+)?$/.test(s)) {
    s = s.replace('.', ',');
  }
  return formatCurrency(s);
};

function statusOf(actualStr: any, expected: number) {
  const a = (String(actualStr) || '').trim();
  if (!a) return 'empty';
  const aNum = toNum(a);
  const diff = Math.abs(aNum - expected);
  return diff <= 1 ? 'match' : 'mismatch';
}

export const calculatePibStats = (raw: any, jenisDokumen: string, kursBiHarian?: number | null) => {
  const pibData = raw.perhitungan_pib_v;
  const cnData = raw.perhitungan_sppbmcp_v;
  const jns = String(jenisDokumen || '').toUpperCase();

  let ndpbm = '';
  let items: any[] = [];
    let aktualPIB = { nilaiPabean: '', bm: '', ppn: '', pph: '', ndpbmXnilai: '', freight: '', asuransi: '' };
  let aktualSPPBMCP = { bm: '', ppn: '', pph: '', sanksiAdm: '' };

  if (jns === 'PIB' && pibData) {
    ndpbm = formatForInput(pibData.ndpbm);
    if (pibData.items && Array.isArray(pibData.items) && pibData.items.length > 0) {
      items = pibData.items.map((it: any) => ({
        nilaiPabean: formatForInput(it.nilai_pabean_item),
        bmPct: formatForInput(it.bm_pct),
        ppnPct: formatForInput(it.ppn_pct ?? '11'),
        phPct: formatForInput(it.pph_pct),
      }));
    }
    aktualPIB = {
      freight: formatForInput(pibData.aktual_freight ?? pibData.nilai_25 ?? ''),
      asuransi: formatForInput(pibData.aktual_asuransi ?? pibData.nilai_24 ?? ''),
      nilaiPabean: formatForInput(pibData.aktual_nilai_pabean),
      bm: formatForInput(pibData.aktual_bm),
      ppn: formatForInput(pibData.aktual_ppn),
      pph: formatForInput(pibData.aktual_pph),
      ndpbmXnilai: formatForInput(pibData.aktual_ndpbm_x_nilai),
    };
  } else if (jns === 'CN' && cnData) {
    ndpbm = formatForInput(cnData.ndpbm);
    if (cnData.items && Array.isArray(cnData.items) && cnData.items.length > 0) {
      items = cnData.items.map((it: any) => ({
        nilaiPabean: formatForInput(it.nilai_pabean_item),
        bmPct: formatForInput(it.bm_pct),
        ppnPct: formatForInput(it.ppn_pct ?? '11'),
        phPct: formatForInput(it.pph_pct),
      }));
    }
    aktualSPPBMCP = {
      bm: formatForInput(cnData.aktual_bm),
      ppn: formatForInput(cnData.aktual_ppn),
      pph: formatForInput(cnData.aktual_pph),
      sanksiAdm: formatForInput(cnData.aktual_sanksi_adm ?? cnData.sanksi_adm ?? ''),
    };
  }

  const ndpbmNum = toNum(ndpbm);
  let totalNilaiPabean = 0, totalBM = 0, totalPPN = 0, totalPPH = 0;

  items.forEach(it => {
    const fc = toNum(it.nilaiPabean);
    const bmPct = toNum(it.bmPct);
    const ppnPct = toNum(it.ppnPct);
    const phPct = toNum(it.phPct);

    const nilaiPabeanRp = fc * ndpbmNum;
    const bmRp = nilaiPabeanRp * (bmPct / 100);
    const basis = nilaiPabeanRp + bmRp;
    const ppnRp = basis * (11 / 100);
    const phRp = basis * (phPct / 100);

    totalNilaiPabean += fc;
    totalBM += bmRp;
    totalPPN += ppnRp;
    totalPPH += phRp;
  });

  const ndpbmXnilai = ndpbmNum * totalNilaiPabean;

  let match = 0, mismatch = 0, empty = 0;

  if (jns === 'PIB') {
    const nilai23 = Number(raw.perhitungan_pib_v?.nilai_23) || 0;
    const aktualFreight = toNum(aktualPIB.freight);
    const aktualAsuransi = toNum(aktualPIB.asuransi);
    const expectedNilaiPabean = nilai23 + aktualFreight + aktualAsuransi;

    [
      { ak: aktualPIB.nilaiPabean, expected: expectedNilaiPabean },
      { ak: aktualPIB.bm, expected: totalBM },
      { ak: aktualPIB.ppn, expected: totalPPN },
      { ak: aktualPIB.pph, expected: totalPPH },
      { ak: aktualPIB.ndpbmXnilai, expected: ndpbmXnilai },
    ].forEach(r => {
      const st = statusOf(r.ak, r.expected);
      if (st === 'match') match++;
      else if (st === 'mismatch') mismatch++;
      else empty++;
    });
  } else if (jns === 'CN') {
    const cnCalc = raw.perhitungan_sppbmcp_v || {};
    const ciplValue = Number(raw.cipl_v?.total_value) || 0;
    const totalInvoiceFreight =
        (Number(raw.invoice_freight_v?.subtotal) || 0)
      + (Number(raw.invoice_freight_v?.ppn) || 0);
    const ciplCurrency = (cnCalc.cipl_currency || '').toUpperCase();

    let expectedTotalNilaiPabeanSppbmcp: number | null = null;
    if (ciplCurrency === 'USD') {
      if (ndpbmNum > 0) {
        const ciplIdr = ciplValue * ndpbmNum;
        const dasarNilaiPabean = ciplIdr + totalInvoiceFreight;
        const asuransiSppbmcp = dasarNilaiPabean * 0.005;
        expectedTotalNilaiPabeanSppbmcp = dasarNilaiPabean + asuransiSppbmcp;
      }
    } else if (ciplCurrency && ciplCurrency !== 'USD') {
      if (kursBiHarian) {
        const ciplIdr = ciplValue * kursBiHarian;
        const dasarNilaiPabean = ciplIdr + totalInvoiceFreight;
        const asuransiSppbmcp = dasarNilaiPabean * 0.005;
        expectedTotalNilaiPabeanSppbmcp = dasarNilaiPabean + asuransiSppbmcp;
      }
    }

    // 1. Total Nilai Pabean — aktual dihitung otomatis dari SUM items[].nilaiPabean x NDPBM (bukan dari field dokumen)
    const akNumTotalPabean = ndpbmXnilai;
    if (expectedTotalNilaiPabeanSppbmcp === null) {
      empty++;
    } else {
      const diff = Math.abs(akNumTotalPabean - expectedTotalNilaiPabeanSppbmcp);
      if (diff <= 1) match++; else mismatch++;
    }

    // 2. Sanksi Administrasi (Expected 0)
    const stSanksi = statusOf(aktualSPPBMCP.sanksiAdm, 0);
    if (stSanksi === 'match') match++;
    else if (stSanksi === 'mismatch') mismatch++;
    else empty++;

    // 3. Total BM+PPN+PPH+Sanksi ADM (Tolerance +- 5000)
    const totalAktualSppbmcp = 
        (Number(toNum(aktualSPPBMCP.bm)) || 0)
      + (Number(toNum(aktualSPPBMCP.ppn)) || 0)
      + (Number(toNum(aktualSPPBMCP.pph)) || 0)
      + (Number(toNum(aktualSPPBMCP.sanksiAdm)) || 0);
    const totalExpectedSppbmcp = totalBM + totalPPN + totalPPH + 0;
    const diffTotal = Math.abs(totalAktualSppbmcp - totalExpectedSppbmcp);
    if (diffTotal <= 5000) match++; else mismatch++;
  }

  return { match, mismatch, empty };
};
