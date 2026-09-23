// Sea & Air Document Validation -- logic pencocokan "relaxed"/fuzzy dipakai `SeaAirValidasiModal.tsx`
// (SATU-SATUNYA tempat asalnya, DIEKSTRAK ke sini 2026-09) DAN badge % Doc Validation di
// `SharedDataTable.tsx` (Rekapan Sea & Air) -- SEBELUMNYA badge cuma baca `c.match` MENTAH dari
// `dokumen_validasi_matriks_seaair.checks` (nilai match versi TERAKHIR DISIMPAN), sementara modal
// selalu HITUNG ULANG `c.match` di client tiap dibuka pakai fuzzyMatch/comparePoSet/matchLocation
// (baris yang dari awal SUDAH match tapi belum pernah disimpan ulang sejak algoritma fuzzy-nya
// diperbarui tetap kebawa nilai match LAMA di DB) -- baris 2 nilai itu bisa BEDA, badge & modal
// jadi tampil % berbeda walau sumber tabelnya sama. Fix: badge SEKARANG panggil
// `relaxSeaAirDocChecks()` yang SAMA sebelum hitung %, supaya kedua tempat SELALU pakai match
// value yang identik. JANGAN duplikat logic pencocokan ini di tempat ketiga -- import dari sini.

const toNum = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v || "").trim();
  if (!s) return 0;

  let cleanStr = s.replace(/[^0-9.,\-]/g, '');

  if (!cleanStr.includes('.') && !cleanStr.includes(',')) {
    const n = parseFloat(cleanStr);
    return isNaN(n) ? 0 : n;
  }

  if (cleanStr.includes('.') && cleanStr.includes(',')) {
     const lastDot = cleanStr.lastIndexOf('.');
     const lastComma = cleanStr.lastIndexOf(',');
     if (lastDot > lastComma) {
        cleanStr = cleanStr.replace(/,/g, '');
     } else {
        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
     }
  } else {
     if (cleanStr.includes(',')) {
        const parts = cleanStr.split(',');
        if (parts[parts.length - 1].length === 3) {
           cleanStr = cleanStr.replace(/,/g, '');
        } else {
           cleanStr = cleanStr.replace(',', '.');
        }
     } else if (cleanStr.includes('.')) {
        const parts = cleanStr.split('.');
        if (parts[parts.length - 1].length === 3) {
           cleanStr = cleanStr.replace(/\./g, '');
        }
     }
  }

  const n = parseFloat(cleanStr);
  return isNaN(n) ? 0 : n;
};

// Untuk field nomor referensi murni (mis. No. Aju/No PIB) -- fuzzyMatch terlalu longgar karena
// salah satu cabangnya membandingkan HURUF SAJA (angka dibuang), jadi dua nomor aju berbeda yang
// kebetulan sama-sama punya kode kantor "JAJ" bisa dianggap match walau angkanya jelas beda.
// Comparator ini butuh kecocokan alfanumerik persis (tanpa toleransi huruf-saja/fuzzy).
const strictAlnumMatch = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;
  const norm = (s: any) => String(s).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const n1 = norm(val1);
  const n2 = norm(val2);
  if (n1 === '' || n2 === '') return false;
  return n1 === n2;
};

