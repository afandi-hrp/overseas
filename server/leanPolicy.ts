// Pembatasan proxy lean-api /odata untuk user yang HANYA punya `cost_agent_invoice` (kartu "Finance mapping" di detail invoice,
// 2026-10-28). Proxy meneruskan query apa adanya, sedangkan AP_Suppliers memuat kolom bank/KTP -> user ini hanya boleh membaca 4 entity
// dengan kolom aman, TANPA $search/$metadata/$expand, dan $filter/$orderby hanya boleh menyebut kolom aman.
// User dengan cost_agent_approval_matrix / cost_agent_voyage / Admin TIDAK lewat sini (perilaku lama).
// Modul murni (tanpa express) supaya bisa diuji: `npm test`.

export const SAFE_ODATA_COLUMNS: Record<string, readonly string[]> = {
  AP_Suppliers: ['SupplierID', 'SupplierCode', 'SupplierName', 'NPWP', 'Disabled'],
  IC_InventoryUsers_Fleet: ['InventoryUserID', 'InventoryUserCode', 'InventoryUserName', 'FleetName', 'Disabled', 'IsVessel'],
  FI_ExpenseTypes_Account: ['ExpenseTypeID', 'ExpenseTypeDescription', 'AccountName', 'Disabled'],
  // Master COA (draft AP Note, 2026-10-30): tabel AC_Accounts apa adanya, flag nonaktifnya bernama IsDisabled (bukan Disabled).
  AC_Accounts: ['AccountID', 'AccountCode', 'AccountName', 'IsDisabled'],
};

const ALLOWED_PARAMS = new Set(['database', '$select', '$filter', '$orderby', '$top', '$skip', '$count']);
const DB_RE = /^AS_[A-Z0-9]{2,12}$/;
// Kata kunci OData yang boleh muncul di $filter/$orderby selain nama kolom aman.
const ODATA_WORDS = new Set([
  'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'and', 'or', 'not', 'contains', 'startswith', 'endswith', 'tolower', 'toupper', 'trim', 'length',
  'true', 'false', 'null', 'asc', 'desc',
]);
const MAX_EXPR = 600;

export type ODataCheck = { ok: true; query: string } | { ok: false; reason: string };

// Buang string literal ('...' dengan '' sebagai escape). null = literal tidak tertutup.
function stripLiterals(expr: string): string | null {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch !== "'") { out += ch; i++; continue; }
    i++;
    let closed = false;
    while (i < expr.length) {
      if (expr[i] === "'") {
        if (expr[i + 1] === "'") { i += 2; continue; }
        closed = true; i++; break;
      }
      i++;
    }
    if (!closed) return null;
    out += "''"; // penanda literal; isinya diabaikan
  }
  return out;
}

// $filter / $orderby: hanya nama kolom aman + kata kunci OData + angka/tanda baca dasar. Tanpa '/', '$', '@' (path navigasi, parameter alias, fungsi lain).
function checkExpression(expr: string, safe: readonly string[], what: string): string | null {
  if (expr.length > MAX_EXPR) return `${what} terlalu panjang.`;
  const bare = stripLiterals(expr);
  if (bare === null) return `${what}: tanda kutip tidak tertutup.`;
  if (/[^A-Za-z0-9_ ,().'\-]/.test(bare)) return `${what}: karakter tidak diizinkan.`;
  for (const m of bare.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const w = m[0];
    if (!safe.includes(w) && !ODATA_WORDS.has(w)) return `${what}: "${w}" tidak diizinkan.`;
  }
  return null;
}

// `sub` = path setelah /odata/ (mis. "AP_Suppliers"); `rawQuery` = query string tanpa '?'.
// Hasil ok.query = query string yang DISUSUN ULANG dari parameter yang sudah lolos (bukan string mentah dari browser),
// supaya selisih cara parse antara proxy dan lean-api tidak bisa dipakai menyelundupkan parameter.
export function checkRestrictedOData(sub: string, rawQuery: string): ODataCheck {
  const safe = SAFE_ODATA_COLUMNS[sub];
  if (!safe) return { ok: false, reason: 'Entity tidak diizinkan untuk akses Anda.' };

  const sp = new URLSearchParams(rawQuery);
  const seen = new Set<string>();
  for (const k of sp.keys()) {
    if (!ALLOWED_PARAMS.has(k)) return { ok: false, reason: `Parameter "${k}" tidak diizinkan.` };
    if (seen.has(k)) return { ok: false, reason: `Parameter "${k}" muncul lebih dari sekali.` };
    seen.add(k);
  }

  const database = sp.get('database') ?? '';
  if (!DB_RE.test(database)) return { ok: false, reason: 'Parameter database tidak valid.' };

  const select = sp.get('$select');
  if (select === null || select.trim() === '') return { ok: false, reason: '$select wajib diisi.' };
  const cols = select.split(',').map(s => s.trim());
  for (const c of cols) {
    if (!safe.includes(c)) return { ok: false, reason: `Kolom "${c}" tidak diizinkan.` };
  }

  const out = new URLSearchParams();
  out.set('database', database);
  out.set('$select', cols.join(','));

  for (const k of ['$filter', '$orderby'] as const) {
    const v = sp.get(k);
    if (v === null) continue;
    const err = checkExpression(v, safe, k);
    if (err) return { ok: false, reason: err };
    out.set(k, v);
  }
  const top = sp.get('$top');
  if (top !== null) {
    if (!/^\d{1,3}$/.test(top) || Number(top) > 200) return { ok: false, reason: '$top maksimal 200.' };
    out.set('$top', top);
  }
  const skip = sp.get('$skip');
  if (skip !== null) {
    if (!/^\d{1,6}$/.test(skip)) return { ok: false, reason: '$skip tidak valid.' };
    out.set('$skip', skip);
  }
  const count = sp.get('$count');
  if (count !== null) {
    if (count !== 'true' && count !== 'false') return { ok: false, reason: '$count tidak valid.' };
    out.set('$count', count);
  }
  return { ok: true, query: out.toString() };
}
