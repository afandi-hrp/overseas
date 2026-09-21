## Audit AP Local — halaman laporan otomasi + koreksi terbatas (`src/pages/AuditPoPage.tsx`)

Nama file/route/page_key `AuditPoPage`/`/audit-po`/`audit_po` (teknis), label tampil **"Audit AP
Local"**. Tidak punya judul card, panel filter langsung jadi header, `justify-end`.

**PENTING — 3 halaman duplikat arsitektur**: `AuditPoPage.tsx` (tabel `audit_po_ap_comp`),
`AuditPoOverseasPage.tsx` (`audit_po_apovs_comp`), `PiLocalPage.tsx` (`audit_po_pi_local_comp`)
adalah **DUPLIKASI SENGAJA, TIDAK ADA KOMPONEN SHARED** — pola/struktur identik persis
(`KategoriPicker`, `PreviewModal`, `DashboardModal`, dll masing2 py salinan sendiri). Kalau
mengubah salah satu, **WAJIB porting manual ke 2 lainnya** kecuali disebutkan HANYA utk 1
halaman. Rule ini dinyatakan SEKALI di sini.

- Tabel `audit_po_ap_comp` diisi otomasi backend tiap 30 menit. 5 kolom (`nama_pt`, `nomor_po`,
  `vendor_name`, `status_audit`, `kategori`) bisa dikoreksi manual + baris bisa dihapus permanen;
  kolom lain read-only murni. `nama_pt`/`nomor_po` read-only di modal Edit, Vendor/Status
  Audit/Kategori tetap edit.
- **Kolom Aksi** — toggle panel per baris (`openActionsRowId`, pola `FarOverseasAirPage.tsx`,
  bukan floating absolute). Panel TIDAK auto-close setelah klik item — hanya tutup via toggle
  manual.
