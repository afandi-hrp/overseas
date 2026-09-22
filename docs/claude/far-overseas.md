## Tarif Vendor FAR Overseas Air — dirombak total ke struktur quotation+periode (2026-09)

`FarOverseasVendorTarifPage.tsx` (`/settings/tarif-far-overseas-vendor`, page_key
`settings_tarif_far_overseas_vendor` TETAP SAMA) DIBANGUN ULANG TOTAL. Tabel lama
`far_overseas_tarif_vendor` (flat, 1 baris = 1 kombinasi+1 rentang berat, RPC
`upsert_tarif_far_overseas_vendor`/`nonaktifkan_tarif_far_overseas_vendor`) **SUDAH TIDAK
DIPAKAI** — masih ada sbg backup `far_overseas_tarif_vendor_legacy_backup`, JANGAN dipakai lagi.
n8n SUDAH otomatis pakai struktur baru (perubahan harga dari halaman baru langsung berlaku ke
validasi shipment berikutnya, tidak perlu sinkron manual apa pun ke n8n).

**Struktur baru (3 tabel)**:
- `far_overseas_vendor_master` (`vendor_name`, `aktif`) — daftar vendor utk dropdown, dikelola
  via modal "Kelola Vendor" (tombol di toolbar filter) — CRUD add-only dari UI (belum ada
  edit/nonaktifkan dari modal ini, cuma tambah + lihat status).
- `far_overseas_tarif_quotation` (INDUK, py PERIODE) — 1 baris = 1 kombinasi vendor+jenis_layanan
  +origin+tujuan(+kategori_barang khusus Jianqiao) UNTUK 1 PERIODE (`periode_mulai`,
  `periode_selesai` nullable = masih berlaku).
- `far_overseas_tarif_quotation_detail` (ANAK) — banyak baris per quotation, 1 baris = 1 rentang
  berat (`berat_min`/`berat_max` nullable=open-ended) + harganya (`harga_per_kg` ATAU
  `harga_per_cbm`/`harga_per_cbm_min`/`harga_per_cbm_max` utk tarif rentang, `ppn_status`
  PPN/Non-PPN, `notes` teks bebas).

**UI halaman baru — grouping 2 level (2026-09, DIUBAH dari 1 level)**: Level 1 (Card, collapsible)
= `routeKeyOf()` **vendor+origin+tujuan SAJA** (cth "OCTAGON LOGISTIC — Australia → JAKARTA"),
TIDAK peduli jenis layanan — semua jenis layanan utk rute yang sama SEKARANG 1 card. Level 2
(Sub-section, DI DALAM card, collapsible) = `subKeyOf()` **jenis_layanan+kategori_barang** (cth
"Express — 1 periode [Berlaku]", "Economy — 1 periode"; kategori_barang DIIKUTKAN ke key
sub-section WALAU spek awal cuma sebut jenis_layanan — Jianqiao Sea Freight py beberapa tarif
beda per kategori barang dalam jenis layanan yang SAMA, kalau tidak diikutkan 2 tarif beda bisa
nyampur jadi 1 sub-section). Tiap sub-section berisi RIWAYAT periode (quotation) urut
`periode_mulai` DESC — **struktur di bawah level ini TIDAK BERUBAH SAMA SEKALI** dari versi 1
level lama: tiap quotation collapsible berisi tabel Detail Harga per rentang berat (Berat (Kg) |
Unit Price | PPN | Notes) + form tambah/edit/hapus rentang berat inline, tombol Update Harga
(Buat Periode Baru)/Edit Info/Nonaktifkan per quotation — SEMUA di level quotation persis sama,
cuma pembungkusnya sekarang nested 2 level (Card rute → Sub-section jenis layanan → quotation)
bukan 1 level lagi. Badge "Berlaku"/"Semua ditutup" muncul di KEDUA level (card = ANY sub-section
berlaku; sub-section = ada quotation aktif & `periode_selesai` null).
Kolom Berat format `formatWeight()`: `berat_max` null → `"{min}+ Kg"`; `berat_min===berat_max`
→ `"{min} Kg"`; selain itu → `"{min}-{max} Kg"`.

**Form Detail Harga — 1 field + dropdown satuan (2026-09, GANTI dari checkbox "Pakai Harga/CBM"
+ 2 field terpisah)**: dropdown "Satuan Harga" 3 opsi — Per Kg (map `p_harga_per_kg`), Per CBM
(map `p_harga_per_cbm`), Per CBM (Rentang Harga) (map `p_harga_per_cbm_min`/`p_harga_per_cbm_max`,
GANTI tampilan 1 field harga jadi 2 field Min/Max). `DetailForm.hargaUnit` (`'per_kg'|'per_cbm'|
'per_cbm_range'`) — SATU-SATUNYA sumber kebenaran field mana yang dikirim ke RPC (2 field lain
SELALU dikirim `null`, TIDAK PERNAH digabung). `detailFormFromExisting()` deteksi `hargaUnit`
awal dari data tersimpan: `harga_per_cbm_min`/`max` terisi → `per_cbm_range`; `harga_per_cbm`
terisi → `per_cbm`; `harga_per_kg` terisi (atau tidak ada satu pun) → `per_kg` (default). Kolom
Unit Price di tabel detail (tampilan) TIDAK diubah — tetap baca ketiga kolom apa adanya.

**Alur "Update Harga (Buat Periode Baru)"** — tombol per quotation yg masih berlaku
(`periode_selesai` null), buka modal Quotation dgn vendor/jenis/origin/tujuan/kategori TERKUNCI
sama persis (disabled, `qCloseOldId` diisi id quotation lama) — submit `handleSaveQuotation`
jalankan 2 RPC berurutan: (1) tutup quotation LAMA (`p_periode_selesai` = sehari SEBELUM
`periode_mulai` baru), (2) buat quotation BARU. User tidak perlu ingat urutan manual 2 langkah
ini. Field Vendor/Jenis Layanan/Origin/Tujuan/Kategori Barang di-disable saat mode ini (harus
identik kombinasi lama, hanya kurs/periode/harga yang boleh beda).

**RPC — SUDAH DIBUAT USER SENDIRI** (`21_rpc_quotation_management.sql`, dijalankan user
langsung, BUKAN dibuatkan dari sesi Claude Code): `upsert_far_overseas_vendor_master`,
`upsert_far_overseas_tarif_quotation` (signature LEBIH LENGKAP dari dugaan awal — ada
`p_tipe_layanan`, `p_catatan`, `p_aktif` juga, semua opsional/`DEFAULT NULL`),
`upsert_far_overseas_tarif_quotation_detail`, `nonaktifkan_far_overseas_tarif_quotation`,
`hapus_far_overseas_tarif_quotation_detail`. **Jangan bikin ulang RPC ini dari nol kalau ada
laporan serupa lagi** — sempat terjadi (2026-09) sesi Claude Code bikin versi RPC baru dgn
signature beda tanpa cek ke user dulu, gagal dijalankan (`42P13: cannot remove parameter
defaults from existing function`) krn versi user sudah ada duluan.

