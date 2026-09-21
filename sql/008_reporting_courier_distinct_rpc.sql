-- RPC utk "Overseas Cost by Courier" (2026-09) -- GANTI dropdown filter PT/PPJK/Origin yang dulu
-- fetch baris MENTAH `.limit(5000)` lalu dedup di JS (bisa diam2 tidak lengkap kalau baris
-- mentah tembus 5000 sebelum dedup) jadi `SELECT DISTINCT` di Postgres. Pola sama
-- `fn_reporting_distinct_pt` di sql/007_audit_po_distinct_and_stats_rpc.sql, tapi khusus tabel
-- `rekapan_courier` (kolom `an`/`ppjk`/`origin`) yang TIDAK ikut di-cover file itu.
create or replace function public.fn_reporting_courier_distinct(p_column text)
returns table(val text)
language plpgsql security definer stable as $$
begin
  if not public.has_page_access('reporting_cost_by_courier') then
    raise exception 'Not authorized';
  end if;
  if p_column = 'an' then
    return query select distinct trim(an) from public.rekapan_courier
      where an is not null and trim(an) <> '' order by 1;
  elsif p_column = 'ppjk' then
    return query select distinct trim(ppjk) from public.rekapan_courier
      where ppjk is not null and trim(ppjk) <> '' order by 1;
  elsif p_column = 'origin' then
    return query select distinct trim(origin) from public.rekapan_courier
      where origin is not null and trim(origin) <> '' order by 1;
  else
    raise exception 'Unknown column: %', p_column;
  end if;
end;
$$;
grant execute on function public.fn_reporting_courier_distinct(text) to authenticated;

-- Index penunjang -- `fetchCourierRows()` sekarang paginasi penuh via `.range()` + `.order('id')`
-- (GANTI dari `.limit(20000)` tunggal yang dulu diam2 memotong data, lihat
-- `ReportingCourierHelpers.ts`) filter `tgl_terima_email`/`an` + urut `id` -- WAJIB index pada
-- kolom-kolom ini supaya paginasi tetap cepat di tabel besar (tanpa index, tiap `.range()`
-- lanjutan bisa jadi sequential scan berulang).
create index if not exists idx_rekapan_courier_tgl_terima_email on public.rekapan_courier (tgl_terima_email);
create index if not exists idx_rekapan_courier_an on public.rekapan_courier (an);
