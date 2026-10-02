-- 038 -- Review cost per invoice Audit Courier + kunci Submit to Finance Invoice Recap Courier (2026-10-02)
-- Keputusan user:
--   * Audit Courier tab Costs: review per invoice (Freight / Duty) "Accept difference" (= MATCH, invoice
--     dihitung sesuai) / "Ask vendor to revise" (= MISMATCH, catatan WAJIB) -- pola cost_validasi_catatan_seaair.
--     Hak = has_edit_access('courier_cost_validation'); "hanya selama Draft" ditegakkan di aplikasi (sama tabel
--     validasi Courier lain).
--   * Invoice Recap Courier: setelah Submit to Finance baris invoice TERKUNCI (sama Sea & Air) -- UPDATE/DELETE
--     ditolak kecuali kolom Finance / urutan; hanya Admin bisa Unlock (alasan min. 5 karakter, ditolak kalau
--     Finance sudah menerima), tercatat di audit_trail. Submit tetap TANPA syarat (keputusan user).
-- Idempotent. Pre-check membatalkan kalau ada fungsi/tabel bernama sama yang BUKAN buatan file ini.
-- Penulis service (n8n / SQL Editor, auth.email() IS NULL) TIDAK dikunci.

-- ── 0. Pre-check nama ───────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.proname, obj_description(p.oid, 'pg_proc') as c
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('fn_courier_recap_lock', 'fn_courier_unlock_submit')
  loop
    if coalesce(r.c, '') not like 'beehive:038%' then
      raise exception 'Fungsi % sudah ada & bukan dari sql/038 -- hentikan, konsultasikan dulu.', r.proname;
    end if;
  end loop;
  if to_regclass('public.cost_validasi_review_courier') is not null
     and coalesce(obj_description(to_regclass('public.cost_validasi_review_courier'), 'pg_class'), '') not like 'beehive:038%' then
    raise exception 'Tabel cost_validasi_review_courier sudah ada & bukan dari sql/038 -- hentikan, konsultasikan dulu.';
  end if;
end $$;

-- ── A. Review cost per invoice (Audit Courier) ──────────────────────────────────────────────────
create table if not exists public.cost_validasi_review_courier (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('PIB', 'CN')),
  audit_id text not null,                       -- id baris tabel_audit_pib / tabel_audit_cn (teks)
  section text not null check (section in ('FREIGHT', 'DUTY')),
  status_konfirmasi text not null check (status_konfirmasi in ('MATCH', 'MISMATCH')),
  catatan text,
  dikonfirmasi_oleh text,
  dikonfirmasi_at timestamptz not null default now(),
  constraint ck_cost_review_courier_note check (status_konfirmasi = 'MATCH' or nullif(btrim(coalesce(catatan, '')), '') is not null)
);
comment on table public.cost_validasi_review_courier is 'beehive:038 review cost per invoice Audit Courier (Accept difference / Ask vendor)';
create unique index if not exists uq_cost_review_courier on public.cost_validasi_review_courier (doc_type, audit_id, section);
alter table public.cost_validasi_review_courier enable row level security;
drop policy if exists cost_review_courier_select on public.cost_validasi_review_courier;
create policy cost_review_courier_select on public.cost_validasi_review_courier for select
  using (public.has_page_access('courier_cost_validation'));
drop policy if exists cost_review_courier_insert on public.cost_validasi_review_courier;
create policy cost_review_courier_insert on public.cost_validasi_review_courier for insert
  with check (public.has_edit_access('courier_cost_validation'));
drop policy if exists cost_review_courier_update on public.cost_validasi_review_courier;
create policy cost_review_courier_update on public.cost_validasi_review_courier for update
  using (public.has_edit_access('courier_cost_validation')) with check (public.has_edit_access('courier_cost_validation'));
drop policy if exists cost_review_courier_delete on public.cost_validasi_review_courier;
create policy cost_review_courier_delete on public.cost_validasi_review_courier for delete
  using (public.has_edit_access('courier_cost_validation'));
revoke all on table public.cost_validasi_review_courier from anon;
grant select, insert, update, delete on table public.cost_validasi_review_courier to authenticated;