`sql/011_far_overseas_tarif_quotation_rpc.sql` isinya PATCH (`CREATE OR REPLACE` dgn signature
IDENTIK ke versi user, **BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual
dulu**) — nambah guard `has_edit_access('settings_tarif_far_overseas_vendor')` di baris pertama
tiap fungsi, KRN versi awal user TIDAK PUNYA guard ini sama sekali (celah: RPC `SECURITY
DEFINER` menulis ke tabel ber-RLS, siapa pun yang login — termasuk TANPA akses edit halaman ini —
bisa panggil RPC-nya langsung dari console browser). Pola wajib project ini, lihat bagian RBAC di
CLAUDE.md utama ("RPC SECURITY DEFINER bypass RLS total").

**Format tanggal periode** — baris "Periode Mulai -> Periode Selesai" di riwayat quotation
ditampilkan `DD-MMM-YYYY` (cth "01-Sep-2026") via `formatDateDMY()` (parse manual dari string ISO
`YYYY-MM-DD`, BUKAN `new Date(iso)` polos — cegah pergeseran timezone lokal). **HANYA display**
— kolom DB & `<input type="date">` form Quotation TETAP ISO (native date picker browser tidak
bisa diubah formatnya).

**Pagination** — list rute (grup) di-paginate client-side (`page`/`pageSize=10`, `useMemo` slice
`groups`, reset `page` ke 1 saat filter berubah, footer "Menampilkan X–Y dari Z rute" + tombol
Chevron) — pola sama halaman list lain di app ini. Data quotation TETAP di-fetch semua sekaligus
(`fetchAll()`, tidak server-side/`.range()`), paging cuma memotong tampilan grup di JS.

**RLS 3 tabel baru — SUDAH DIKONFIRMASI KOSONG TOTAL ("UNRESTRICTED") via screenshot Table
Editor Supabase user (2026-09)** — `far_overseas_vendor_master`/`far_overseas_tarif_quotation`/
`far_overseas_tarif_quotation_detail` bisa dibaca/ditulis siapa pun yang py anon/authenticated
key LANGSUNG (`.select()`/`.insert()` dari console browser), TERLEPAS guard `has_edit_access`
di RPC `sql/011_...` sudah ada — guard RPC TIDAK menggantikan RLS tabel. Fix:
`sql/012_far_overseas_tarif_quotation_rls.sql` (**BELUM DIJALANKAN ke Supabase production —
WAJIB dijalankan manual dulu**) — `enable row level security` + 4 policy (SELECT via
`has_page_access('settings_tarif_far_overseas_vendor')`, INSERT/UPDATE/DELETE via
`has_edit_access` yang sama) di ketiga tabel, idempotent (`drop policy if exists` dulu).
**`far_overseas_tarif_vendor_flat` (VIEW, bukan tabel) SENGAJA TIDAK ikut** — Postgres tidak
py RLS langsung utk view, row security ikut tabel dasarnya; kalau view ini masih aktif dipakai
baca data, cek definisinya dulu (`pg_get_viewdef`) apakah tabel dasarnya sudah RLS-protected —
belum diverifikasi dari sesi ini (tidak ada akses DB langsung).
`far_overseas_tarif_vendor_legacy_backup`/`rekapan_far_overseas_air` TIDAK ikut disentuh (sudah
py RLS aktif per screenshot, ikon beda dari "UNRESTRICTED").

Modal "Kelola Vendor" belum punya tombol nonaktifkan vendor dari UI (kalau diminta, tambah
RPC/tombol baru, `aktif` di tabel sudah siap dipakai).

## Bug fix: dropdown NOTE 1 kosong pasca perombakan struktur Tarif Vendor (2026-09)

Perombakan tabel Tarif Vendor (`far_overseas_tarif_vendor` flat → `far_overseas_tarif_quotation`+
`far_overseas_tarif_quotation_detail`, lihat bagian "Tarif Vendor FAR Overseas Air" di bawah)
**LUPA menyertakan 2 titik konsumsi di `FarOverseasAirPage.tsx`** — dropdown NOTE 1
(`RouteNoteEditCell`, `tarifVendorRows` state) & `reMatchAfterRouteNoteEdit()` (re-kalkulasi cost
validation setelah NOTE 1 diedit) MASIH query tabel lama `far_overseas_tarif_vendor` langsung,
yang sekarang KOSONG (data sudah pindah, nama tabel itu kemungkinan cuma nyisa nama TANPA
data/tidak ter-update lagi) — gejalanya persis laporan user: dropdown Origin/Destination/Service
Type kosong sama sekali.

**Fix**: `fetchActiveTarifRateRows()` (BARU, `FarOverseasAirHelpers.ts`) — generate ulang bentuk
flat `RateRow[]` (SAMA PERSIS shape tabel lama: vendor_name/origin/tujuan/jenis_layanan/
berat_min/berat_max/harga_per_kg/dst, 1 elemen = 1 kombinasi rute+rentang berat) dari struktur
BARU (join client-side `far_overseas_tarif_quotation` `aktif=true` DAN `periode_selesai IS NULL`
+ `far_overseas_tarif_quotation_detail`-nya) — supaya `rematchTarif()`/`computeExpectedFromRate()`
(SATU-SATUNYA fungsi matching tarif di app ini, HARUS SELALU sinkron dgn logic n8n) **TIDAK PERLU
disentuh sama sekali**, cukup diberi sumber data yang benar. Kedua titik konsumsi di
`FarOverseasAirPage.tsx` (`tarifVendorRows` useEffect & `reMatchAfterRouteNoteEdit`) diganti
panggil fungsi ini. Field lama `minimal_berat`/`estimasi_waktu` (tidak ada lagi di skema baru) —
`estimasi_waktu` di-map dari `quotation_detail.notes` (tujuan sama: teks bebas keterangan),
`minimal_berat` dibiarkan `undefined` (`computeExpectedFromRate` sudah py fallback
`rate.minimal_berat ?? rate.berat_min`, otomatis jatuh ke `berat_min`).

