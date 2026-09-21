-- GRANT dasar tabel `audit_trail` ke role `authenticated` (2026-09, TAMBAHAN setelah laporan
-- user "masih 403 walau policy RLS sudah dijalankan") -- error browser `code: 42501, message:
-- "permission denied for table audit_trail"` itu error GRANT level OBJEK (di LUAR RLS,
-- dievaluasi LEBIH DULU sebelum Postgres sempat cek policy RLS mana pun) -- BEDA dari
-- pelanggaran RLS yang pesannya "new row violates row-level security policy for table ...".
-- Kemungkinan besar tabel `audit_trail` dulu dibuat TANPA grant eksplisit ke `authenticated`
-- (kalau dibuat manual via SQL Editor tanpa lewat Table Editor UI, Postgres TIDAK otomatis
-- grant apa pun ke role lain). Aman dijalankan ulang (grant bersifat idempotent).
grant select, insert on public.audit_trail to authenticated;

-- RLS `audit_trail` utk Audit AP Local/Overseas/PI Local (2026-09) -- policy ini SUDAH
-- didokumentasikan di docs/claude/audit-po.md sejak fitur "Riwayat Perubahan" dibuat, TAPI
-- ternyata BELUM PERNAH benar2 dijalankan ke production -- root cause laporan user "Riwayat
-- Perubahan tidak tercatat" di 3 halaman ini (insert ke audit_trail ditolak RLS, errornya
-- silent krn kode lama tidak await/cek hasil logAuditPoAudit -- sudah diperbaiki terpisah di
-- AuditPoPage.tsx/AuditPoOverseasPage.tsx/PiLocalPage.tsx). `drop policy if exists` dulu supaya
-- file ini aman dijalankan ulang kalau sebagian policy ternyata SUDAH ada sebagian.
drop policy if exists "audit_trail_insert_audit_po_ap" on public.audit_trail;
create policy "audit_trail_insert_audit_po_ap" on public.audit_trail
  for insert with check (tabel = 'audit_po_ap_comp' and public.has_edit_access('audit_po'));
drop policy if exists "audit_trail_select_audit_po_ap" on public.audit_trail;
create policy "audit_trail_select_audit_po_ap" on public.audit_trail
  for select using (tabel = 'audit_po_ap_comp' and public.has_page_access('audit_po'));

drop policy if exists "audit_trail_insert_audit_po_ovs" on public.audit_trail;
create policy "audit_trail_insert_audit_po_ovs" on public.audit_trail
  for insert with check (tabel = 'audit_po_apovs_comp' and public.has_edit_access('audit_po_overseas'));
drop policy if exists "audit_trail_select_audit_po_ovs" on public.audit_trail;
create policy "audit_trail_select_audit_po_ovs" on public.audit_trail
  for select using (tabel = 'audit_po_apovs_comp' and public.has_page_access('audit_po_overseas'));

drop policy if exists "audit_trail_insert_pi_local" on public.audit_trail;
create policy "audit_trail_insert_pi_local" on public.audit_trail
  for insert with check (tabel = 'audit_po_pi_local_comp' and public.has_edit_access('pi_local'));
drop policy if exists "audit_trail_select_pi_local" on public.audit_trail;
create policy "audit_trail_select_pi_local" on public.audit_trail
  for select using (tabel = 'audit_po_pi_local_comp' and public.has_page_access('pi_local'));
