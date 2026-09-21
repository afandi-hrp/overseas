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

Kolom NOTE 2 = 2 bagian: **kiri "From Document"** = `item_description` (hasil ekstraksi n8n,
read-only selamanya); **kanan "Manual Note"** = kolom `item_description_manual` (ikut pola
`pendingEdits` biasa). Memo cetak baris "2." format `ITEMS : {item_description}
({item_description_manual})` (kurung cuma muncul kalau manual note terisi). `FAR_EXPORT_COLS`
include `item_description_manual`.

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