**Kalau ada laporan serupa lagi ("data tarif tidak muncul/kosong" di manapun di modul FAR
Overseas Air)**: cek dulu apakah titik itu MASIH query `far_overseas_tarif_vendor` langsung
(`grep -rn "far_overseas_tarif_vendor\b" src/` — HARUS 0 hasil query aktif, sisa cuma boleh
komentar) — ganti ke `fetchActiveTarifRateRows()` kalau ketemu.

## FAR Overseas Air — Kolom "Nama PT" manual (override `dominant_company_code`, 2026-09)

Header modal Approval Memo (logo + nama PT, `FarOverseasAirDetailModal.tsx` `CompanyLogo`)
sumbernya `rec.dominant_company_code` -> lookup `far_overseas_signer_config`. Field itu SELAMA
INI cuma bisa keisi otomatis lewat `recomputeDominantCompany()` (`FarOverseasAirHelpers.ts`,
dipanggil `FarOverseasAirWeightBreakdownModal.tsx` saat breakdown berat per-PO disimpan) — formula
MURNI berbasis `po_list` (menang berdasar jumlah PO, tie-break total berat, tie-break terakhir
WNS). **Shipment TANPA PO SAMA SEKALI (`po_list` kosong) tidak pernah punya "pemenang"** — formula
return `null`, header modal Approval Memo jadi kosong/tidak ada PT ("conclusion").

**Fix**: kolom BARU **"Nama PT"** di List Memo (`LIST_COLUMNS`, setelah kolom "MEMO TITLE" —
sempat ditaruh setelah "NO PO", DIPINDAH atas permintaan user) — dropdown
manual yang langsung nulis ke `dominant_company_code` (field YANG SAMA dipakai formula PO, BUKAN
kolom baru di DB) via `pendingEdits`/`getVal`/`setVal` biasa. Aman dipakai kapan pun krn
`dominant_company_code` HANYA di-recompute otomatis oleh `WeightBreakdownModal.tsx` (aksi
eksplisit "Simpan" breakdown berat) — tidak ada proses lain yang diam-diam menimpa nilai manual
ini.

- `fetchSignerCompanyOptions()` (`FarOverseasAirHelpers.ts`, BARU) — `select company_code,
  company_name_full from far_overseas_signer_config` (tabel yang SAMA dipakai modal Approval Memo
  cari signer), di-fetch sekali saat halaman dibuka (`companyOptions` state, pola sama `picUsers`).
  `ListRenderCtx.companyOptions` — 2 titik konstruksi ctx (row List biasa &
  `FarOverseasAirCardEditModal`) WAJIB tetap sinkron kalau `ListRenderCtx` nambah field lagi.
- Mode tampil: resolve nama lengkap dari `companyOptions` (fallback tampilkan `company_code`
  mentah kalau kebetulan tidak ketemu di daftar, JANGAN tampil kosong diam2).
- `FAR_EXPORT_COLS` + `getExportData` — kolom export "NAMA PT" (`nama_pt_display`, computed
  resolve nama dari `companyOptions`, BUKAN raw `dominant_company_code`) ditambahkan setelah
  "JUDUL MEMO" (posisi disamakan dgn List Memo), konsisten pola kolom `_display` lain di export ini.
- RPC `update_rekapan_far_overseas_manual` **SUDAH** py `dominant_company_code` di
  `v_allowed_columns` (dikonfirmasi dari body fungsi yang dikirim user 2026-09) — TIDAK perlu SQL
  tambahan utk fitur ini.

## FAR Overseas Air — Section "Dokumen" (`dokumen_urls`, 2026-09)

Kolom `rekapan_far_overseas_air.dokumen_urls` (jsonb array `{filename, file_url,
drive_file_id}`) diisi OTOMATIS oleh n8n tiap dokumen yang diproses berhasil diupload ke Google
Drive (BUKAN oleh app ini, sudah jalan di backend, tidak ada arus data baru dari app) — file
sudah di-share "anyone with link can view".

- **`FarOverseasAirDocumentsModal.tsx`** (BARU, `src/components/`) — dipanggil dari tombol
  "Dokumen" (ikon `FolderOpen`) di panel Action List Memo & Card view (`docsModalRow` state,
  `FarOverseasAirPage.tsx`). **1 shipment = 1 dokumen** (beda dari Bunker/Audit AP yang bisa py
  banyak file per baris) — klik tombol LANGSUNG buka `PreviewModal` full-screen, **TIDAK ADA
  modal list/perantara** (versi awal sempat py modal list dulu spt Bunker, DIHAPUS 2026-09 atas
  permintaan eksplisit user). List ringkas (`DocumentsListWithPreview`, tombol Preview per
  baris) HANYA jadi fallback kalau `dokumen_urls` kebetulan py >1 entry — bukan alur normal.
  `docs.length === 0` → modal kecil "Dokumen tidak tersedia" + tombol Tutup, TIDAK crash
  (`parseJsonField()` + filter entry yang py `drive_file_id`/`file_url`).
- **Preview — versi awal (`<iframe src="https://drive.google.com/file/d/{id}/preview">`
  LANGSUNG) DIGANTI** (2026-09, laporan user tampilannya beda dari modul lain — masih kebawa
  chrome/UI Google Drive sendiri: toolbar, spinner loading Drive). Diganti ke pola PERSIS SAMA
  dgn `PreviewModal` AuditPoPage.tsx/AccountingRekapPage.tsx/`BunkerPreviewModal`
  BunkerCompareDocModal.tsx: proxy backend `/api/drive-file-proxy?id=<drive_file_id>` (`server.ts`)
  di-`fetch()` via JS dulu, hasilnya disuntik ke iframe polos via `srcDoc` (HTML)/`blob:` (PDF,
  di-rewrap paksa `type:'application/pdf'`) — dianggap same-origin, imun X-Frame-Options DAN
  tanpa UI bawaan Drive apa pun (murni PDF/HTML viewer bawaan browser). `guessPreviewKind()`
  tebak dari ekstensi `filename` (fallback 'pdf'). Modal preview terpisah (`PreviewModal` lokal
  di file ini, `z-[90]`, `w-[97vw] max-w-[1600px] h-[99.5vh]`) muncul DI ATAS modal list Dokumen
  (`z-[75]`) saat tombol Preview diklik — 2 modal bertumpuk, pola sama `SourceFilesSection` +
  `BunkerPreviewModal` di Bunker.
