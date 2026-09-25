-- Drag & Drop Reorder -- Audit Courier (Draft/PIB/CN) & Invoice Recap Courier (2026-09).
-- BELUM DIJALANKAN ke Supabase production -- WAJIB dijalankan manual dulu.
-- Lihat docs/claude/courier-features.md bagian "Drag & Drop Reorder" utk arsitektur lengkap.

-- 1 kolom `sort_order` (bukan 2 kolom + COALESCE) -- SELALU terisi (trigger BEFORE INSERT utk
-- baris baru dari n8n yang tidak tahu apa-apa soal kolom ini, atau di-set eksplisit oleh app
-- saat user drag) supaya `.order('sort_order', ...)` PostgREST biasa (bukan RPC/SQL custom)
-- selalu valid.
alter table public.tabel_audit_pib add column if not exists sort_order double precision;
alter table public.tabel_audit_cn add column if not exists sort_order double precision;
alter table public.rekapan_courier add column if not exists sort_order double precision;

-- Backfill data lama: nilai NEGATIF epoch supaya `ORDER BY sort_order ASC` menaruh baris
-- TERBARU (created_at terbesar -> sort_order paling negatif) di paling atas -- identik rule
-- default "CREATED AT, terbaru di atas" yang sudah berlaku sekarang.
update public.tabel_audit_pib set sort_order = -extract(epoch from created_at) where sort_order is null;
update public.tabel_audit_cn set sort_order = -extract(epoch from created_at) where sort_order is null;
update public.rekapan_courier set sort_order = -extract(epoch from created_at) where sort_order is null;

-- Trigger generik (dipasang di ke-3 tabel) -- baris baru yang di-INSERT n8n (service role, tidak
-- tahu kolom ini sama sekali, sort_order-nya NULL) otomatis dapat nilai default yang menaruhnya
-- di paling atas, TANPA app perlu campur tangan apa pun. Baris yang di-INSERT dgn sort_order
-- eksplisit (jarang terjadi dari app, tapi dijaga) TIDAK ditimpa.
create or replace function public.fn_set_default_sort_order()
returns trigger
language plpgsql
as $$
begin
  if new.sort_order is null then
    new.sort_order := -extract(epoch from coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_sort_order_pib on public.tabel_audit_pib;
create trigger trg_set_sort_order_pib
  before insert on public.tabel_audit_pib
  for each row execute function public.fn_set_default_sort_order();

drop trigger if exists trg_set_sort_order_cn on public.tabel_audit_cn;
create trigger trg_set_sort_order_cn
  before insert on public.tabel_audit_cn
  for each row execute function public.fn_set_default_sort_order();

drop trigger if exists trg_set_sort_order_rekapan_courier on public.rekapan_courier;
create trigger trg_set_sort_order_rekapan_courier
  before insert on public.rekapan_courier
  for each row execute function public.fn_set_default_sort_order();

create index if not exists idx_tabel_audit_pib_sort_order on public.tabel_audit_pib (sort_order);
create index if not exists idx_tabel_audit_cn_sort_order on public.tabel_audit_cn (sort_order);
create index if not exists idx_rekapan_courier_sort_order on public.rekapan_courier (sort_order);

-- Kolom ini ikut RLS UPDATE yang SUDAH ADA di ke-3 tabel (has_edit_access('courier_audit')/
-- ('courier_rekapan')) -- TIDAK perlu policy baru, drag reorder cukup .update() langsung dari
-- app (pola sama handleInlineSaveRow), TIDAK ada RPC baru utk baris.
