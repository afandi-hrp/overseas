-- ============================================================================
-- 032 -- PIB baru dari AI otomatis masuk DRAFT (Audit PIB Sea & Air) -- 2026-10-01
-- JALANKAN HANYA SETELAH DIKONFIRMASI USER (mengubah alur: dulu baris baru default 'LENGKAP' =
-- langsung tampil sbg Audited; sesudah ini baris baru dari AI = 'ARCHIVED' = Draft, baru bisa
-- di-"Mark as audited" lewat gerbang 031 setelah issue Invoice Recap beres).
-- Baris LAMA TIDAK diubah. Input manual user (Add manually) TIDAK disentuh (status dari form).
-- Butuh 031 sudah dijalankan. AMAN DIJALANKAN ULANG.
-- ============================================================================
do $$
declare v_conflict text;
begin
  select string_agg(p.proname, ', ') into v_conflict
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_seaair_auto_draft_pib'
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'beehive:032%';
  if v_conflict is not null then
    raise exception 'STOP 032: nama fungsi sudah dipakai fungsi lain: %', v_conflict;
  end if;
end $$;

create or replace function public.fn_seaair_auto_draft_pib()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  -- Hanya tulisan AI / service (n8n). Status kosong atau 'LENGKAP' -> Draft.
  if auth.email() is null and coalesce(new.status, 'LENGKAP') = 'LENGKAP' then
    new.status := 'ARCHIVED';
  end if;
  return new;
end;
$$;
comment on function public.fn_seaair_auto_draft_pib() is 'beehive:032 PIB baru dari AI masuk Draft';
revoke all on function public.fn_seaair_auto_draft_pib() from public, anon;

drop trigger if exists trg_seaair_auto_draft on public.tabel_audit_seaair;
create trigger trg_seaair_auto_draft
  before insert on public.tabel_audit_seaair
  for each row execute function public.fn_seaair_auto_draft_pib();