- **Dicoba lalu DIBATALKAN (2026-09) — "dokumen pendukung ikut tercetak bareng memo"**: sempat
  diimplementasi 2 iterasi (embed iframe PDF langsung ke `#far-overseas-print-area` — GAGAL,
  dokumen tampil kecil/salah skala saat print krn keterbatasan render iframe PDF bersarang di
  Chrome; lalu diganti ke merge PDF via `pdf-lib`+`html2canvas` — reliable tapi ATAS PERMINTAAN
  USER fiturnya DIBATALKAN & kode DIKEMBALIKAN ke versi semula). Dependency `pdf-lib`/
  `html2canvas` SUDAH DI-UNINSTALL dari `package.json`.
  **Kalau diminta lagi ke depan**: JANGAN pakai pendekatan iframe-embed-lalu-print-outer-page
  (sudah terbukti gagal) — pendekatan merge-PDF-lalu-print-via-iframe-contentWindow (persis pola
  `PreviewModal` AuditPoPage.tsx) yang reliable, tapi treat sbg fitur baru dari nol (kode lama
  sudah tidak ada jejaknya).
- **Fitur print DIHAPUS TOTAL (2026-09, permintaan eksplisit user)** — beda dari poin di atas
  (yang cuma revert ke `window.print()` polos), tombol Print SEKARANG BENAR-BENAR TIDAK ADA lagi
  di mana pun pada modul ini: tombol toolbar "Print" di `FarOverseasAirDetailModal.tsx` DIHAPUS,
  tombol "Print memo" (ikon `Printer`) di Card view `FarOverseasAirPage.tsx` DIHAPUS, seluruh
  mekanisme auto-print (`autoPrintRef`, `waitForDomStableThenPrint`/`MutationObserver` di
  `loadDeepLink`) DIHAPUS jadi dead code. `id="far-overseas-print-area"` & class Tailwind
  `print:*` di `FarOverseasAirDetailModal.tsx` SENGAJA DIBIARKAN (tidak dihapus) — murni jaga2
  kalau user print manual via Ctrl+P/menu browser, TIDAK ADA salahnya dibiarkan nganggur.
  **Kalau diminta lagi ke depan**: ini pekerjaan BARU dari nol (bukan un-revert) — riwayat 2
  iterasi gagal-lalu-reliable di atas TETAP relevan sbg referensi teknis.

## FAR Overseas Air — PIC per-memo assignment

Kolom **PIC** di List Memo = dropdown pilih user per-baris (bukan text bebas) — user yg dipilih
SATU-SATUNYA yg boleh approve tahap PIC memo itu. Dropdown "Jabatan Approval FAR Overseas" di
Kelola Role & Akses TIDAK berpengaruh ke tahap PIC (TETAP berlaku ke TIER2/SPV & TIER3/Director).
Baris belum di-assign PIC → TIDAK ADA SIAPA PUN eligible (termasuk Admin).

- Kolom `rekapan_far_overseas_air.pic_user_id` (uuid, FK `profiles.id`) — SATU-SATUNYA sumber
  otorisasi tahap PIC. `pic_name` (text) murni kosmetik/cetak, auto-sync tiap `pic_user_id`
  berubah. `picDisplayName` (`FarOverseasAirDetailModal.tsx`) TIDAK PERNAH fallback ke
  `rec.pic_name` kalau PIC belum approve (`picEntry?.nama || null`, konsisten dgn `eximName`).
- Dropdown PIC (`ctx.picUsers`) HANYA user yg SUDAH punya jabatan "PIC" (`user_approval_tiers`
  page_key='direct_loading' tier='PIC') DAN masih punya page access — RPC
  `get_users_with_approval_tier(p_page_key, p_tier)`. Ini CUMA mempersempit pilihan dropdown,
  BUKAN mekanisme otorisasi (itu tetap `pic_user_id` per-memo). Admin TIDAK otomatis muncul.
- `FarOverseasAirHelpers.ts`: `pic_user_id` di `REKAPAN_EDITABLE_FIELDS`, `fetchPicEligibleUsers()`.
- `FarOverseasAirDetailModal.tsx`: `isEligibleForStep(step)` — utk PIC cek `rec.pic_user_id ===
  user?.id` (BUKAN `canApproveTier`), step lain tetap `canApproveTier(...)`.

