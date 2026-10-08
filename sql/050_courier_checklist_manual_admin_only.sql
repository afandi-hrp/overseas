-- beehive:050 — Checklist Courier: centang manual dokumen (kolom ada_*) HANYA Admin (2026-10-08, keputusan user)
-- Role non-admin TIDAK boleh mengubah kolom ada_* (centang maupun cabut centang) di dokumen_checklist lewat aplikasi.
-- Dokumen hanya jadi Lengkap lewat upload (n8n = penulis service) atau jadi "Valid (note)" lewat accepted_docs (sql/049, wajib catatan).
-- Penulis service (n8n / SQL Editor, auth.email() IS NULL) LOLOS -- upload susulan tetap mengisi ada_* seperti biasa.
-- Simpan checklist dari aplikasi mengirim SEMUA kolom ada_* apa adanya: kalau tidak ada yang berubah, simpan (Accept with note,
-- Checklist Note) tetap lolos. Pre-check (dicek user 2026-10-08): fungsi & trigger ini BELUM ada. Idempotent.

create or replace function public.fn_courier_checklist_manual_guard()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $function$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  k text;
begin
  if auth.email() is null then return new; end if;     -- penulis service (n8n / SQL Editor)
  if public.is_admin() then return new; end if;
  for k in select jsonb_object_keys(v_new) loop
    if k like 'ada\_%'
       and coalesce((v_new ->> k)::boolean, false) is distinct from coalesce((v_old ->> k)::boolean, false) then
      raise exception 'Only an Admin can change a document check manually (%). Upload the document or use "Accept with note".', k
        using errcode = '42501';
    end if;
  end loop;
  return new;
end
$function$;

drop trigger if exists trg_courier_checklist_manual_guard on public.dokumen_checklist;
create trigger trg_courier_checklist_manual_guard
  before insert or update on public.dokumen_checklist
  for each row execute function public.fn_courier_checklist_manual_guard();

revoke all on function public.fn_courier_checklist_manual_guard() from public, anon;
