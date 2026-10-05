-- beehive:041 — Invoice Recap Courier: panel Validation samping (2026-10-05, keputusan user)
-- 1. Riwayat dokumen Checklist Courier ("Document review"): tabel `courier_checklist_doc_log` + trigger
--    `trg_courier_checklist_doc_log` di `dokumen_checklist` -> mencatat tanggal & oleh siapa tiap kolom `ada_*`
--    berubah jadi tercentang (ADDED) atau dilepas (REMOVED). Hanya berlaku ke depan (data lama tanpa riwayat).
--    Ditulis HANYA oleh trigger (SECURITY DEFINER); user cuma bisa membaca (append-only).
--    Penulis service (n8n, auth.email() NULL) TETAP dicatat -> changed_by NULL = "n8n (upload)" di aplikasi.
-- 2. Accept cost PER BARIS (opsi B): tabel `cost_validasi_review_courier_item` -- 1 baris = 1 baris biaya
--    (freight, fuel, ..., total_freight) yang di-Accept + catatan WAJIB + snapshot nilai Expected/Actual saat
--    di-Accept. Kalau nilainya berubah sesudahnya (mis. upload susulan), Accept tidak berlaku lagi & baris muncul
--    lagi di ringkasan. Review per invoice lama (sql/038 `cost_validasi_review_courier`) TETAP berlaku.
-- Idempotent (aman dijalankan ulang). Pre-check: batal kalau ada objek bernama sama TANPA komentar beehive:041.
-- Sebelum menjalankan: pastikan trigger `dokumen_checklist` yang ada hanya `trg_hitung_kelengkapan` (dicek user
-- 2026-10-05) -- trigger baru ini AFTER, tidak mengubah baris, jadi tidak mengganggu hitung kelengkapan (BEFORE).

do $$
declare r record;
begin
  for r in
    select p.proname as nama, coalesce(obj_description(p.oid, 'pg_proc'), '') as ket
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('fn_courier_checklist_doc_log')
  loop
    if r.ket not like 'beehive:041%' then
      raise exception 'Fungsi % sudah ada dan BUKAN dari beehive:041 -- batalkan & cek dulu.', r.nama;
    end if;
  end loop;
  for r in
    select c.relname as nama, coalesce(obj_description(c.oid, 'pg_class'), '') as ket
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('courier_checklist_doc_log', 'cost_validasi_review_courier_item')
  loop
    if r.ket not like 'beehive:041%' then
      raise exception 'Tabel % sudah ada dan BUKAN dari beehive:041 -- batalkan & cek dulu.', r.nama;
    end if;
  end loop;
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.dokumen_checklist'::regclass and not t.tgisinternal
      and t.tgname = 'trg_courier_checklist_doc_log'
      and t.tgfoid <> coalesce((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname = 'fn_courier_checklist_doc_log' limit 1), 0)
  ) then
    raise exception 'Trigger trg_courier_checklist_doc_log sudah ada dengan fungsi lain -- batalkan & cek dulu.';
  end if;
end $$;

-- ─── 1. Riwayat dokumen Checklist ────────────────────────────────────────────
create table if not exists public.courier_checklist_doc_log (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid,
  pib_id uuid,
  cn_id uuid,
  awb text,
  doc_key text not null,
  action text not null check (action in ('ADDED', 'REMOVED')),
  changed_by text,
  changed_by_email text,
  created_at timestamptz not null default now()
);
comment on table public.courier_checklist_doc_log is 'beehive:041 riwayat centang dokumen Checklist Courier (ditulis trigger trg_courier_checklist_doc_log)';
create index if not exists courier_checklist_doc_log_pib_idx on public.courier_checklist_doc_log (pib_id, created_at);
create index if not exists courier_checklist_doc_log_cn_idx on public.courier_checklist_doc_log (cn_id, created_at);

alter table public.courier_checklist_doc_log enable row level security;
drop policy if exists courier_checklist_doc_log_select on public.courier_checklist_doc_log;
drop policy if exists courier_checklist_doc_log_insert on public.courier_checklist_doc_log;
drop policy if exists courier_checklist_doc_log_update on public.courier_checklist_doc_log;
drop policy if exists courier_checklist_doc_log_delete on public.courier_checklist_doc_log;
create policy courier_checklist_doc_log_select on public.courier_checklist_doc_log
  for select using (public.has_page_access('courier_checklist_dokumen') or public.has_page_access('courier_finance'));