**BELUM DIJALANKAN ke Supabase production — WAJIB dijalankan manual dulu**:
```sql
alter table public.rekapan_far_overseas_air
  add column if not exists pic_user_id uuid references public.profiles(id);

drop function if exists public.get_users_with_page_access(text);

create or replace function public.get_users_with_approval_tier(p_page_key text, p_tier text)
returns table (id uuid, nama text, email text)
language sql security definer stable as $$
  select distinct p.id, p.nama, p.email
  from public.profiles p
  join public.user_approval_tiers uat on uat.user_id = p.id and uat.page_key = p_page_key and uat.tier = p_tier
  join public.user_roles ur on ur.user_id = p.id
  join public.role_page_access rpa on rpa.role_id = ur.role_id and rpa.page_key = p_page_key
  order by p.nama;
$$;
grant execute on function public.get_users_with_approval_tier(text, text) to authenticated;

create or replace function public.approve_far_overseas_air(
  p_id uuid, p_step text, p_nama text, p_jabatan text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_current_status text; v_expected_status text; v_new_status text;
  v_entry_tier_text text; v_entry jsonb; v_new_approvals jsonb;
begin
  if not public.has_edit_access('direct_loading') then
    raise exception 'Not authorized to edit FAR Overseas Air memos';
  end if;
  if p_step not in ('TIER1', 'PIC', 'TIER2', 'TIER3') then
    raise exception 'Invalid approval step: %', p_step;
  end if;

  -- TAHAP PIC: otorisasi dari pic_user_id PER-MEMO, BUKAN user_approval_tiers.
  -- TIER1/TIER2/TIER3 TETAP lewat user_approval_tiers.
  if p_step = 'PIC' then
    if not exists (
      select 1 from public.rekapan_far_overseas_air
      where id = p_id and pic_user_id = auth.uid()
    ) then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
  else
    if not exists (
      select 1 from public.user_approval_tiers uat
      where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = p_step
    ) then
      raise exception 'You do not have the % approval role', p_step;
    end if;
  end if;

  select approval_status into v_current_status from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;

  v_expected_status := case p_step when 'TIER1' then 'PENDING' when 'PIC' then 'TIER1_DONE'
    when 'TIER2' then 'PIC_DONE' when 'TIER3' then 'TIER2_DONE' end;
  if v_current_status is distinct from v_expected_status then
    raise exception 'This memo is not currently awaiting the % step (current status: %)', p_step, v_current_status;
  end if;

  v_new_status := case p_step when 'TIER1' then 'TIER1_DONE' when 'PIC' then 'PIC_DONE'
    when 'TIER2' then 'TIER2_DONE' when 'TIER3' then 'APPROVED' end;
  v_entry_tier_text := case p_step when 'PIC' then 'PIC' when 'TIER1' then '1' when 'TIER2' then '2' when 'TIER3' then '3' end;
  v_entry := case p_step
    when 'PIC' then jsonb_build_object('tier','PIC','nama',p_nama,'jabatan','PIC','approved_at',now(),'user_email',auth.email())
    else jsonb_build_object('tier', (case p_step when 'TIER1' then 1 when 'TIER2' then 2 when 'TIER3' then 3 end),
      'nama', p_nama, 'jabatan', coalesce(p_jabatan,'-'), 'approved_at', now(), 'user_email', auth.email())
  end;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_approvals
  from jsonb_array_elements(coalesce((select approvals from public.rekapan_far_overseas_air where id = p_id), '[]'::jsonb)) elem
  where (elem->>'tier') is distinct from v_entry_tier_text;
  v_new_approvals := v_new_approvals || jsonb_build_array(v_entry);

  update public.rekapan_far_overseas_air set approval_status = v_new_status, approvals = v_new_approvals where id = p_id;
  return jsonb_build_object('approval_status', v_new_status, 'approvals', v_new_approvals);
end;
$$;
grant execute on function public.approve_far_overseas_air(uuid, text, text, text) to authenticated;

create or replace function public.reject_far_overseas_air(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer as $$
declare v_current_status text; v_next_step text;
begin
  if not public.has_edit_access('direct_loading') then raise exception 'Not authorized to edit FAR Overseas Air memos'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Rejection reason is required'; end if;
  select approval_status into v_current_status from public.rekapan_far_overseas_air where id = p_id for update;
  if not found then raise exception 'Memo not found: %', p_id; end if;
  if v_current_status in ('APPROVED', 'REJECTED') then
    raise exception 'This memo cannot be rejected (current status: %)', v_current_status;
  end if;
  v_next_step := case coalesce(v_current_status, 'PENDING')
    when 'PENDING' then 'TIER1' when 'TIER1_DONE' then 'PIC' when 'PIC_DONE' then 'TIER2' when 'TIER2_DONE' then 'TIER3' end;
  if v_next_step = 'PIC' then
    if not exists (select 1 from public.rekapan_far_overseas_air where id = p_id and pic_user_id = auth.uid()) then
      raise exception 'You are not the assigned PIC for this memo';
    end if;
  else
    if not exists (
      select 1 from public.user_approval_tiers uat
      where uat.user_id = auth.uid() and uat.page_key = 'direct_loading' and uat.tier = v_next_step
    ) then
      raise exception 'You do not have the % approval role for this step', v_next_step;
    end if;
  end if;
  update public.rekapan_far_overseas_air set approval_status = 'REJECTED', notes = p_reason where id = p_id;
  return jsonb_build_object('approval_status', 'REJECTED', 'notes', p_reason);
end;
$$;
grant execute on function public.reject_far_overseas_air(uuid, text) to authenticated;
```
Kalau nemu versi LAMA function ini (guard PIC lewat `user_approval_tiers` polos), `create or
replace` di atas timpa otomatis — JANGAN reintroduce guard lama itu utk tahap PIC.

## FAR Overseas Air / Bunker — Clear massal Processing Queue

Tombol **"✕ Clear Completed/Failed"** di header modal Processing Queue (`FarOverseasAirPage.tsx`
& `BunkerPage.tsx`, implementasi independen masing2, TIDAK shared) — muncul kalau ada ≥1 item
SUCCESS/FAILED, hapus semua sekaligus. Tombol "×" per-kartu (`dismissQueueItem`) tetap ada.
PENDING/PROCESSING tidak ikut kehapus.

## FAR Overseas Air — NOTE 2 "From Document" + "Manual Note" + tampil di memo cetak

Kolom NOTE 2 = 2 bagian: **kiri "From Document"** = `item_description` (awalnya hasil ekstraksi
n8n; **SEMPAT dikunci read-only total** — dikeluarkan dari `REKAPAN_EDITABLE_FIELDS` — TAPI
2026-09 DIBUKA JUGA jadi bisa diedit manual & disimpan, atas permintaan eksplisit user,
`item_description` DIKEMBALIKAN ke `REKAPAN_EDITABLE_FIELDS`, kolom `<EditableCell>` di
`FarOverseasAirPage.tsx` terikat `pendingEdits`/`getVal`/`setVal` spt kolom lain — n8n TETAP bisa
menimpa nilai ini di ekstraksi berikutnya, edit manual TIDAK permanen mencegah itu, beda dgn pola
`manual_override_fields` Audit Courier); **kanan "Manual Note"** = kolom `item_description_manual`
(ikut pola `pendingEdits` biasa, TIDAK pernah ditimpa n8n). Memo cetak baris "2." format
`ITEMS : {item_description} ({item_description_manual})` (kurung cuma muncul kalau manual note
terisi). `FAR_EXPORT_COLS` include `item_description_manual`.

**RPC `update_rekapan_far_overseas_manual`** — dibuat user sendiri langsung di Supabase (bukan
lewat sesi Claude Code sebelumnya) — body PERNAH diminta & dikirim user via `pg_get_functiondef`
(2026-09): `item_description` **SUDAH ADA** di `v_allowed_columns`-nya (tidak perlu patch apa
pun utk NOTE 2 From Document). TAPI ditemukan **`item_description_manual` DAN `pic_user_id`
TERNYATA TIDAK ADA** di whitelist yang sama — persis gejala bug "toast sukses tapi nilai balik
ke lama saat refresh" yang sebelumnya dicatat di dokumen ini sbg "sudah diperbaiki" (rupanya versi
RPC yang aktif sekarang tidak/belum membawa perbaikan itu). Fix:
`sql/013_update_rekapan_far_overseas_manual_whitelist_fix.sql` (**BELUM DIJALANKAN ke Supabase
production — WAJIB dijalankan manual dulu**) — `CREATE OR REPLACE` REPLIKA PERSIS body asli yang
dikirim user, HANYA menambah 2 string (`'item_description_manual'`, `'pic_user_id'`) ke array
`v_allowed_columns`, tidak ada logic lain yang diubah. **Kalau ke depan ada laporan serupa lagi
("sudah Save tapi field X balik kosong") — WAJIB minta user jalankan `select
pg_get_functiondef('update_rekapan_far_overseas_manual'::regproc)` dulu dan BACA hasilnya
sebelum menulis `CREATE OR REPLACE` apa pun** (JANGAN tebak isi `v_allowed_columns` dari memori
dokumen ini — sudah terbukti bisa basi/tidak sinkron dgn RPC yang benar2 aktif).

