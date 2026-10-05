-- beehive:044 — Invoice Recap Sea & Air: catatan manual Form E (2026-10-05, permintaan user). Idempotent.
--
-- Aturan (dihitung di aplikasi, `computeRecapIssues` SeaAirRecapHelpers.ts): shipment dari China (kolom
-- `rekapan_seaair.origin`) WAJIB Form E tercentang di checklist (`dokumen_checklist_seaair.ada_form_e`).
-- Kalau tidak -> issue "Form E" (Submit to Finance terkunci) sampai user mengisi catatan manual di tab
-- Documents. Catatan disimpan di tabel BARU ini (bukan di dokumen_checklist_seaair yang ditulis n8n, bukan di
-- rekapan_seaair yang punya trigger re-audit/kunci) -- 1 baris per shipment (`seaair_id`, kunci yang SAMA
-- dgn tabel checklist/validasi Sea & Air).
--
-- RLS: baca = page_key sea_air_rekapan / sea_air_audit / sea_air_finance; tulis = has_edit_access('sea_air_rekapan').

do $$
declare
  v_type text;
begin
  if to_regclass('public.seaair_form_e_note') is not null
     and coalesce(obj_description(to_regclass('public.seaair_form_e_note'), 'pg_class'), '') not like 'beehive:044%' then
    raise exception 'STOP 044: tabel public.seaair_form_e_note sudah ada (bukan dari file 044) — cek dulu isinya.';
  end if;
  -- Tipe seaair_id ikut tabel checklist yang sudah ada (bigint / uuid / ...).
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a
   where a.attrelid = 'public.dokumen_checklist_seaair'::regclass and a.attname = 'seaair_id' and not a.attisdropped;
  if v_type is null then
    raise exception 'STOP 044: kolom dokumen_checklist_seaair.seaair_id tidak ditemukan.';
  end if;
  if to_regclass('public.seaair_form_e_note') is null then
    execute format($f$
      create table public.seaair_form_e_note (
        id          bigint generated always as identity primary key,
        seaair_id   %s not null unique,
        note        text not null check (length(btrim(note)) >= 5),
        created_by  text default auth.email(),
        created_at  timestamptz not null default now(),
        updated_by  text default auth.email(),
        updated_at  timestamptz not null default now()
      )$f$, v_type);
  end if;
end $$;

comment on table public.seaair_form_e_note is 'beehive:044 catatan manual Form E (shipment dari China tanpa Form E) — Invoice Recap Sea & Air';

alter table public.seaair_form_e_note enable row level security;
drop policy if exists seaair_form_e_note_select on public.seaair_form_e_note;
drop policy if exists seaair_form_e_note_insert on public.seaair_form_e_note;
drop policy if exists seaair_form_e_note_update on public.seaair_form_e_note;
drop policy if exists seaair_form_e_note_delete on public.seaair_form_e_note;
create policy seaair_form_e_note_select on public.seaair_form_e_note
  for select using (public.has_page_access('sea_air_rekapan') or public.has_page_access('sea_air_audit') or public.has_page_access('sea_air_finance'));
create policy seaair_form_e_note_insert on public.seaair_form_e_note
  for insert with check (public.has_edit_access('sea_air_rekapan'));
create policy seaair_form_e_note_update on public.seaair_form_e_note
  for update using (public.has_edit_access('sea_air_rekapan')) with check (public.has_edit_access('sea_air_rekapan'));
create policy seaair_form_e_note_delete on public.seaair_form_e_note
  for delete using (public.has_edit_access('sea_air_rekapan'));
revoke all on public.seaair_form_e_note from anon;
grant select, insert, update, delete on public.seaair_form_e_note to authenticated;