- Tabel `table-fixed` + `<colgroup>` lebar eksplisit (bukan auto-layout, hindari sticky-column
  quirk). Kondisi final: 8 `<col>` lebar tetap (Vendor 160px, Aksi 105px), `w-full`,
  `min-w-[980px]`, wrapper tombol Aksi `w-[92px] mx-auto` (rata tengah — ini yg fix "ruang kosong
  kanan", BUKAN colgroup/table-layout). **JANGAN coba**: (a) tambah `<col>` ke-9, (b) shrink
  konten th/td doang, (c) lepas `w-full` (bikin celah di luar tabel), (d) kolom Vendor tanpa
  lebar (SEMUA sudah dicoba & direvert). **Aturan wajib**: tiap tambah/hapus kolom tabel
  `table-fixed`, WAJIB samakan `min-w-[...]` dgn SUM lebar `<col>` tersisa.
  - `EditAuditPoModal` — form, `updateAuditPoRow(id, updates)`.
  - **Tombol "Tambah Data"** — input manual 1 baris baru, utk dokumen yang gagal diproses
    otomasi backend sama sekali. `AddAuditPoModal` — form MIRIP `EditAuditPoModal` tapi Nama
    PT/Nomor PO DI SINI boleh diisi bebas (BUKAN disabled) — baris manual belum punya nilai
    otomasi utk dikoreksi. `insertAuditPoRow(fields)` (`AuditPoHelpers.ts`) — insert polos ke
    `audit_po_ap_comp` (bukan RPC, RLS INSERT sudah cukup), reuse type `AuditPoEditableFields`
    (5 field). Kolom durasi/url/drive_file_id_* dibiarkan null. Tombol gated `canEditAuditPo`,
    sebelah kanan Dashboard, outline putih (bukan solid ungu — hierarki visual: Dashboard = aksi
    utama). Setelah simpan → `fetchList()` REFETCH (bukan prepend optimis) supaya baris baru
    muncul di posisi yang benar sesuai sort/filter aktif. Diporting ke 2 halaman lain
    (`AddAuditPoOverseasModal`/`AddPiLocalModal`) — PI Local py 2 field tambahan (Nomor SJ/Nomor
    Stock In) yang JUGA boleh diisi bebas di form Tambah.
  - `DeleteAuditPoModal` — pola `DeleteConfirmModal` Bunker.
  - **Preview PDF/Hasil Audit via `PreviewModal` in-app** (BUKAN `<a target=_blank>`) — Drive
    tidak render HTML upload user sbg halaman hidup & iframe `src` ke URL luar kena
    X-Frame-Options blank tanpa pesan. **Solusi**: proxy backend `GET
    /api/drive-file-proxy?id=<drive_file_id>` (`server.ts`, id divalidasi regex ketat
    `^[a-zA-Z0-9_-]{10,100}$`, request ke
    `https://drive.usercontent.google.com/download?id=...&export=download&confirm=t`, di-STREAM
    tanpa disk). `PreviewModal` fetch via JS lalu suntik `srcDoc` (HTML)/`blob:` (PDF, di-rewrap
    paksa `type:'application/pdf'`) ke iframe — same-origin, imun X-Frame-Options.
    `buildPreviewSrc(driveFileId, rawUrl)` prioritaskan proxy, `url_pdf`/`url_html` mentah
    fallback. Tombol "Download File". Print — `sandbox="allow-same-origin allow-modals"` WAJIB
    (tanpa `allow-modals`, `window.print()` diblokir diam-diam). Modal `h-[98vh]`.
  - Tombol "Reset Filter" — reset search/PT/Kategori/tanggal, TIDAK reset sortBy/sortDir/pageSize.
  - Pagination **server-side** (`.range()`). Search debounced 400ms ke `nomor_po`/`vendor_name`.
    Dropdown `nama_pt` & `kategori` DINAMIS dari data asli (bukan hardcode). `STATUS_AUDIT_OPTIONS`
    datalist DIHAPUS TOTAL (input polos).
  - Kolom **Kategori** — combobox `KategoriPicker`, **MULTI-SELECT** (checkbox toggle + tombol
    "Selesai", disimpan 1 string gabung `" + "` via `KATEGORI_MULTI_SEPARATOR`/
    `parseKategoriMulti()`). Filter pakai `.ilike('%..%')` bukan `.eq` (exact match gagal cocok
    ke gabungan). Dropdown di-render via **React Portal ke `document.body`** (`position:fixed`,
    arah buka dihitung dari `getBoundingClientRect()` vs `window.innerHeight`). Prop
    `openDirection` DIHAPUS TOTAL dari `KategoriPicker`/`KategoriCell`.
  - Kolom Vendor — `break-words` (bukan truncate+tooltip). Kolom Nama PT (`PtBadge`) & Status
    Audit (`StatusBadge`) — `rounded-lg break-words` (BUKAN `rounded-full whitespace-nowrap`,
    teks bebas panjang bikin overflow keluar kolom kalau nowrap). Dropdown filter "Semua PT" &
    "Semua Kategori" sama-sama `max-w-[160px]` (konsisten, bukan lebar mengikuti value terpilih).
    Semua fix ini diporting ke ketiga halaman duplikat.
  - `src/utils/AuditPoHelpers.ts` — `AuditPoRow`, `AuditPoEditableFields`, `statusAuditMeta`,
    `KATEGORI_OPTIONS`, `updateAuditPoKategori`, `updateAuditPoRow`, `deleteAuditPoRow`.
  - `PAGE_REGISTRY` key `audit_po`, group `'Audit AP Local'`.
  - **Tombol "Dashboard" + `DashboardModal`** (paling kiri panel filter). Tab **Overview**: pie
    chart SVG manual dgn efek "3D" (radial gradient + drop-shadow + rim stroke, helper
    `lightenHex`/`darkenHex`), `r=105, cx=300` (JAGA `cx-r=195` konstan kalau resize pie). Tab
    **Per Vendor**: chart batang vertikal per `nama_pt`, `niceAxisStep()` helper axis. Tab
    **Kategori**: chart batang HORIZONTAL per `kategori`, `wrapKategoriLabel()` word-wrap, TIDAK
    di-seed 0 spt Per Vendor. Wrapper `min-h-[380px] mt-3 flex flex-col justify-center` (SAMA di
    semua tab, cegah modal "meloncat" ukuran). Semua 3 tab + efek 3D + dropdown dinamis PT —
    porting ke 3 halaman duplikat.
  - **Filter dropdown "Semua PT" & seed chart "Per Vendor" DINAMIS** — `fetchDistinctNamaPt(table)`
    (dedup+sort client), fallback ke `PT_OPTIONS` hardcode kalau gagal/kosong. State `ptOptions`,
    2 titik per halaman (komponen utama + `DashboardModal`).
  - **Filter dropdown Kategori — opsi "Tanpa Kategori"/"Ada Kategori"** — sentinel string
    `NO_KATEGORI_SENTINEL`/`HAS_KATEGORI_SENTINEL` (konstanta module-level, murni penanda
    frontend, TIDAK PERNAH dikirim sbg nilai kategori ke Supabase). "Tanpa Kategori" → query
    `.or('kategori.is.null,kategori.eq.')` (cek NULL ATAU string kosong — kolom `kategori` bisa
    dua-duanya tergantung riwayat). "Ada Kategori" → `.not('kategori','is',null).neq('kategori','')`
    (kebalikan persis). Diporting ke ketiga halaman.
  - **Kolom Kategori sortable** — `type SortKey` tambah `'kategori'`. Sort server-side
    `.order(sortBy,{ascending, nullsFirst:false})` — fix bug baris kosong nongol di atas saat
    sort ASC (Postgres default NULL=largest).

## Audit AP Local/Overseas/PI Local — "Riwayat Perubahan"

Pengecualian dari rule "duplikasi sengaja" di atas — modal & fungsi log **SENGAJA DIBUAT
GENERIK** (1 komponen dipakai ketiga halaman lewat parameter `tabel`), krn modal riwayat murni
infrastruktur tanpa logic spesifik per halaman.

- **`src/utils/AuditPoLogHelpers.ts`** — `logAuditPoAudit(tabel, recordId, userEmail, changes)`,
  `logAuditPoDelete(tabel, recordId, userEmail, label)`, `fetchAuditPoLog(tabel, recordId)`.
  Pakai ulang tabel `audit_trail` GLOBAL (sama dgn Bunker) — log dari 3 halaman ini OTOMATIS ikut
  muncul di halaman Audit Trail global.
- **Kunci pencocokan baris BEDA dari Bunker** — Bunker pakai `no_po` (bisa duplikat/kosong), di
  sini pakai **`id` (uuid) baris `audit_po_*` itu sendiri** (disimpan di kolom generik
  `no_dokumen`) — lebih presisi.
- **`src/components/AuditPoLogModal.tsx`** — replika `BunkerAuditLogModal.tsx`, generik terima
  props `tabel`/`recordId`/`recordLabel`/`pageTitle`. BEDA dari Bunker: TIDAK perlu filter entri
  "asing" (tabel `audit_po_*` HANYA ditulis oleh `logAuditPoAudit`/`logAuditPoDelete`).
- **Cakupan aksi yang dicatat**: Edit (field yang BENAR-BENAR berubah, via `FIELD_LABELS` map),
  Hapus baris (dicatat SEBELUM baris dihapus, action `DELETE`), ganti Kategori inline
  (`KategoriCell`). **Tombol "Tambah Data" manual SENGAJA TIDAK dicatat.**
- Tombol **"Riwayat"** (ikon `History`) di panel Aksi, TIDAK digate `canEdit*` (lihat/baca boleh
  siapa saja, cuma Edit/Hapus yg digate).
- **`SharedDataTable.tsx` `TRAIL_TABLES`** — kategori `AUDIT_PO: ['audit_po_ap_comp',
  'audit_po_apovs_comp', 'audit_po_pi_local_comp']` + opsi dropdown "Audit AP Local/Overseas/PI
  Local" di filter "Module" Audit Trail global.

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu**:
```sql
create policy "audit_trail_insert_audit_po_ap" on public.audit_trail
  for insert with check (tabel = 'audit_po_ap_comp' and public.has_edit_access('audit_po'));
create policy "audit_trail_select_audit_po_ap" on public.audit_trail
  for select using (tabel = 'audit_po_ap_comp' and public.has_page_access('audit_po'));

create policy "audit_trail_insert_audit_po_ovs" on public.audit_trail
  for insert with check (tabel = 'audit_po_apovs_comp' and public.has_edit_access('audit_po_overseas'));
create policy "audit_trail_select_audit_po_ovs" on public.audit_trail
  for select using (tabel = 'audit_po_apovs_comp' and public.has_page_access('audit_po_overseas'));

create policy "audit_trail_insert_pi_local" on public.audit_trail
  for insert with check (tabel = 'audit_po_pi_local_comp' and public.has_edit_access('pi_local'));
create policy "audit_trail_select_pi_local" on public.audit_trail
  for select using (tabel = 'audit_po_pi_local_comp' and public.has_page_access('pi_local'));
```
**BELUM DIVERIFIKASI**: apakah policy SELECT halaman Audit Trail global (page_key `audit_trail`)
sudah cukup permisif baca SEMUA `tabel` atau di-scope ketat (kalau ketat, WAJIB tambah 1 policy
SELECT lagi utk page_key `audit_trail`) — cek dulu kalau ada laporan "log tidak muncul di Audit
Trail global padahal muncul di modal Riwayat per-baris". Kolom `deskripsi` di `v_audit_trail`
(view) mungkin tampil kosong utk `tabel='audit_po_*'` kalau view belum tahu mapping-nya (`catatan`
tetap terisi lengkap, info tidak hilang, cuma `deskripsi` yg berpotensi kosong).

## Audit AP Overseas (`AuditPoOverseasPage.tsx`)

Duplikasi persis Audit AP Local, tabel `audit_po_apovs_comp`. `KATEGORI_OPTIONS` **BEDA TOTAL**
dari AP Local (istilah Impor/Overseas: "DOKUMEN STOCK IN/PI", "IMPORT CALCULATION/LOGISTIC",
"CUSTOMER NAME", "CURRENCY", "PN NUMBER" dst) — **JANGAN disamakan otomatis** antara
`AuditPoHelpers.ts` & `AuditPoOverseasHelpers.ts` (sengaja beda).

Tab ke-3 "Kategori" di Dashboard PERTAMA KALI dibuat di sini, lalu di-porting ke AP Local &
PiLocal. `MainLayout.tsx` bug fix: `activeMainTab` deteksi via `pathBelongs(pathname, base)`
(exact match atau diikuti `/`) — bukan `startsWith` polos, krn `/audit-po-overseas` diawali
string `/audit-po`.

Page_key `audit_po_overseas`, route `/audit-po-overseas`, group `'Audit AP Overseas'`.

**BELUM DIJALANKAN ke Supabase production**:
```sql
alter table public.audit_po_apovs_comp add column if not exists kategori text;
alter table public.audit_po_apovs_comp enable row level security;
create policy "audit_po_apovs_comp_select" on public.audit_po_apovs_comp
  for select using (public.has_page_access('audit_po_overseas'));
create policy "audit_po_apovs_comp_insert" on public.audit_po_apovs_comp
  for insert with check (public.has_edit_access('audit_po_overseas'));
create policy "audit_po_apovs_comp_update" on public.audit_po_apovs_comp
  for update using (public.has_edit_access('audit_po_overseas'))
  with check (public.has_edit_access('audit_po_overseas'));
create policy "audit_po_apovs_comp_delete" on public.audit_po_apovs_comp
  for delete using (public.has_edit_access('audit_po_overseas'));
```

## PI Local (`PiLocalPage.tsx`) — Search mencakup Nomor Stock In

Duplikasi arsitektur Audit AP Local, tabel `audit_po_pi_local_comp`. Beda dari 2 halaman lain:
py 2 kolom tambahan `nomor_sj`/`nomor_stock_in` (terpisah dari `nomor_po`). Search box
(debounced 400ms) — `.or(nomor_po.ilike/nomor_stock_in.ilike/vendor_name.ilike)`. Placeholder
"Cari No PO / No Stock In / Vendor...". **KHUSUS PI Local** — `AuditPoPage.tsx`/
`AuditPoOverseasPage.tsx` TIDAK punya kolom `nomor_stock_in`, TIDAK diporting.

## Accounting Rekap — duplikasi Audit AP Local, tabel finance baru (`src/pages/AccountingRekapPage.tsx`)

Halaman "identik" tampilan Audit AP Local, sub-halaman ke-4 di bawah menu sidebar "Compare Doc"
— DUPLIKASI SENGAJA, sama prinsipnya dgn Audit AP Overseas/PI Local. Kalau ada bug/fitur perlu
diterapkan ke salah satu halaman "Compare Doc" manapun, JANGAN asumsikan otomatis ke-apply ke
yang lain.

- Tabel `accounting_rekap_finance`: `id`, `created_at`, `tanggal_dokumen`, `vendor`, `nomor_po`,
  `pt_internal`, `bank`, `total_bayar` (bigint), `lokasi_folder`, `drive_file_id`, `url_view`,
  `waktu_proses`, `status_proses`. **RLS DISERAGAMKAN** dgn pola Audit AP Overseas — policy
  SELECT longgar bawaan (`to anon, authenticated using (true)`) DIGANTI
  `has_page_access('accounting_rekap')`, +3 policy INSERT/UPDATE/DELETE via
  `has_edit_access('accounting_rekap')`:
  ```sql
  drop policy if exists "accounting_rekap_finance_select_anon" on public.accounting_rekap_finance;
  create policy "accounting_rekap_finance_select" on public.accounting_rekap_finance
    for select using (public.has_page_access('accounting_rekap'));
  create policy "accounting_rekap_finance_insert" on public.accounting_rekap_finance
    for insert with check (public.has_edit_access('accounting_rekap'));
  create policy "accounting_rekap_finance_update" on public.accounting_rekap_finance
    for update using (public.has_edit_access('accounting_rekap'))
    with check (public.has_edit_access('accounting_rekap'));
  create policy "accounting_rekap_finance_delete" on public.accounting_rekap_finance
    for delete using (public.has_edit_access('accounting_rekap'));
  ```
  **BELUM DIVERIFIKASI dijalankan ke Supabase production** — WAJIB manual dulu sebelum halaman
  ini bisa diakses sama sekali.
- **TIDAK ADA kolom `kategori`** — `KategoriPicker`/kolom Kategori DIHILANGKAN TOTAL, Dashboard
  cuma 2 tab (Overview/Per Vendor). Field mapping: `nama_pt`→`pt_internal`, `vendor_name`→
  `vendor`, `status_audit`→`status_proses`, `durasi_text`→`waktu_proses`. Field baru:
  `tanggal_dokumen`/`bank`/`total_bayar`/`lokasi_folder` — 3 pertama boleh dikoreksi manual
  (bareng `vendor`), `pt_internal`/`nomor_po` TETAP read-only.
- **Preview dokumen 1 file** (beda dari 2 tombol PDF/Hasil Audit Audit AP Local) — `guessPreviewKind()`
  menebak `html` vs `pdf` dari ekstensi URL (fallback `pdf`). `buildPreviewSrc`/`PreviewModal`
  REPLIKA PERSIS Audit AP Local.
- `statusProsesMeta()` (`AccountingRekapHelpers.ts`) — domain `status_proses` BEBAS TEKS (bukan
  enum tetap spt `statusAuditMeta`), tampilkan apa adanya + badge amber terisi/abu kosong. Badge
  `rounded-lg break-words` (sama pola fix nowrap→wrap Audit AP Local).
  **Kolom "Waktu Proses" disembunyikan dari tabel** (`<col>`/`<th>`/`<td>` dihapus total, `min-w`
  table-fixed 1175px→1075px) — data TETAP ada di DB/query, cuma tidak dirender.
  Dashboard "Total Bermasalah"/"Total Sesuai": `status_proses` TIDAK null = "Bermasalah".
- `formatRupiah()` — format `total_bayar` jadi `"Rp 1.234.567"` (`toLocaleString('id-ID')`).
- Page_key `accounting_rekap`, route `/accounting-rekap`, group PAGE_REGISTRY `'Accounting
  Rekap'`. SubTab ke-4 grup "Compare Doc" di `MainLayout.tsx`.
- `src/utils/AccountingRekapHelpers.ts` — duplikasi pola `AuditPoHelpers.ts`.
- **BELUM porting**: `KategoriPicker` (tidak relevan, tanpa kolom kategori), badge %
  Checklist/Cost Validation (tabel ini tidak py konsep itu spt Courier).

## Skalabilitas >100rb baris — dropdown PT & modal Dashboard dipindah ke RPC (2026-09)

Analisa (diminta user): list utama ke-4 halaman (Audit AP Local/Overseas, PI Local, Accounting
Rekap) SUDAH server-side penuh (pagination `.range()`, search/filter `.ilike()`/`.eq()`/`.or()`
dikirim ke Postgres) — aman di data besar. TAPI 2 pola berulang di ke-4 halaman TIDAK aman:
dropdown filter PT (`fetchDistinctNamaPt`/`fetchDistinctPtInternal`) & tab "Per Vendor"/
"Kategori" modal Dashboard (`fetchVendorStats`/`fetchKategoriStats`) — SEMUANYA fetch SELURUH
baris tabel/rentang tanggal ke browser TANPA `.limit()`, lalu dedup/agregasi di JS. Di >100rb
baris ini makin lambat & makin besar payload progresif.

**Fix — 3 RPC baru + index (`sql/007_audit_po_distinct_and_stats_rpc.sql`, BELUM DIJALANKAN ke
Supabase production — WAJIB dijalankan manual dulu)**:
- `fn_reporting_distinct_pt(p_table text)` — `SELECT DISTINCT` nama PT di Postgres (bukan
  dedup di JS), dispatch via `IF/ELSIF p_table = '...'` HARDCODE per tabel (BUKAN dynamic SQL —
  cegah SQL injection lewat parameter tabel), guard `has_page_access` per tabel di tiap cabang.
- `fn_reporting_vendor_stats(p_table text, p_from text, p_to text)` — `GROUP BY` nama PT/PT
  internal di Postgres (status terisi, dalam rentang tanggal), balikin `{pt, cnt}` teragregasi
  (biasanya ≤20-50 baris) — bukan ribuan baris mentah dihitung ulang di JS.
- `fn_reporting_kategori_stats(p_table text, p_from text, p_to text)` — REPLIKA persis logic
  `parseKategoriMulti()`/`KATEGORI_MULTI_SEPARATOR` (` + `) via `unnest(string_to_array(kategori,
  ' + '))` + `GROUP BY` di Postgres (**kalau separator ini berubah di frontend, WAJIB
  disinkronkan ke SQL function ini juga**). HANYA utk 3 tabel `audit_po_*` (Accounting Rekap
  tidak punya kolom kategori).
- Index tambahan (B-tree utk `created_at`/`nama_pt`/`pt_internal`, GIN `pg_trgm` utk kolom yang
  dipakai `.ilike('%...%')`: `nomor_po`/`vendor_name`/`kategori`/`nomor_stock_in` di 3 tabel
  `audit_po_*`, `nomor_po`/`vendor` Accounting Rekap, `no_po`/`vendor`/`kapal` Bunker) —
  `.ilike()` wildcard-di-kedua-sisi SECARA STRUKTURAL tidak bisa memakai B-tree biasa secara
  efisien, butuh trigram. `create extension if not exists pg_trgm;` disertakan di file SQL.

**Frontend** — `fetchDistinctNamaPt`/`fetchDistinctPtInternal`/`fetchVendorStats`/
`fetchKategoriStats` di KEEMPAT halaman (AuditPoPage.tsx, AuditPoOverseasPage.tsx,
PiLocalPage.tsx, AccountingRekapPage.tsx) diganti dari `.select()` mentah jadi `supabase.rpc(...)`
— signature/nama fungsi & shape hasil (`{pt,count}[]`/`{pt,cnt}`) TIDAK berubah dari sudut
pandang caller (`ptOptions`/`vendorStats`/`kategoriStats` state & JSX pemakainya TIDAK disentuh),
cuma isi implementasi fungsinya. Seed 0 ke `ptOptions` yang tidak muncul di hasil RPC (fitur
"chart tetap tampil nama PT walau count 0") TETAP dihitung di client (data hasil RPC sudah
teragregasi kecil, aman digabung manual).

**BELUM dioptimasi (di luar cakupan analisa ini, TIDAK ditemukan di 5 halaman)**: Export Excel —
tidak ada fitur ini sama sekali di Bunker/Audit AP Local/Overseas/PI Local/Accounting Rekap
(beda dari modul Courier/Sea & Air yang punya). Bunker sendiri TIDAK kena masalah dropdown PT/
Dashboard sama sekali (tidak punya keduanya) — cuma dapat tambahan index `pg_trgm` di atas.