-- Append-only: hanya trigger (SECURITY DEFINER) yang menulis.
create policy courier_checklist_doc_log_insert on public.courier_checklist_doc_log for insert with check (false);
create policy courier_checklist_doc_log_update on public.courier_checklist_doc_log for update using (false) with check (false);
create policy courier_checklist_doc_log_delete on public.courier_checklist_doc_log for delete using (false);
revoke all on public.courier_checklist_doc_log from anon;
grant select on public.courier_checklist_doc_log to authenticated;

create or replace function public.fn_courier_checklist_doc_log()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_key text;
  v_now boolean;
  v_was boolean;
  v_email text := auth.email();
  v_name text;
begin
  if v_email is not null then
    select nullif(btrim(p.nama), '') into v_name from public.profiles p where p.id = auth.uid();
  end if;
  for v_key in select k from jsonb_object_keys(v_new) as k where k like 'ada\_%' order by k loop
    v_now := coalesce((v_new ->> v_key)::boolean, false);
    v_was := coalesce((v_old ->> v_key)::boolean, false);
    if v_now and not v_was then
      insert into public.courier_checklist_doc_log (checklist_id, pib_id, cn_id, awb, doc_key, action, changed_by, changed_by_email)
      values (new.id, new.pib_id, new.cn_id, new.awb, v_key, 'ADDED', coalesce(v_name, v_email), v_email);
    elsif v_was and not v_now then
      insert into public.courier_checklist_doc_log (checklist_id, pib_id, cn_id, awb, doc_key, action, changed_by, changed_by_email)
      values (new.id, new.pib_id, new.cn_id, new.awb, v_key, 'REMOVED', coalesce(v_name, v_email), v_email);
    end if;
  end loop;
  return null;
end;
$$;
comment on function public.fn_courier_checklist_doc_log() is 'beehive:041 trigger riwayat centang dokumen Checklist Courier';
revoke execute on function public.fn_courier_checklist_doc_log() from public, anon;

drop trigger if exists trg_courier_checklist_doc_log on public.dokumen_checklist;
create trigger trg_courier_checklist_doc_log
  after insert or update on public.dokumen_checklist
  for each row execute function public.fn_courier_checklist_doc_log();

-- ─── 2. Accept cost per baris ────────────────────────────────────────────────
create table if not exists public.cost_validasi_review_courier_item (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('PIB', 'CN')),
  audit_id text not null,
  item_key text not null,
  section text not null check (section in ('FREIGHT', 'DUTY')),
  status_konfirmasi text not null default 'MATCH' check (status_konfirmasi in ('MATCH', 'MISMATCH')),
  catatan text not null check (length(btrim(catatan)) > 0),
  nilai_expected numeric,
  nilai_actual numeric,
  dikonfirmasi_oleh text,
  dikonfirmasi_at timestamptz not null default now(),
  unique (doc_type, audit_id, item_key)
);
comment on table public.cost_validasi_review_courier_item is 'beehive:041 Accept cost per baris (catatan wajib + snapshot nilai)';

alter table public.cost_validasi_review_courier_item enable row level security;
drop policy if exists cost_validasi_review_courier_item_select on public.cost_validasi_review_courier_item;
drop policy if exists cost_validasi_review_courier_item_insert on public.cost_validasi_review_courier_item;
drop policy if exists cost_validasi_review_courier_item_update on public.cost_validasi_review_courier_item;
drop policy if exists cost_validasi_review_courier_item_delete on public.cost_validasi_review_courier_item;
create policy cost_validasi_review_courier_item_select on public.cost_validasi_review_courier_item
  for select using (public.has_page_access('courier_cost_validation') or public.has_page_access('courier_finance'));
create policy cost_validasi_review_courier_item_insert on public.cost_validasi_review_courier_item
  for insert with check (public.has_edit_access('courier_cost_validation'));
create policy cost_validasi_review_courier_item_update on public.cost_validasi_review_courier_item
  for update using (public.has_edit_access('courier_cost_validation')) with check (public.has_edit_access('courier_cost_validation'));
create policy cost_validasi_review_courier_item_delete on public.cost_validasi_review_courier_item
  for delete using (public.has_edit_access('courier_cost_validation'));
revoke all on public.cost_validasi_review_courier_item from anon;
grant select, insert, update, delete on public.cost_validasi_review_courier_item to authenticated;