**BELUM DIJALANKAN ke Supabase — WAJIB manual**:
```sql
alter table public.rekapan_far_overseas_air add column if not exists item_description_manual text;
```

## FAR Overseas Air — NOTE 3 format baku "BARANG DITERIMA LOG {KOTA} {TANGGAL}"

List Memo kolom NOTE 3 (`status_note`) — UI dipaksa format baku: **kota** (read-only, dari
`cost_validasi_far_overseas_air.rate_row_used.tujuan`) + **tanggal** (`<input type="date">`).
Kolom DB TETAP 1 (`status_note`, text) — hasil pilihan dikomposisi jadi 1 string
`"BARANG DITERIMA LOG {KOTA} {DD/MM/YYYY}"` (`composeStatusNote()`, `FarOverseasAirPage.tsx`).
Edit ulang → tanggal di-parse balik dari akhir string (`parseStatusNoteDateIso()`, regex
`(\d{2})\/(\d{2})\/(\d{4})\s*$`) — kalau format lama tidak cocok, date picker kosong (bukan
error).

- Sumber kota — `ListRenderCtx.costCityMap`, di-fetch bareng `costStatusMap` (1 query,
  `fetchCostStatusMap()` + kolom `rate_row_used`). TIDAK live-refresh, baru update saat
  `fetchList()` berikutnya.
- Belum ada Cost Validation matched → date picker `disabled`, teks "(no destination city yet)"
  — mencegah tersimpan string dgn kota kosong.
- **User TIDAK BISA lagi ketik bebas ke NOTE 3 lewat form ini** — kalau perlu teks bebas
  tambahan ke depan, bikin field baru terpisah (pola NOTE 2), JANGAN kembalikan ke free-text.

## FAR Overseas Air — toggle tampilan List/Card (`FarOverseasAirPage.tsx`)

Toolbar List Memo toggle **List/Card** (state `viewMode`, default **CARD**, tidak disimpan).
**Card MURNI tampilan ringkas, TIDAK mereplikasi form edit** (~25 kolom List, dipaksa jadi card
penuh malah berantakan). `FarOverseasAirDetailModal.tsx` (modal approval/memo cetak) **SENGAJA
TIDAK disentuh** oleh fitur Card ini sama sekali — cuma DIPANGGIL via deep-link yang sudah ada.

- **Card** — grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`, `rows`/`page`/`pageSize`/filter
  SAMA dgn List. Urutan field DI DALAM card (KHUSUS card, beda dari `LIST_COLUMNS`, JANGAN
  disamakan otomatis kalau List berubah): header Ship Via + badge Approval/Cost Status → grid
  Invoice No | Inv Date → Vendor → No PO ("+N more") → grid Total Amount | Qty/Weight → Notes 1.
  Field Vessel DIHAPUS dari card (tetap ada di List). `memo_title` tampil di pojok kanan atas
  (`text-right max-w-[55%]`) kalau terisi.
- **Tombol "Print Memo"** (di card, setelah Edit) — pinjam mekanisme deep-link
  `/direct-loading/:id` yang sudah ada (sama dgn tombol Approval): `onClick` set
  `autoPrintRef.current = true` lalu `navigate()`, effect `loadDeepLink` yang sudah ada deteksi
  flag ini lalu trigger print otomatis. **Deteksi "modal siap print" pakai `MutationObserver`**
  generik pada `#far-overseas-print-area` — tunggu TIDAK ADA perubahan DOM lagi selama 400ms
  (debounce, menandakan semua fetch async internal modal SUDAH commit), baru `window.print()`
  (dalam 2x `requestAnimationFrame`, safety cap 3 detik). **JANGAN ganti ke fixed-delay
  `setTimeout` ATAU proxy-fetch duplikat query modal** — keduanya sudah dicoba & gagal (fixed
  delay: print kosong kalau device lambat; proxy-fetch: race condition, tidak menjamin urutan
  vs fetch asli modal `select('*')`). Pendekatan `MutationObserver` generik & tidak perlu tahu
  fetch spesifik apa pun di dalam modal, otomatis tetap benar walau modal nambah fetch baru.
  Edge case diterima: kalau modal MEMO YANG SAMA sudah terbuka saat tombol diklik, print tidak
  otomatis terpicu (`navigate()` ke path sama tidak re-trigger effect) — user klik Print manual.
- **4 tombol aksi per card** (bukan dropdown Action spt List): Approval, Cost, Edit
  (`canEditDirectLoading`), Delete (`canEditDirectLoading`).
- **Edit di card → buka `FarOverseasAirCardEditModal`** (modal tersendiri, BUKAN pindah ke List
  — JANGAN reintroduce alur pindah-ke-List). Komponen ini **REUSE PERSIS `LIST_COLUMNS`** (tidak
  duplikasi logic input) — trik: `ctx.editingRowId` DIPAKSA `=== row.id` supaya semua
  `col.render` yang cek `ctx.editingRowId` otomatis tampil varian edit tanpa kode tambahan.
  `pendingEdits`/`getVal`/`setVal` instance SAMA dgn List/edit massal (key by row id sama).
  Save Changes → `handleSaveAllEdits([row.id])`; Cancel → `handleDiscardRowEdit(row.id)`
  (fungsi khusus 1 row, beda dari tombol "X" yang cuma tutup modal tanpa buang pending edit).
  `z-[65]` (antara `FarOverseasAirDetailModal` `z-[60]` dan
  `FarOverseasAirCostValidationModal`/`WeightBreakdownModal` `z-[70]`/`z-[75]`).
- Area scroll Card terpisah dari List (List = scroll ganda horizontal, Card = 1
  `overflow-y-auto` vertikal). Footer pagination TIDAK diduplikasi (1 footer dipakai bareng).
- **Baris tombol aksi SELALU rata bawah per card** — konten card dibungkus `<div
  className="flex-1">`, baris tombol `mt-auto`. Kalau nambah field baru ke card, WAJIB taruh DI
  DALAM wrapper `flex-1` ini, bukan sejajar baris tombol.

## FAR Overseas Air — Search + Sort di toolbar List Memo (`FarOverseasAirPage.tsx`)

Dropdown "Items" (pageSize selector) DIGANTI **Search box + dropdown Sort + toggle arah**.
`pageSize` state TETAP ADA, cuma UI selector-nya dihilangkan.