// Untuk baris "NO PO" -- nomor PO digabung "+" bisa beda urutan & beda format prefix antar dokumen
// (mis. "2603/0074/IMI" vs "I.PO/IMI.MDN/2603/0074") padahal nomornya sama. Pecah per "+", normalisasi
// tiap item jadi digit-only (biar prefix beda tidak masalah), lalu bandingkan sebagai set (urutan bebas).
const comparePoSet = (refVal: any, docVal: any): boolean => {
  const toDigitSet = (val: any) => String(val).split(/\s*\+\s*/).map(s => s.replace(/[^0-9]/g, '')).filter(Boolean).sort();
  const a = toDigitSet(refVal);
  const b = toDigitSet(docVal);
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

// Untuk baris ORIGIN/DESTINATION -- fuzzyMatch (perbandingan teks murni) tidak cukup di sini
// karena dua alasan: (1) satu dokumen kadang nulis nama pelabuhan lama pakai notasi "(EX ...)"
// (mis. "BUSAN (EX PUSAN)") yang harus diabaikan saat dibanding versi tanpa keterangan itu
// (mis. "BUSAN, KOREA"), dan (2) satu dokumen nulis nama pelabuhan (mis. "TANJUNG PRIOK")
// sementara dokumen lain nulis kota+negara administratifnya (mis. "JAKARTA, INDONESIA") --
// keduanya sama-sama benar & merujuk lokasi yang sama, cuma beda level detail, dan fuzzyMatch
// teks tidak akan pernah menganggap dua kata yang beda total itu mirip. Tambahkan pelabuhan
// lain ke peta ini kalau nanti muncul kasus serupa.
const PORT_TO_CITY_COUNTRY: Record<string, string[]> = {
  'TANJUNG PRIOK': ['JAKARTA', 'INDONESIA'],
  'TANJUNG PERAK': ['SURABAYA', 'INDONESIA'],
  'TANJUNG EMAS': ['SEMARANG', 'INDONESIA'],
  'BELAWAN': ['MEDAN', 'INDONESIA'],
};

const stripPortNotes = (s: string) => s.replace(/\(ex[^)]*\)/gi, '').trim();

const locationParts = (val: any): string[] => {
  const cleaned = stripPortNotes(String(val ?? '')).toLowerCase();
  return cleaned.split(',').map(p => p.trim().replace(/[^a-z0-9 ]/g, '').trim()).filter(Boolean);
};

const matchLocation = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;
  const parts1 = locationParts(val1);
  const parts2 = locationParts(val2);
  if (parts1.length === 0 || parts2.length === 0) return false;

  // Cocok kalau ada bagian yang identik (nama kota/pelabuhan/negara persis sama, mis. "busan")
  if (parts1.some(p1 => parts2.includes(p1))) return true;

  // Cocok lewat pemetaan pelabuhan -> kota+negara (mis. "TANJUNG PRIOK" == "JAKARTA, INDONESIA")
  const expandPorts = (parts: string[]) => parts.flatMap(p => PORT_TO_CITY_COUNTRY[p.toUpperCase()]?.map(m => m.toLowerCase()) || []);
  const expanded1 = [...parts1, ...expandPorts(parts1)];
  const expanded2 = [...parts2, ...expandPorts(parts2)];
  return expanded1.some(p => expanded2.includes(p));
};

