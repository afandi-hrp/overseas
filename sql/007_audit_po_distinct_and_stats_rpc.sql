-- RPC utk Audit AP Local/Overseas, PI Local, Accounting Rekap (2026-09) -- GANTI 3 pola fetch
-- client-side yang narik SEMUA baris tanpa .limit() (dropdown filter PT, tab "Per Vendor"/
-- "Kategori" modal Dashboard) jadi agregasi di Postgres (DISTINCT/GROUP BY), supaya tetap ringan
-- walau tabelnya sudah >100rb baris. Lihat catatan analisa skala data di docs/claude/audit-po.md.

-- 1) Dropdown filter PT + seed tab "Per Vendor" modal Dashboard -- GANTI
--    `select('nama_pt'|'pt_internal')` tanpa limit + dedup di JS.
create or replace function public.fn_reporting_distinct_pt(p_table text)
returns table(pt text)
language plpgsql security definer stable as $$
begin
  if p_table = 'audit_po_ap_comp' then
    if not public.has_page_access('audit_po') then raise exception 'Not authorized'; end if;
    return query select distinct trim(nama_pt) from public.audit_po_ap_comp
      where nama_pt is not null and trim(nama_pt) <> '' order by 1;
  elsif p_table = 'audit_po_apovs_comp' then
    if not public.has_page_access('audit_po_overseas') then raise exception 'Not authorized'; end if;
    return query select distinct trim(nama_pt) from public.audit_po_apovs_comp
      where nama_pt is not null and trim(nama_pt) <> '' order by 1;
  elsif p_table = 'audit_po_pi_local_comp' then
    if not public.has_page_access('pi_local') then raise exception 'Not authorized'; end if;
    return query select distinct trim(nama_pt) from public.audit_po_pi_local_comp
      where nama_pt is not null and trim(nama_pt) <> '' order by 1;
  elsif p_table = 'accounting_rekap_finance' then
    if not public.has_page_access('accounting_rekap') then raise exception 'Not authorized'; end if;
    return query select distinct trim(pt_internal) from public.accounting_rekap_finance
      where pt_internal is not null and trim(pt_internal) <> '' order by 1;
  else
    raise exception 'Unknown table: %', p_table;
  end if;
end;
$$;
grant execute on function public.fn_reporting_distinct_pt(text) to authenticated;

-- 2) Tab "Per Vendor" modal Dashboard -- GANTI fetch semua baris (kolom nama_pt/pt_internal,
--    status terisi, dalam rentang tanggal) + hitung manual di JS, jadi GROUP BY di Postgres.
--    `p_from`/`p_to` teks 'YYYY-MM-DD' (sama format yang sudah dikirim frontend), dicocokkan
--    persis pola lama `.gte(created_at, from+'T00:00:00').lte(created_at, to+'T23:59:59')`.
create or replace function public.fn_reporting_vendor_stats(p_table text, p_from text, p_to text)
returns table(pt text, cnt bigint)
language plpgsql security definer stable as $$
begin
  if p_table = 'audit_po_ap_comp' then
    if not public.has_page_access('audit_po') then raise exception 'Not authorized'; end if;
    return query select coalesce(nullif(trim(nama_pt), ''), 'TIDAK DIKETAHUI') as pt, count(*)::bigint as cnt
      from public.audit_po_ap_comp
      where status_audit is not null
        and created_at >= (p_from || 'T00:00:00')::timestamptz and created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1;
  elsif p_table = 'audit_po_apovs_comp' then
    if not public.has_page_access('audit_po_overseas') then raise exception 'Not authorized'; end if;
    return query select coalesce(nullif(trim(nama_pt), ''), 'TIDAK DIKETAHUI') as pt, count(*)::bigint as cnt
      from public.audit_po_apovs_comp
      where status_audit is not null
        and created_at >= (p_from || 'T00:00:00')::timestamptz and created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1;
  elsif p_table = 'audit_po_pi_local_comp' then
    if not public.has_page_access('pi_local') then raise exception 'Not authorized'; end if;
    return query select coalesce(nullif(trim(nama_pt), ''), 'TIDAK DIKETAHUI') as pt, count(*)::bigint as cnt
      from public.audit_po_pi_local_comp
      where status_audit is not null
        and created_at >= (p_from || 'T00:00:00')::timestamptz and created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1;
  elsif p_table = 'accounting_rekap_finance' then
    if not public.has_page_access('accounting_rekap') then raise exception 'Not authorized'; end if;
    return query select coalesce(nullif(trim(pt_internal), ''), 'TIDAK DIKETAHUI') as pt, count(*)::bigint as cnt
      from public.accounting_rekap_finance
      where status_proses is not null
        and created_at >= (p_from || 'T00:00:00')::timestamptz and created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1;
  else
    raise exception 'Unknown table: %', p_table;
  end if;