- **Search** (debounced 400ms) — `.or()` ilike server-side ke `ship_via`, `vendor`, `route_note`
  (NOTE 1), `item_description_manual` (NOTE 2 Manual). `%`/`_` di-escape sebelum masuk pattern.
- **Sort** — 5 opsi: Date (`invoice_date`, default DESC), Ship Via, Vendor, Notes 1 (Origin),
  Notes 2 (Manual). **Batasan disengaja "Notes 1 (Origin)"**: ORDER BY kolom `route_note` APA
  ADANYA (bukan hasil ekstrak origin) — karena SEMUA nilai berformat baku "PENGIRIMAN DARI
  {asal} KE {tujuan}...", prefix yang sama di semua baris bikin ORDER BY teks mentah otomatis
  ekuivalen dgn sort by kota/negara asal. Data non-standar tetap ikut ter-sort, cuma kurang
  presisi — diterima, tidak ada kolom "origin" terpisah di DB.
- `page` reset ke 1 otomatis tiap search/sort berubah.
- Ukuran kontrol toolbar SAMA dgn kontrol lain di baris itu (`h-[34px]`/`text-xs`/`size={13-14}`)
  — HANYA lebar yang beda: Search `w-[125px]`, Sort `w-[150px]`. Placeholder "Search..." (detail
  4 kolom yang dicari ada di `title` tooltip).
- Berlaku sama ke List & Card (state search/sort tidak dibedakan per viewMode).

## FAR Overseas Air — arsitektur cost validation

`rekapan_far_overseas_air` (`route_note` = "PENGIRIMAN DARI {asal} KE {tujuan} ({mode})") ↔ 1:1
via `far_overseas_id` ↔ `cost_validasi_far_overseas_air` (`vendor_matched`, `rate_row_used`
jsonb, `status`, `catatan`, `cost_validation` jsonb array).

- Baris TOTAL AMOUNT (memo cetak) non-IDR: "(≈ Rp ...)" + "(Kurs: ...)" — kurs dihitung ulang
  dari `total_amount_idr/total_amount` (bukan field `kurs_used` tersimpan), supaya konsisten.
- **Filter approval per level** (List Memo) — dropdown `approvalFilter` (ALL/TIER1/PIC/TIER2/
  TIER3), tiap opsi tampil COUNT pending (`fetchApprovalCounts`). Map ke `approval_status` via
  `APPROVAL_FILTER_STATUS` (TIER1→PENDING, PIC→TIER1_DONE, TIER2→PIC_DONE, TIER3→TIER2_DONE),
  server-side `.eq()`.
- **Approval berjenjang WAJIB berurutan: Prepared By(Exim) → PIC → SPV → Director** (VERSI
  FINAL, JANGAN reintroduce versi PIC-independen lama). `approval_status` 5 nilai:
  `PENDING`→`TIER1_DONE`→`PIC_DONE`→`TIER2_DONE`→`APPROVED`.
  `nextStepForStatus()`/`STEP_ENTRY_TIER`/`STEP_STATUS_AFTER`/`STEP_LABEL`/`STEP_ACTION_LABEL`
  di `FarOverseasAirDetailModal.tsx`. Kolom tanda tangan cetak TETAP cuma 3 — nama PIC digabung
  ke "Disiapkan Oleh" bareng Exim (`"{exim}/{pic}"`), TIDAK PERNAH kolom sendiri.
  Gating approve: `canEditDirectLoading` DAN `canApproveTier('direct_loading', step)`.
  **Approve satu klik langsung, TIDAK ADA modal konfirmasi nama** (JANGAN reintroduce) —
  `handleApprove(nextStep, defaultNamaForStep(nextStep))`. `defaultNamaForStep`: TIER1&PIC =
  identitas login (`profile?.nama || user?.email`); TIER2&TIER3 = jabatan resmi TETAP dari
  `far_overseas_signer_config` (BUKAN nama user login).
  **Reject HANYA utk user eligible approve TAHAP AKTIF** (`canReject = nextStep != null &&
  canApproveTier(...)`, SAMA syarat dgn Approve, tidak ada bypass Admin) — via RPC
  `reject_far_overseas_air`, JANGAN `.update()` langsung.
- **Document Validation** (`FarOverseasAirCostValidationModal.tsx`) — baris NAMA PT yg cocok
  `dominantPtName` dikasih centang hijau. PT Name & PO Number 1 baris horizontal (PO No. dulu
  baru PT Name, `whitespace-nowrap`). Modal `max-w-5xl`.
- **RPC-only mutation** — JANGAN `.update()`/`.insert()` mentah ke 2 tabel ini. Selalu
  `update_rekapan_far_overseas_manual(p_id, p_updates)` &
  `update_cost_validasi_far_overseas_manual(...)`.
  **KRITIS — whitelist kolom RPC TERPISAH dari frontend**: `update_rekapan_far_overseas_manual`
  punya `v_allowed_columns` HARDCODE terpisah total dari `REKAPAN_EDITABLE_FIELDS` frontend.
  Field yg ada di frontend tapi TIDAK di whitelist RPC → diam-diam SKIP (`RAISE WARNING`, bukan
  error) — toast "saved successfully" tapi nilai balik ke lama saat refresh (sudah terjadi utk
  `item_description_manual` & `pic_user_id`). **ATURAN WAJIB**: tiap nambah field ke
  `REKAPAN_EDITABLE_FIELDS`, WAJIB minta user jalankan `create or replace` nambah kolom yg sama
  ke `v_allowed_columns` — kalau ada laporan "sudah Save tapi field X balik kosong", cek
  `v_allowed_columns` dulu (`pg_get_functiondef`).
- `FarOverseasAirHelpers.ts` — `computeExpectedFromRate`, `computeCostStatus`, `parseRouteNote`,
  `mapModeToJenisLayanan`, `rematchTarif` (REPLIKA PERSIS logic matching tarif n8n — kalau
  diubah, HARUS sinkron n8n). `rematchTarif` SATU-SATUNYA fungsi matching, JANGAN bikin versi
  kedua.
- **Edit NOTE 1 memicu re-kalkulasi Cost Validation otomatis** — `reMatchAfterRouteNoteEdit`
  (`FarOverseasAirPage.tsx`), dipanggil dari `handleSaveAllEdits` tiap `route_note` berubah.
  Parse route baru → `mapModeToJenisLayanan` → `rematchTarif` → 0 kandidat=`BELUM_LENGKAP`,
  1=hitung ulang expected, >1=array pilihan manual.
- `po_list` (jsonb array `{po_no_raw, vessel_raw}`) = SATU-SATUNYA sumber pasangan PO↔Vessel
  presisi. `vessel_internal_note` cuma string ringkas nama kapal, JANGAN di-parse utk breakdown.