const fuzzyMatch = (val1: any, val2: any): boolean => {
  if (val1 === null || val2 === null || val1 === undefined || val2 === undefined) return false;

  let s1 = String(val1).toLowerCase().trim();
  let s2 = String(val2).toLowerCase().trim();

  if (s1 === "" || s2 === "") return false;

  const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const normalizeNoDigits = (s: string) => s.replace(/[^a-z]/g, '');

  let n1 = normalize(s1);
  let n2 = normalize(s2);

  if (n1 === n2 && n1.length > 0) return true;

  if (n1.length > 5 && n2.length > 5) {
     if (n1.includes(n2) || n2.includes(n1)) return true;
  }

  let str1 = normalizeNoDigits(s1);
  let str2 = normalizeNoDigits(s2);

  if (str1 === str2 && str1.length > 0) return true;

  if (str1.length > 4 && str2.length > 4) {
      if (str1.includes(str2) || str2.includes(str1)) return true;
  }

  // Nama vendor/PT kadang disingkat jadi akronim di salah satu dokumen (mis. "SURYA CEMERLANG
  // LOGISTIK" vs "SCL Trans") -- kalau akronim dari huruf pertama tiap kata di satu sisi persis
  // sama dengan salah satu kata di sisi lain, anggap match. Butuh >=2 kata biar tidak longgar.
  const words1 = s1.split(/\s+/).filter(Boolean);
  const words2 = s2.split(/\s+/).filter(Boolean);
  const acronym1 = words1.map(w => w[0]).join('');
  const acronym2 = words2.map(w => w[0]).join('');
  if (words1.length >= 2 && acronym1.length >= 2 && words2.includes(acronym1)) return true;
  if (words2.length >= 2 && acronym2.length >= 2 && words1.includes(acronym2)) return true;

  const getEditDistance = (a: string, b: string) => {
      if(a.length === 0) return b.length;
      if(b.length === 0) return a.length;
      const matrix = [];
      for(let i = 0; i <= b.length; i++){
          matrix[i] = [i];
      }
      for(let j = 0; j <= a.length; j++){
          matrix[0][j] = j;
      }
      for(let i = 1; i <= b.length; i++){
          for(let j = 1; j <= a.length; j++){
              if(b.charAt(i-1) == a.charAt(j-1)){
                  matrix[i][j] = matrix[i-1][j-1];
              } else {
                  matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
              }
          }
      }
      return matrix[b.length][a.length];
  };

  const dist = getEditDistance(str1, str2);
  if (str1.length > 4 && str2.length > 4 && dist <= Math.max(1, Math.floor(Math.min(str1.length, str2.length) / 6))) {
      return true;
  }

  let isNum1 = /^[0-9.,\-]+$/.test(s1.replace(/\s/g, ''));
  let isNum2 = /^[0-9.,\-]+$/.test(s2.replace(/\s/g, ''));
  if (isNum1 && isNum2 && Math.abs(toNum(s1) - toNum(s2)) <= 1) return true;

  return false;
};

// Evaluasi ulang `c.match` tiap baris non-manual berdasar `c.values.ref`/`c.values.doc` yang
// TERSIMPAN -- REPLIKA PERSIS `useEffect` load `SeaAirValidasiModal.tsx` (SATU-SATUNYA sumber
// aslinya). Baris `manual === true` (override manual user) TIDAK disentuh, dibiarkan apa adanya.
export function relaxSeaAirDocChecks(checksRaw: any[]): any[] {
  const checks = Array.isArray(checksRaw) ? checksRaw : [];
  return checks.map((c: any) => {
    if (!c.manual && c.values) {
      const docEmpty = c.values.doc === null || c.values.doc === undefined || String(c.values.doc).trim() === "";
      let effectiveRef = c.values.ref;
      let refEmpty = effectiveRef === null || effectiveRef === undefined || String(effectiveRef).trim() === "";
      if (c.row === "NO PO" && c.col === "PO" && refEmpty) {
        // Kolom PO kadang tidak dikirim ref-nya sendiri oleh backend -- pinjam ref dari
        // kolom lain (CIPL/Final Invoice) di baris yang sama, karena rujukannya sama-sama dari PIB.
        const sibling = checks.find((sc: any) => sc.row === "NO PO" && sc.values && sc.values.ref !== null && sc.values.ref !== undefined && String(sc.values.ref).trim() !== "");
        if (sibling) {
          effectiveRef = sibling.values.ref;
          refEmpty = false;
        }
      }
      if (refEmpty || docEmpty) {
        // Salah satu sisi datanya belum ada -- "Belum dicek", bukan "Tidak sesuai".
        c.match = null;
      } else {
        if (c.row === "TOTAL DUTY (PIB No. 44)") {
          const refNum = toNum(effectiveRef);
          const docNum = toNum(c.values.doc);
          c.match = Math.abs(refNum - docNum) <= 1000;
        } else if (c.row === "NO PIB (No Pengajuan)") {
          c.match = strictAlnumMatch(effectiveRef, c.values.doc);
        } else if (c.row === "NO PO") {
          c.match = comparePoSet(effectiveRef, c.values.doc);
        } else if (["ORIGIN", "DESTINATION", "Origin", "Destination"].includes(c.row)) {
          c.match = matchLocation(effectiveRef, c.values.doc);
        } else {
          c.match = fuzzyMatch(effectiveRef, c.values.doc);
        }
      }
    }
    return c;
  });
}
