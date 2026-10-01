-- ============================================================================
-- 031 -- Relasi Audit PIB <-> Invoice Recap Sea & Air ("bagian 2") -- 2026-10-01
-- AMAN DIJALANKAN ULANG (idempotent). Jalankan SEKALI SEMUA di Supabase SQL Editor.
--
-- Isi (semua otomatisasi di DB, n8n hanya menulis hasil baca AI):
--   A. Cek pengaman: STOP kalau nama fungsi sudah dipakai fungsi lain (bukan dari file ini).
--   B. Kolom baru (rekapan_seaair & tabel_audit_seaair).
--   C. fn_seaair_recap_issue_count  -- hitung issue Invoice Recap (checklist + cost) di server.
--   D. Gerbang "Mark as audited"   -- PIB hanya boleh Audited kalau issue Invoice Recap = 0.
--   E. Kunci Submit to Finance     -- submit hanya kalau issue = 0; setelah submit baris Recap
--                                     terkunci (edit/hapus ditolak) sampai Admin unlock.
--   F. RPC fn_seaair_unlock_submit -- HANYA Admin, wajib alasan, tercatat di audit_trail.
--   G. Re-audit otomatis           -- Recap diedit user -> PIB Audited kembali Draft + alasan.
--   H. Snapshot nilai AI           -- setiap tulisan AI (n8n/service) disimpan utuh di
--                                     tabel_audit_seaair.ai_snapshot; RPC fn_seaair_reread_from_ai
--                                     mengembalikan nilai PIB ke hasil AI (Draft saja).
--   I. Indikasi duplikat upload    -- baris baru dgn AWB yg sudah ada -> duplicate_of terisi.
--   J. Konfirmasi HANYA Admin      -- review Cost Validation, ubah angka Cost Validation, dan
--                                     accept/mismatch Doc Validation ditolak kalau bukan Admin.
--
-- Pembeda user vs AI: `auth.email() IS NULL` = tulisan service role (n8n) / SQL Editor -> TIDAK
-- dijaga (sama pola trigger audit lama fn_audit_seaair/fn_audit_rekapan_seaair).
-- Keterbatasan diketahui: hasil Doc Validation (mismatch dokumen) TIDAK ikut dihitung di server
-- (perbandingan "relaxed"/fuzzy hanya ada di aplikasi) -- gerbang Doc Validation dijaga aplikasi.
-- ============================================================================

-- ── A. Cek pengaman nama fungsi ─────────────────────────────────────────────
do $$
declare v_conflict text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array[
      'fn_seaair_recap_issue_count', 'fn_seaair_guard_mark_audited', 'fn_seaair_recap_lock_after_submit',
      'fn_seaair_unlock_submit', 'fn_seaair_reaudit_on_recap_change', 'fn_seaair_snapshot_ai_values',
      'fn_seaair_reread_from_ai', 'fn_seaair_flag_duplicate_upload', 'fn_seaair_validation_admin_only'])
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:031%';
  if v_conflict is not null then
    raise exception 'STOP 031: nama fungsi sudah dipakai fungsi lain (bukan dari file 031): %', v_conflict;
  end if;
end $$;

-- ── B. Kolom baru ───────────────────────────────────────────────────────────
alter table public.rekapan_seaair
  add column if not exists po_manual jsonb not null default '{}'::jsonb,   -- per PO: kg/valas/partial (diisi user, tidak disentuh AI)
  add column if not exists duplicate_of uuid,                             -- indikasi upload ganda (AWB sama)
  add column if not exists submit_unlock_reason text,                     -- unlock terakhir (Admin)
  add column if not exists submit_unlocked_by text,
  add column if not exists submit_unlocked_at timestamptz;

alter table public.tabel_audit_seaair
  add column if not exists reaudit_reason text,                           -- "Changed in Invoice Recap: ..."
  add column if not exists reaudit_at timestamptz,
  add column if not exists ai_snapshot jsonb,                             -- salinan utuh tulisan AI terakhir
  add column if not exists ai_snapshot_at timestamptz,
  add column if not exists duplicate_of uuid;

-- ── C. Hitung issue Invoice Recap (server) ─────────────────────────────────
-- SAMA aturan computeRecapIssues (SeaAirRecapHelpers.ts) bagian checklist + cost:
--  * checklist pct_kelengkapan < 100  -> 1 issue
--  * tiap section Cost (EMKL/TRUCKING/FREIGHT_ORIGIN/FREIGHT_DESTINATION/STORAGE/LOLO) yg punya
--    baris OVERCHARGE/UNDERCHARGE (bukan TOTAL) & BELUM ada baris cost_validasi_catatan_seaair -> 1 issue
create or replace function public.fn_seaair_recap_issue_count(p_seaair_id uuid)
returns integer
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer := 0;
  v_pct numeric;
