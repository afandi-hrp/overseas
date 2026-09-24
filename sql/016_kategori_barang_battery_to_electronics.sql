-- 2026-09: opsi "Kategori Barang" (Tarif Vendor FAR Overseas Air, khusus vendor Jianqiao + Jenis
-- Layanan Sea Freight) "BATTERY" diganti "ELECTRONICS" (lingkup diperluas dari cuma baterai jadi
-- barang elektronik pada umumnya) -- FarOverseasVendorTarifPage.tsx `KATEGORI_BARANG_OPTIONS`.
-- Selaraskan quotation LAMA yang masih tersimpan 'BATTERY' supaya (1) tetap konsisten tampil di
-- badge/label kategori tabel quotation, DAN (2) dropdown Edit quotation lama tidak mismatch
-- (value 'BATTERY' sudah tidak ada di opsi baru -- <select> native tampil kosong kalau value-nya
-- tidak cocok opsi manapun).
update public.far_overseas_tarif_quotation
  set kategori_barang = 'ELECTRONICS'
  where kategori_barang = 'BATTERY';