end;
$$;
grant execute on function public.fn_reporting_vendor_stats(text, text, text) to authenticated;

-- 3) Tab "Kategori" modal Dashboard (Audit AP Local/Overseas, PI Local SAJA -- Accounting Rekap
--    TIDAK punya kolom kategori) -- GANTI fetch semua baris kolom kategori + parseKategoriMulti()
--    di JS, jadi split+GROUP BY di Postgres (`kategori` gabungan dipisah " + ", REPLIKA persis
--    `KATEGORI_MULTI_SEPARATOR`/`parseKategoriMulti()` frontend -- kalau separator itu berubah
--    di frontend, WAJIB disinkronkan ke sini juga).
-- NOTE (fix): `RETURNS TABLE(kategori text, ...)` bikin PL/pgSQL otomatis membuat variabel
-- keluaran bernama `kategori` -- referensi `kategori` polos di dalam query body jadi AMBIGU
-- (bisa merujuk ke variabel keluaran ITU, atau ke kolom tabel `kategori`), muncul sbg error
-- runtime `column reference "kategori" is ambiguous`. Fix: SEMUA referensi kolom `kategori`
-- WAJIB diberi alias tabel eksplisit (`t.kategori`, bukan `kategori` polos).
create or replace function public.fn_reporting_kategori_stats(p_table text, p_from text, p_to text)
returns table(kategori text, cnt bigint)
language plpgsql security definer stable as $$
begin
  if p_table = 'audit_po_ap_comp' then
    if not public.has_page_access('audit_po') then raise exception 'Not authorized'; end if;
    return query select trim(k) as kategori, count(*)::bigint as cnt
      from public.audit_po_ap_comp t, unnest(string_to_array(t.kategori, ' + ')) as k
      where t.kategori is not null and trim(k) <> ''
        and t.created_at >= (p_from || 'T00:00:00')::timestamptz and t.created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1 order by cnt desc;
  elsif p_table = 'audit_po_apovs_comp' then
    if not public.has_page_access('audit_po_overseas') then raise exception 'Not authorized'; end if;
    return query select trim(k) as kategori, count(*)::bigint as cnt
      from public.audit_po_apovs_comp t, unnest(string_to_array(t.kategori, ' + ')) as k
      where t.kategori is not null and trim(k) <> ''
        and t.created_at >= (p_from || 'T00:00:00')::timestamptz and t.created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1 order by cnt desc;
  elsif p_table = 'audit_po_pi_local_comp' then
    if not public.has_page_access('pi_local') then raise exception 'Not authorized'; end if;
    return query select trim(k) as kategori, count(*)::bigint as cnt
      from public.audit_po_pi_local_comp t, unnest(string_to_array(t.kategori, ' + ')) as k
      where t.kategori is not null and trim(k) <> ''
        and t.created_at >= (p_from || 'T00:00:00')::timestamptz and t.created_at <= (p_to || 'T23:59:59')::timestamptz
      group by 1 order by cnt desc;
  else
    raise exception 'Unknown table: %', p_table;
  end if;
