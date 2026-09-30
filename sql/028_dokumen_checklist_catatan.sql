-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 028 — "Catatan Checklist" di tab Checklist jendela Validation Audit Courier (2026-09-30)
--        BELUM DIJALANKAN ke production.
--
-- Tabel  : public.dokumen_checklist (Document Completeness Checklist, 1 baris per pib_id/cn_id)
-- Kolom  : catatan_checklist text NULL (tanpa default -> insert n8n yang tidak tahu kolom ini
--          tetap jalan apa adanya, nilainya NULL)
-- Ditulis: HANYA dari app (ChecklistModal, tombol "Save Checklist", ikut payload update/insert
--          yang sama -- tidak ada RPC baru). RLS existing tabel ini (has_page_access/
--          has_edit_access 'courier_checklist_dokumen') otomatis berlaku, tidak ada policy baru.
--
-- SEBELUM MENJALANKAN: pastikan kolom belum ada (hasil HARUS 0 baris):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'dokumen_checklist' and column_name = 'catatan_checklist';
--
-- Frontend AMAN di-deploy sebelum SQL ini: selama kolom belum ada, kotak Catatan Checklist tampil
-- nonaktif dan tidak ikut dikirim saat Save Checklist (deteksi otomatis).
-- Idempotent (aman dijalankan ulang).
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.dokumen_checklist
  add column if not exists catatan_checklist text;

comment on column public.dokumen_checklist.catatan_checklist is
  'Catatan bebas checker di tab Checklist jendela Validation (Audit Courier). Diisi dari app, bukan n8n.';
