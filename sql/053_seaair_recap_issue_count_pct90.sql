-- beehive:053 — Submit to Finance Sea & Air: temuan Cost TIDAK menahan kalau % Cost Validation >= 90 (2026-10-12, keputusan user)
-- ---------------------------------------------------------------------------------------------------------------
-- Aturan di aplikasi (computeRecapIssues, SeaAirRecapHelpers.ts): Cost validation >= 90% DAN Doc validation >= 90% -> temuan
-- Cost (OVERCHARGE/UNDERCHARGE belum dikonfirmasi) & mismatch dokumen tidak lagi menahan Submit to Finance. Gerbang di DB
-- (trigger fn_seaair_recap_lock_after_submit + fn_seaair_guard_mark_audited, sql/031) memakai fn_seaair_recap_issue_count,
-- jadi fungsi itu WAJIB ikut: bagian "section cost belum dikonfirmasi" dilewati kalau % Cost >= 90.
-- % Cost = rumus computeSeaAirCostGlobalStats (SeaAirCostValidasiHelpers.ts): baris section <> 'SURVEYOR', status efektif
--   (konfirmasi MATCH -> MATCH; konfirmasi MISMATCH -> tetap OVERCHARGE/UNDERCHARGE, selain itu OVERCHARGE; tanpa konfirmasi -> status
--   baris), pct = round(MATCH / (MATCH + OVERCHARGE + UNDERCHARGE) * 100), 0 kalau belum ada yang dievaluasi.
-- Bagian Doc Validation (>= 90%) TIDAK dihitung di server (sama seperti mismatch dokumen sebelumnya: hanya gerbang aplikasi).
-- Checklist < 100% (dokumen wajib kurang) TETAP 1 issue. Form E hanya di aplikasi.
--
-- Signature & return type SAMA (uuid -> integer) -> CREATE OR REPLACE aman. SECURITY INVOKER (ikut RLS), tanpa grant baru.
-- Idempotent. Pre-check: badan fungsi live HARUS masih sama dgn sql/031 (atau sudah versi 053) -- kalau tidak, STOP.

do $$
declare
  v_src text;
  v_norm text;
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_seaair_recap_issue_count' and p.pronargs = 1;
  if v_src is null then
    raise exception 'STOP 053: fn_seaair_recap_issue_count(uuid) tidak ditemukan (sql/031 belum jalan?)';
  end if;
  v_norm := md5(regexp_replace(v_src, '\s+', '', 'g'));
  if v_norm <> '7d844f09778c16986aa6716728c9a73b' and v_src not like '%beehive:053%' then
    raise exception 'STOP 053: isi fn_seaair_recap_issue_count live BEDA dari sql/031 (md5 %). Kirim pg_get_functiondef-nya dulu, jangan ditimpa.', v_norm;
  end if;
end $$;

create or replace function public.fn_seaair_recap_issue_count(p_seaair_id uuid)
returns integer
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
-- beehive:053 (dasar: beehive:031 + pengecualian % Cost >= 90)
declare
  v_count integer := 0;
  v_pct numeric;
  v_match integer := 0;
  v_bad integer := 0;
  v_cost_pct integer := 0;
begin
  select c.pct_kelengkapan into v_pct
  from public.dokumen_checklist_seaair c
  where c.seaair_id = p_seaair_id
  order by c.created_at desc nulls last
  limit 1;
  if v_pct is not null and v_pct < 100 then
    v_count := v_count + 1;
  end if;

  -- % Cost Validation (SAMA computeSeaAirCostGlobalStats di aplikasi)
  select count(*) filter (where e.eff = 'MATCH'),
         count(*) filter (where e.eff in ('OVERCHARGE', 'UNDERCHARGE'))
    into v_match, v_bad
  from (
    select case
             when k.st = 'MATCH' then 'MATCH'
             when k.st = 'MISMATCH' then case when (x.c ->> 'status') in ('OVERCHARGE', 'UNDERCHARGE') then x.c ->> 'status' else 'OVERCHARGE' end
             else x.c ->> 'status'
           end as eff
    from public.cost_validasi_seaair cv
    cross join lateral jsonb_array_elements(coalesce(cv.checks, '[]'::jsonb)) as x(c)
    cross join lateral (
      select (select kk.status_konfirmasi from public.cost_validasi_catatan_seaair kk
              where kk.seaair_id = p_seaair_id and kk.section = (x.c ->> 'section') limit 1) as st
    ) k
    where cv.seaair_id = p_seaair_id
      and coalesce(x.c ->> 'section', '') <> 'SURVEYOR'
  ) e;
  if v_match + v_bad > 0 then
    v_cost_pct := round(v_match::numeric / (v_match + v_bad) * 100);
  end if;

  -- >= 90% -> section cost yang belum dikonfirmasi tidak menahan Submit.
  if v_cost_pct < 90 then
    select v_count + count(*) into v_count
    from (
      select upper(btrim(x.c ->> 'section')) as sec
      from public.cost_validasi_seaair cv
      cross join lateral jsonb_array_elements(coalesce(cv.checks, '[]'::jsonb)) as x(c)
      where cv.seaair_id = p_seaair_id
        and upper(btrim(x.c ->> 'section')) in ('EMKL', 'TRUCKING', 'FREIGHT_ORIGIN', 'FREIGHT_DESTINATION', 'STORAGE', 'LOLO')
        and upper(coalesce(x.c ->> 'row', '')) not in ('TOTAL', 'TOTAL KESELURUHAN')
        and (x.c ->> 'status') in ('OVERCHARGE', 'UNDERCHARGE')
      group by 1
    ) s
    where not exists (
      select 1 from public.cost_validasi_catatan_seaair k
      where k.seaair_id = p_seaair_id and upper(btrim(k.section)) = s.sec
    );
  end if;

  return v_count;
end;
$$;
comment on function public.fn_seaair_recap_issue_count(uuid) is 'beehive:053 hitung issue Invoice Recap (checklist + cost; cost dilewati kalau % Cost >= 90) untuk gerbang';