begin
  select c.pct_kelengkapan into v_pct
  from public.dokumen_checklist_seaair c
  where c.seaair_id = p_seaair_id
  order by c.created_at desc nulls last
  limit 1;
  if v_pct is not null and v_pct < 100 then
    v_count := v_count + 1;
  end if;

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

  return v_count;
end;
$$;
comment on function public.fn_seaair_recap_issue_count(uuid) is 'beehive:031 hitung issue Invoice Recap (checklist + cost) untuk gerbang';
revoke all on function public.fn_seaair_recap_issue_count(uuid) from public, anon;
grant execute on function public.fn_seaair_recap_issue_count(uuid) to authenticated;

-- ── D. Gerbang "Mark as audited" ────────────────────────────────────────────
create or replace function public.fn_seaair_guard_mark_audited()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_issues integer;
begin
  if auth.email() is null then return new; end if;                 -- AI / service / SQL Editor
  if coalesce(new.status, '') = 'ARCHIVED' then return new; end if;  -- Draft selalu boleh
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  if not exists (select 1 from public.rekapan_seaair r where r.seaair_id = new.id) then
    raise exception 'Cannot mark as audited: this PIB is not linked to an Invoice Recap shipment.';
  end if;
  v_issues := public.fn_seaair_recap_issue_count(new.id);
  if v_issues > 0 then
    raise exception 'Cannot mark as audited: % open issue(s) in Invoice Recap must be confirmed by Admin first.', v_issues;
  end if;

  new.reaudit_reason := null;
  new.reaudit_at := null;
  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('tabel_audit_seaair', 'UPDATE', new.awb, new.no_pib, 'SEAAIR-PIB', auth.email(),
    'Status PIB — Lama: ' || case when tg_op = 'UPDATE' then coalesce(old.status, '-') else '-' end
      || ' → Baru: Audited (' || coalesce(new.status, '-') || ')');
  return new;
end;
$$;
comment on function public.fn_seaair_guard_mark_audited() is 'beehive:031 gerbang Mark as audited';
revoke all on function public.fn_seaair_guard_mark_audited() from public, anon;

drop trigger if exists trg_seaair_guard_mark_audited on public.tabel_audit_seaair;
create trigger trg_seaair_guard_mark_audited
  before insert or update of status on public.tabel_audit_seaair
  for each row execute function public.fn_seaair_guard_mark_audited();

