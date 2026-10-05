-- beehive:042 — Invoice Recap Courier: kolom Tgl Invoice (2026-10-05, keputusan user)
-- Due Date kartu Invoice Recap Courier = Tgl Invoice + 30 hari (dihitung di aplikasi, tidak disimpan).
-- Kolom diisi n8n dari dokumen invoice (sumber dari user menyusul) atau manual lewat tabel List (Edit).
-- Tidak memicu re-audit (fn_courier_reaudit hanya memantau AWB/PO/jenis/no. invoice/nominal) dan ikut kunci
-- Submit to Finance (sql/038) seperti kolom invoice lain. Finance Handover Courier TIDAK berubah (TOP tetap).
-- Idempotent.
alter table public.rekapan_courier add column if not exists tgl_invoice date;
comment on column public.rekapan_courier.tgl_invoice is 'beehive:042 tanggal invoice (dokumen) -- Due Date = tgl_invoice + 30 hari';
