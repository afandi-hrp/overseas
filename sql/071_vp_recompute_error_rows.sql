-- 071: hitung ulang hasil vendor payments Sea & Air yang tersimpan sebagai ERROR (sisa bug "UPDATE requires a WHERE clause", sql/070).
-- fn_vp_ambil_seaair TIDAK menghitung ulang bila baris seaair_vp_hasil sudah ada, jadi hasil ERROR lama tetap tampil di panel
-- walau fungsi hitungnya sudah diperbaiki. Dijalankan MANUAL di SQL Editor. Aman diulang (hanya menyentuh baris status 'ERROR').
SELECT seaair_id, (fn_vp_simpan_hasil_seaair(seaair_id) ->> 'ada_data') AS ada_data
FROM seaair_vp_hasil
WHERE status = 'ERROR';

-- Cek: baris yang masih ERROR (kalau ada, lihat kolom error_message -- itu error BARU, bukan yang sudah diperbaiki)
SELECT seaair_id, error_message FROM seaair_vp_hasil WHERE status = 'ERROR';