-- ── E. Kunci Submit to Finance ──────────────────────────────────────────────
create or replace function public.fn_seaair_recap_lock_after_submit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_issues integer;
begin
  if auth.email() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- Unlock resmi lewat RPC fn_seaair_unlock_submit (flag transaksi lokal).
  if coalesce(current_setting('app.seaair_unlock', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if old.tgl_submit_finance is not null then
    raise exception 'Locked — already submitted to Finance (%). Ask an Admin to unlock it first.', old.tgl_submit_finance;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.tgl_submit_finance is not null then
    if new.seaair_id is null then
      raise exception 'Cannot submit to Finance: this shipment is not linked to an Audit PIB record.';
    end if;
    v_issues := public.fn_seaair_recap_issue_count(new.seaair_id);
    if v_issues > 0 then
      raise exception 'Cannot submit to Finance: % open issue(s) must be confirmed by Admin first.', v_issues;
    end if;
    insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
    values ('rekapan_seaair', 'UPDATE', new.awb, new.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(new.shipment_type, ''),
      auth.email(), 'Submit to Finance — Lama: - → Baru: ' || new.tgl_submit_finance::text);
  end if;
  return new;
end;
$$;
comment on function public.fn_seaair_recap_lock_after_submit() is 'beehive:031 kunci Invoice Recap setelah Submit to Finance';
revoke all on function public.fn_seaair_recap_lock_after_submit() from public, anon;

drop trigger if exists trg_seaair_recap_lock on public.rekapan_seaair;
create trigger trg_seaair_recap_lock
  before update or delete on public.rekapan_seaair
  for each row execute function public.fn_seaair_recap_lock_after_submit();

-- ── F. RPC buka kunci (Admin) ───────────────────────────────────────────────
create or replace function public.fn_seaair_unlock_submit(p_rekapan_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can unlock a shipment submitted to Finance.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Unlock reason is required (min. 5 characters).';
  end if;
  select * into r from public.rekapan_seaair where id = p_rekapan_id for update;
  if not found then
    raise exception 'Shipment not found: %', p_rekapan_id;
  end if;
  if r.tgl_submit_finance is null then
    raise exception 'This shipment is not locked (not submitted to Finance).';
  end if;

  perform set_config('app.seaair_unlock', 'on', true);
  update public.rekapan_seaair
     set tgl_submit_finance = null,
         submit_unlock_reason = btrim(p_reason),
         submit_unlocked_by = auth.email(),
         submit_unlocked_at = now()
   where id = p_rekapan_id;
  perform set_config('app.seaair_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_seaair', 'UPDATE', r.awb, r.no_invoice, 'SEAAIR-REKAPAN - ' || coalesce(r.shipment_type, ''),
    auth.email(), 'Submit to Finance (unlock) — Lama: ' || r.tgl_submit_finance::text || ' → Baru: unlocked · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_unlock_submit(uuid, text) is 'beehive:031 RPC unlock Submit to Finance (Admin)';
revoke all on function public.fn_seaair_unlock_submit(uuid, text) from public, anon;
grant execute on function public.fn_seaair_unlock_submit(uuid, text) to authenticated;

-- ── G. Re-audit otomatis ────────────────────────────────────────────────────
create or replace function public.fn_seaair_reaudit_on_recap_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_changed text;
  v_rows integer;
begin
  if auth.email() is null or new.seaair_id is null then return new; end if;
  select string_agg(n.key, ', ' order by n.key) into v_changed
  from jsonb_each(to_jsonb(new)) as n(key, value)
  where n.key not in ('tgl_submit_finance', 'submit_unlock_reason', 'submit_unlocked_by', 'submit_unlocked_at', 'duplicate_of')
    and n.value is distinct from (to_jsonb(old) -> n.key);
  if v_changed is null then return new; end if;

  update public.tabel_audit_seaair
     set status = 'ARCHIVED',
         reaudit_reason = 'Changed in Invoice Recap: ' || v_changed,
         reaudit_at = now()
   where id = new.seaair_id and status is distinct from 'ARCHIVED';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
    values ('tabel_audit_seaair', 'UPDATE', new.awb, null, 'SEAAIR-PIB', auth.email(),
      'Status PIB — Lama: Audited → Baru: Draft (re-audit, changed in Invoice Recap: ' || v_changed || ')');
  end if;
  return new;
end;
$$;
comment on function public.fn_seaair_reaudit_on_recap_change() is 'beehive:031 re-audit PIB saat Invoice Recap diedit';
revoke all on function public.fn_seaair_reaudit_on_recap_change() from public, anon;

drop trigger if exists trg_seaair_reaudit on public.rekapan_seaair;
create trigger trg_seaair_reaudit
  after update on public.rekapan_seaair
  for each row execute function public.fn_seaair_reaudit_on_recap_change();

-- ── H. Snapshot nilai AI + Re-read ─────────────────────────────────────────
create or replace function public.fn_seaair_snapshot_ai_values()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.email() is null then
    -- Tulisan AI / service: simpan salinan utuh kolom data (tanpa kolom sistem).
    new.ai_snapshot := to_jsonb(new) - array['ai_snapshot', 'ai_snapshot_at', 'status', 'reaudit_reason',
      'reaudit_at', 'duplicate_of', 'id', 'created_at'];
    new.ai_snapshot_at := now();
  elsif tg_op = 'UPDATE' then
    -- User tidak boleh mengubah snapshot.
    new.ai_snapshot := old.ai_snapshot;
    new.ai_snapshot_at := old.ai_snapshot_at;
  else
    -- Input manual user (Add manually): tidak ada hasil AI.
    new.ai_snapshot := null;
    new.ai_snapshot_at := null;
  end if;
  return new;
end;
$$;
comment on function public.fn_seaair_snapshot_ai_values() is 'beehive:031 simpan nilai asli bacaan AI';
revoke all on function public.fn_seaair_snapshot_ai_values() from public, anon;

drop trigger if exists trg_seaair_snapshot_ai on public.tabel_audit_seaair;
create trigger trg_seaair_snapshot_ai
  before insert or update on public.tabel_audit_seaair
  for each row execute function public.fn_seaair_snapshot_ai_values();

create or replace function public.fn_seaair_reread_from_ai(p_seaair_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  k text;
  v_sets text[] := '{}';
  -- SAMA whitelist update_seaair_row, TANPA status & notes (catatan user tidak ditimpa).
  allowed text[] := array[
    'no_aju','no_pib','jenis_dokumen','po_ori','vendor','impor_an','remarks',
    'po_harga_detail','kurs','item_price','other_cost','item_price_idr',
    'vendor_inv_no','valas_dpp','kurs_ndpbm','total_nilai_pabean','bm',
    'total_nilai_pabean_bm','ppn_nilai','ppn_pct','pph_nilai','pph_pct',
    'hs_code','asuransi','balance','total_pib','total_inv_freight','via',
    'delivery_term','awb','no_master_bl','vessel_voyage','port_loading',
    'port_discharge','container_count','container_no','no_sptnp','tgl_sptnp',
    'sptnp_total','tgl_ppjk','cbm','insurance'];
begin
  if not public.has_edit_access('sea_air_audit') then
    raise exception 'Akses ditolak: Anda tidak punya izin edit untuk Audit Sea & Air.';
  end if;
  select * into r from public.tabel_audit_seaair where id = p_seaair_id for update;
  if not found then
    raise exception 'PIB not found: %', p_seaair_id;
  end if;
  if coalesce(r.status, '') <> 'ARCHIVED' then
    raise exception 'Re-read is only allowed on a Draft PIB (reopen it as draft first).';
  end if;
  if r.ai_snapshot is null then
    raise exception 'No AI-read values stored for this PIB yet.';
  end if;

  foreach k in array allowed loop
    if r.ai_snapshot ? k then
      v_sets := array_append(v_sets, format('%I = %L', k, r.ai_snapshot ->> k));
    end if;
  end loop;
  if array_length(v_sets, 1) is null then
    raise exception 'The stored AI values are empty.';
  end if;

  execute format('update public.tabel_audit_seaair set %s where id = %L', array_to_string(v_sets, ', '), p_seaair_id);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('tabel_audit_seaair', 'UPDATE', r.awb, r.no_pib, 'SEAAIR-PIB', auth.email(),
    'Re-read from AI — Lama: edited values → Baru: AI values (' || to_char(r.ai_snapshot_at at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI') || ')');
  return json_build_object('ok', true);
end;
$$;
comment on function public.fn_seaair_reread_from_ai(uuid) is 'beehive:031 RPC Re-read nilai PIB dari snapshot AI';
revoke all on function public.fn_seaair_reread_from_ai(uuid) from public, anon;
grant execute on function public.fn_seaair_reread_from_ai(uuid) to authenticated;

-- ── I. Indikasi duplikat upload ─────────────────────────────────────────────
create or replace function public.fn_seaair_flag_duplicate_upload()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_dup uuid;
begin
  if coalesce(btrim(new.awb), '') = '' then return new; end if;
  if tg_table_name = 'rekapan_seaair' then
    select r.id into v_dup from public.rekapan_seaair r
    where upper(btrim(r.awb)) = upper(btrim(new.awb)) and r.id <> new.id
    order by r.created_at limit 1;
  else
    select a.id into v_dup from public.tabel_audit_seaair a
    where upper(btrim(a.awb)) = upper(btrim(new.awb)) and a.id <> new.id
    order by a.created_at limit 1;
  end if;
  new.duplicate_of := v_dup;
  return new;
end;
$$;
comment on function public.fn_seaair_flag_duplicate_upload() is 'beehive:031 tandai upload ganda (AWB sama)';
revoke all on function public.fn_seaair_flag_duplicate_upload() from public, anon;

drop trigger if exists trg_seaair_flag_duplicate on public.rekapan_seaair;
create trigger trg_seaair_flag_duplicate
  before insert on public.rekapan_seaair
  for each row execute function public.fn_seaair_flag_duplicate_upload();
drop trigger if exists trg_seaair_flag_duplicate on public.tabel_audit_seaair;
create trigger trg_seaair_flag_duplicate
  before insert on public.tabel_audit_seaair
  for each row execute function public.fn_seaair_flag_duplicate_upload();

-- ── J. Konfirmasi validasi HANYA Admin ──────────────────────────────────────
-- * cost_validasi_catatan_seaair (review Accept difference / Ask vendor): semua tulis -> Admin.
-- * cost_validasi_seaair: ubah isi `checks` (angka Expected/Actual) -> Admin.
-- * dokumen_validasi_matriks_seaair: check yg `manual`=true & (`match` berubah, baru jadi manual,
--   atau nilai `values` dikoreksi) -> Admin. Simpan Duty / hasil evaluasi otomatis tetap boleh.
create or replace function public.fn_seaair_validation_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer;
  v_awb text;
  v_txt text;
begin
  if auth.email() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'cost_validasi_catatan_seaair' then
    if not public.is_admin() then
      raise exception 'Only an Admin can review (confirm) cost validation findings.';
    end if;
    select r.awb into v_awb from public.rekapan_seaair r where r.seaair_id = coalesce(new.seaair_id, old.seaair_id) limit 1;
    v_txt := 'Cost review ' || coalesce(new.section, old.section) || ' — Lama: '
      || case when tg_op = 'INSERT' then '-' else coalesce(old.status_konfirmasi, '-') end
      || ' → Baru: ' || case when tg_op = 'DELETE' then 'review removed'
           else coalesce(new.status_konfirmasi, '-') || coalesce(' · ' || nullif(btrim(new.catatan), ''), '') end;
    insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
    values ('rekapan_seaair', 'UPDATE', v_awb, null, 'SEAAIR-COST-REVIEW', auth.email(), v_txt);
    if tg_op = 'DELETE' then return old; end if;
    return new;

  elsif tg_table_name = 'cost_validasi_seaair' then
    if tg_op = 'UPDATE' and new.checks is distinct from old.checks and not public.is_admin() then
      raise exception 'Only an Admin can change cost validation amounts.';
    end if;
    return new;

  elsif tg_table_name = 'dokumen_validasi_matriks_seaair' then
    if tg_op <> 'UPDATE' then return new; end if;
    select count(*) into v_count
    from jsonb_array_elements(coalesce(new.checks, '[]'::jsonb)) as n(c)
    left join lateral (
      select o.c as oc
      from jsonb_array_elements(coalesce(old.checks, '[]'::jsonb)) as o(c)
      where (o.c ->> 'section') is not distinct from (n.c ->> 'section')
        and (o.c ->> 'row') is not distinct from (n.c ->> 'row')
        and (o.c ->> 'col') is not distinct from (n.c ->> 'col')
      limit 1
    ) prev on true
    where coalesce((n.c ->> 'manual')::boolean, false)
      and (
        coalesce(n.c -> 'match', 'null'::jsonb) is distinct from coalesce(prev.oc -> 'match', 'null'::jsonb)
        -- koreksi nilai ("Correct") juga menandai manual=true -> mismatch dianggap sudah ditinjau,
        -- jadi ikut Admin-only (kalau tidak, non-Admin bisa "menutup" mismatch lewat koreksi nilai).
        or not coalesce((prev.oc ->> 'manual')::boolean, false)
        or coalesce(n.c -> 'values', 'null'::jsonb) is distinct from coalesce(prev.oc -> 'values', 'null'::jsonb)
      );
    if v_count > 0 then
      if not public.is_admin() then
        raise exception 'Only an Admin can confirm document validation results (% field(s)).', v_count;
      end if;
      insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
      values ('dokumen_validasi_matriks_seaair', 'UPDATE', new.awb, null, 'SEAAIR-DOC-CONFIRM', auth.email(),
        'Doc validation — Lama: AI result → Baru: ' || v_count || ' field(s) confirmed manually');
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
comment on function public.fn_seaair_validation_admin_only() is 'beehive:031 konfirmasi validasi Sea & Air hanya Admin';
revoke all on function public.fn_seaair_validation_admin_only() from public, anon;

drop trigger if exists trg_seaair_validation_admin_only on public.cost_validasi_catatan_seaair;
create trigger trg_seaair_validation_admin_only
  before insert or update or delete on public.cost_validasi_catatan_seaair
  for each row execute function public.fn_seaair_validation_admin_only();
drop trigger if exists trg_seaair_validation_admin_only on public.cost_validasi_seaair;
create trigger trg_seaair_validation_admin_only
  before update on public.cost_validasi_seaair
  for each row execute function public.fn_seaair_validation_admin_only();
drop trigger if exists trg_seaair_validation_admin_only on public.dokumen_validasi_matriks_seaair;
create trigger trg_seaair_validation_admin_only
  before update on public.dokumen_validasi_matriks_seaair
  for each row execute function public.fn_seaair_validation_admin_only();

-- Selesai. Cek cepat:
-- select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_seaair_%' order by 2, 1;