-- ── B. Kolom unlock (Invoice Recap Courier) ─────────────────────────────────────────────────────
alter table public.rekapan_courier add column if not exists submit_unlock_reason text;
alter table public.rekapan_courier add column if not exists submit_unlocked_by text;
alter table public.rekapan_courier add column if not exists submit_unlocked_at timestamptz;

-- ── C. Kunci setelah Submit to Finance ──────────────────────────────────────────────────────────
-- Baris yang SUDAH punya submit_date: DELETE ditolak; UPDATE hanya boleh mengubah kolom Finance / urutan
-- (dipakai RPC fn_courier_finance_* & drag Reorder). Submit baru dicatat ke audit_trail format app.
create or replace function public.fn_courier_recap_lock()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_free text[] := array['sort_order', 'updated_at', 'finance_received_at', 'finance_received_by', 'tgl_lunas',
                         'paid_reference', 'paid_by', 'submit_unlock_reason', 'submit_unlocked_by', 'submit_unlocked_at'];
begin
  if auth.email() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if coalesce(current_setting('app.courier_unlock', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if old.submit_date is not null then
    if tg_op = 'DELETE' then
      raise exception 'Locked — invoice % was submitted to Finance (%). Ask an Admin to unlock it first.', coalesce(old.no_invoice, ''), old.submit_date;
    end if;
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'Locked — invoice % was submitted to Finance (%). Ask an Admin to unlock it first.', coalesce(old.no_invoice, ''), old.submit_date;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.submit_date is not null then
    insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
    values ('rekapan_courier', 'UPDATE', new.awb, new.no_invoice, 'COURIER-REKAPAN - ' || coalesce(new.invoice_type, ''),
      auth.email(), 'Submit to Finance — Lama: - → Baru: ' || new.submit_date::text);
  end if;
  return new;
end $$;
comment on function public.fn_courier_recap_lock() is 'beehive:038 kunci Invoice Recap Courier setelah Submit to Finance';
revoke all on function public.fn_courier_recap_lock() from public, anon;

drop trigger if exists trg_courier_recap_lock on public.rekapan_courier;
create trigger trg_courier_recap_lock
  before update or delete on public.rekapan_courier
  for each row execute function public.fn_courier_recap_lock();

-- ── D. Unlock (Admin) ───────────────────────────────────────────────────────────────────────────
create or replace function public.fn_courier_unlock_submit(p_id uuid, p_reason text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare r record;
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can unlock an invoice submitted to Finance.';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Unlock reason is required (min. 5 characters).';
  end if;
  select * into r from public.rekapan_courier where id = p_id for update;
  if not found then raise exception 'Invoice not found: %', p_id; end if;
  if r.submit_date is null then raise exception 'This invoice is not locked (not submitted to Finance).'; end if;
  if r.finance_received_at is not null then
    raise exception 'Finance has already received this invoice — it cannot be unlocked.';
  end if;

  perform set_config('app.courier_unlock', 'on', true);
  update public.rekapan_courier
     set submit_date = null, submit_unlock_reason = btrim(p_reason), submit_unlocked_by = auth.email(), submit_unlocked_at = now()
   where id = p_id;
  perform set_config('app.courier_unlock', 'off', true);

  insert into public.audit_trail (tabel, action, awb, no_dokumen, jenis, user_email, catatan)
  values ('rekapan_courier', 'UPDATE', r.awb, r.no_invoice, 'COURIER-REKAPAN - ' || coalesce(r.invoice_type, ''),
    auth.email(), 'Submit to Finance (unlock) — Lama: ' || r.submit_date::text || ' → Baru: unlocked · reason: ' || btrim(p_reason));
  return json_build_object('ok', true);
end $$;
comment on function public.fn_courier_unlock_submit(uuid, text) is 'beehive:038 RPC unlock Submit to Finance Invoice Recap Courier (Admin)';
revoke all on function public.fn_courier_unlock_submit(uuid, text) from public, anon;
grant execute on function public.fn_courier_unlock_submit(uuid, text) to authenticated;
