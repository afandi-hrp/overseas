-- Fix duplikasi Audit Trail Bunker (2026-09, laporan user "1 aksi Manual Confirmation jadi 2
-- baris di audit_trail") -- root cause: kolom `status_manual` SUDAH dicatat manual lewat
-- `logBunkerAudit()` di kode aplikasi (`BunkerCompareDocModal.tsx`, format rapi "Manual
-- Confirmation: {field} — Lama: X → Baru: Y"), TAPI trigger `fn_audit_bunker_dokumen` (AFTER
-- UPDATE) TETAP jalan independen utk update yang SAMA (guard `auth.email() IS NULL` hanya
-- menyaring insert dari n8n/service-role, TIDAK menyaring update dari user login manapun
-- termasuk yang sudah dicatat manual) -- hasilnya dump mentah `fn_audit_diff` (mis.
-- `status_manual: {} -> {...}`) tertulis JUGA sbg baris ke-2, terpisah dari baris rapi yg sudah
-- ditulis app. Modal "Change History" SUDAH DIPERBAIKI TERPISAH menyembunyikan baris dump ini
-- dari TAMPILAN (lihat BunkerAuditLogModal.tsx) -- fix DI SINI utk baris FISIK di database-nya.
--
-- Fix: cabang UPDATE trigger SEKARANG skip insert audit_trail SAMA SEKALI kalau kolom yg
-- BENERAN berubah HANYA `status_manual` (dan `updated_at`, kolom timestamp auto-touch yg
-- ikut berubah tiap UPDATE apa pun sbg efek samping, BUKAN konten yg relevan diaudit) --
-- dibandingkan via `to_jsonb(OLD) - 'status_manual' - 'updated_at' = to_jsonb(NEW) -
-- 'status_manual' - 'updated_at'` (jsonb minus-key lalu equality, TRUE berarti tidak ada kolom
-- LAIN yang berubah). Kalau ada kolom LAIN yang ikut berubah bareng `status_manual` dalam 1
-- UPDATE yang sama, trigger TETAP jalan normal (baris tetap tercatat, `fn_audit_diff` tetap
-- dump SEMUA kolom yang berubah termasuk `status_manual` apa adanya -- TIDAK dikecualikan dari
-- isi dump, HANYA dikecualikan dari SYARAT "apakah perlu insert sama sekali").
-- Guard `auth.email() IS NULL`, cabang DELETE/INSERT, SISANYA PERSIS SAMA seperti sebelumnya
-- (dikonfirmasi via `pg_get_functiondef` sebelum diubah).
CREATE OR REPLACE FUNCTION public.fn_audit_bunker_dokumen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.email() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_trail (tabel, action, no_dokumen, jenis, user_email)
    VALUES ('bunker_dokumen', 'DELETE', OLD.no_po,
            'BUNKER - ' || COALESCE(OLD.vendor, ''), auth.email());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) - 'status_manual' - 'updated_at') = (to_jsonb(NEW) - 'status_manual' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_trail (tabel, action, no_dokumen, jenis, user_email, catatan)
    VALUES ('bunker_dokumen', 'UPDATE', NEW.no_po,
            'BUNKER - ' || COALESCE(NEW.vendor, ''), auth.email(),
            fn_audit_diff(to_jsonb(OLD), to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_trail (tabel, action, no_dokumen, jenis, user_email)
    VALUES ('bunker_dokumen', 'INSERT', NEW.no_po,
            'BUNKER - ' || COALESCE(NEW.vendor, ''), auth.email());
    RETURN NEW;
  END IF;
END;
$function$