- Memo cetak: `vessel_internal_note` TIDAK PERNAH dirender (hanya kolom VESSEL List Memo).
  Urutan field: PO.No/Supplier & Inv.No/Date 2 blok independen; baris bawah Buyer → Ship Via →
  Departure Date → Weight → Price/Kg → TOTAL AMOUNT. Note pembayaran 1 baris DI LUAR kotak memo
  tapi TETAP tercetak.

## FAR Overseas Air — NOTE 1 (route_note) jadi 3 dropdown simetris (2026-09)

Kolom NOTE 1 di List Memo — dulu `EditableCell` teks bebas format baku "PENGIRIMAN DARI {ASAL}
KE {TUJUAN} ({JENIS})" yang rawan typo/tidak match ke data tarif — sekarang **3 dropdown
terpisah**: Origin, Destination, Service Type (`RouteNoteEditCell`, module-level, di atas
`LIST_COLUMNS`, dekat `MemoTitleEditCell`).

- **Opsi dropdown** — nilai UNIK `origin`/`tujuan`/`jenis_layanan` dari `far_overseas_tarif_vendor`,
  difilter ke `vendor_name` yang cocok `ship_via` baris ini via `vendorTargetFromShipVia()`
  (fungsi BARU di `FarOverseasAirHelpers.ts`, SATU-SATUNYA pemetaan OCTAGON/JIANQIAO — di-refactor
  keluar dari `rematchTarif` yang sebelumnya py logic inline sendiri, supaya tidak duplikat).
  Data tarif (`tarifVendorRows` state BARU, `far_overseas_tarif_vendor` full-fetch sekali saat
  halaman dibuka) ditambahkan ke `ListRenderCtx` — 2 titik konstruksi ctx (row List biasa &
  `FarOverseasAirCardEditModal`) WAJIB tetap sinkron kalau `ListRenderCtx` nambah field lagi.
- **Nilai awal dropdown** — `parseRouteNote()` (fungsi lama, TIDAK diubah) lalu dicocokkan
  case-insensitive ke opsi dropdown (`findMatch()`). Kalau tidak cocok satu pun opsi (kemungkinan
  hasil bacaan Gemini beda ejaan/kapitalisasi dari data tarif, atau data lama), dropdown itu
  dibiarkan KOSONG/unselected — TIDAK dipaksakan pilih salah satu opsi (permintaan eksplisit
  user). Dropdown Jenis Layanan py fallback tambahan: kalau parse langsung gagal, coba lagi lewat
  `mapModeToJenisLayanan()` (menerjemahkan abbreviation NOTE 1 versi LAMA — "AIR"/"SEA"/dst —
  ke nilai `jenis_layanan` canonical) supaya data lama tetap ter-preselect dgn benar.
- **Commit/compose** — `route_note` BARU cuma di-`onChange` (masuk `pendingEdits`) kalau
  KETIGA dropdown sudah terisi (`PENGIRIMAN DARI {origin} KE {tujuan} ({jenis})`, HURUF BESAR
  semua) — belum lengkap = belum ada teks valid utk disimpan, TIDAK ada commit parsial.
- **Simetris di alur re-match** (`reMatchAfterRouteNoteEdit`, TIDAK diubah strukturnya) — SEKARANG
  benar2 simetris utk ketiga dropdown (dulu cuma Kota Tujuan yang efektif memicu tarif baru krn
  `rematchTarif` jenis-nya `===` strict, mode LAMA di NOTE 1 abbreviation vs `jenis_layanan` tabel
  beda casing selalu gagal match diam2): `rematchTarif()` jenis matching DIGANTI dari `===` strict
  jadi case-insensitive (simetris dgn origin/tujuan yang SUDAH case-insensitive dari awal) —
  `mapModeToJenisLayanan()` juga DIGANTI, kalau tidak kena 5 kategori hardcode (Air/Sea/Reguler/
  Economy/Express) SEKARANG return teks aslinya apa adanya (BUKAN `null` lagi) — kombinasi
  keduanya bikin ubah dropdown JENIS APA PUN (bukan cuma 5 kategori lama) ikut memicu rematch
  tarif dengan benar, tidak lagi diam2 fallback ke `rate_row_used` lama.

## FAR Overseas Air — MEMO TITLE jadi dropdown + "Add new..." (2026-09)

Kolom MEMO TITLE (`memo_title`) di List Memo — dulu `EditableCell` teks bebas biasa, sekarang
`render` custom (`MemoTitleEditCell`, module-level di `FarOverseasAirPage.tsx`, di atas
`LIST_COLUMNS`) — dropdown isi nilai UNIK yang SUDAH pernah dipakai di data, TIDAK ADA tabel
master baru (keputusan eksplisit user, dropdown PT-style yang tetap bottleneck-prone di modul
lain SENGAJA tidak direplikasi di sini). Opsi "+ Add new..." (`ADD_NEW_MEMO_TITLE` sentinel)
beralih tampilan dari `<select>` ke `<input>` teks biasa (state lokal `addingNew`) — commit-nya
lewat `ctx.addMemoTitleOption(title)` yang menambah ke state `memoTitleOptions` IN-MEMORY (bukan
tabel/localStorage) supaya baris LAIN di sesi yang sama langsung bisa pilih judul itu tanpa
refresh. Judul baru itu OTOMATIS ikut muncul lagi di sesi BERIKUTNYA begitu baris tersimpan
(krn `fetchDistinctMemoTitles()` baca ulang dari kolom `memo_title` tabel, bukan daftar terpisah)
— TIDAK perlu migrasi apa pun.

- `fetchDistinctMemoTitles()` (`FarOverseasAirHelpers.ts`) — `select('memo_title').limit(2000)`
  + dedup di client, di-fetch sekali saat halaman dibuka (pola sama `fetchPicEligibleUsers`).
  `.limit(2000)` sbg jaga2 (jumlah NILAI UNIK judul memo wajar jauh lebih kecil dari total baris
  tabel, beda kasus dari dropdown PT Audit AP yang sempat jadi bottleneck di >100rb baris).
- `ListRenderCtx` (`FarOverseasAirPage.tsx`) ditambah `memoTitleOptions`/`addMemoTitleOption` —
  dikonstruksi di 2 titik (row List biasa & `FarOverseasAirCardEditModal`), keduanya WAJIB tetap
  sinkron kalau nambah field `ListRenderCtx` baru lagi ke depan.
- Mode tampil (bukan edit) TETAP teks polos (bukan badge/dropdown), konsisten kolom lain.