end;
$$;
grant execute on function public.fn_reporting_kategori_stats(text, text, text) to authenticated;

-- 4) Index penunjang -- WAJIB dijalankan juga supaya search/filter (.ilike()) & agregasi di atas
--    tetap cepat di >100rb baris. B-tree biasa cukup utk .eq()/.gte()/.lte() (nama_pt/pt_internal/
--    status_audit/status_proses/created_at), TAPI .ilike('%...%') (search box, filter kategori
--    multi) butuh index trigram (pg_trgm) supaya tidak full table scan.
create extension if not exists pg_trgm;

create index if not exists idx_audit_po_ap_comp_created_at on public.audit_po_ap_comp (created_at);
create index if not exists idx_audit_po_ap_comp_nama_pt on public.audit_po_ap_comp (nama_pt);
create index if not exists idx_audit_po_ap_comp_nomor_po_trgm on public.audit_po_ap_comp using gin (nomor_po gin_trgm_ops);
create index if not exists idx_audit_po_ap_comp_vendor_name_trgm on public.audit_po_ap_comp using gin (vendor_name gin_trgm_ops);
create index if not exists idx_audit_po_ap_comp_kategori_trgm on public.audit_po_ap_comp using gin (kategori gin_trgm_ops);

create index if not exists idx_audit_po_apovs_comp_created_at on public.audit_po_apovs_comp (created_at);
create index if not exists idx_audit_po_apovs_comp_nama_pt on public.audit_po_apovs_comp (nama_pt);
create index if not exists idx_audit_po_apovs_comp_nomor_po_trgm on public.audit_po_apovs_comp using gin (nomor_po gin_trgm_ops);
create index if not exists idx_audit_po_apovs_comp_vendor_name_trgm on public.audit_po_apovs_comp using gin (vendor_name gin_trgm_ops);
create index if not exists idx_audit_po_apovs_comp_kategori_trgm on public.audit_po_apovs_comp using gin (kategori gin_trgm_ops);

create index if not exists idx_audit_po_pi_local_comp_created_at on public.audit_po_pi_local_comp (created_at);
create index if not exists idx_audit_po_pi_local_comp_nama_pt on public.audit_po_pi_local_comp (nama_pt);
create index if not exists idx_audit_po_pi_local_comp_nomor_po_trgm on public.audit_po_pi_local_comp using gin (nomor_po gin_trgm_ops);
create index if not exists idx_audit_po_pi_local_comp_vendor_name_trgm on public.audit_po_pi_local_comp using gin (vendor_name gin_trgm_ops);
create index if not exists idx_audit_po_pi_local_comp_nomor_stock_in_trgm on public.audit_po_pi_local_comp using gin (nomor_stock_in gin_trgm_ops);
create index if not exists idx_audit_po_pi_local_comp_kategori_trgm on public.audit_po_pi_local_comp using gin (kategori gin_trgm_ops);

create index if not exists idx_accounting_rekap_finance_created_at on public.accounting_rekap_finance (created_at);
create index if not exists idx_accounting_rekap_finance_pt_internal on public.accounting_rekap_finance (pt_internal);
create index if not exists idx_accounting_rekap_finance_nomor_po_trgm on public.accounting_rekap_finance using gin (nomor_po gin_trgm_ops);
create index if not exists idx_accounting_rekap_finance_vendor_trgm on public.accounting_rekap_finance using gin (vendor gin_trgm_ops);

create index if not exists idx_bunker_dokumen_updated_at on public.bunker_dokumen (updated_at);
create index if not exists idx_bunker_dokumen_no_po_trgm on public.bunker_dokumen using gin (no_po gin_trgm_ops);
create index if not exists idx_bunker_dokumen_vendor_trgm on public.bunker_dokumen using gin (vendor gin_trgm_ops);
create index if not exists idx_bunker_dokumen_kapal_trgm on public.bunker_dokumen using gin (kapal gin_trgm_ops);
