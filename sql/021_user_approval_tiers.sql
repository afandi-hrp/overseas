-- "Jabatan approval" per USER, per HALAMAN -- lihat CLAUDE.md bagian RBAC.
-- BELUM DIJALANKAN ke Supabase production -- WAJIB dijalankan manual dulu.
create table if not exists public.user_approval_tiers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  tier text not null,
  primary key (user_id, page_key)
);
alter table public.user_approval_tiers enable row level security;
create policy "Admins manage user_approval_tiers" on public.user_approval_tiers
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Users read own approval tiers" on public.user_approval_tiers
  for select using (auth.uid() = user_id);

create or replace function public.get_my_approval_tiers()
returns jsonb language sql security definer stable as $$
  select coalesce(jsonb_object_agg(uat.page_key, uat.tier), '{}'::jsonb)
  from public.user_approval_tiers uat where uat.user_id = auth.uid();
$$;
grant execute on function public.get_my_approval_tiers() to authenticated;

-- Kolom roles.approval_tier/profiles.approval_tier (iterasi lama) aman didiamkan/di-drop, sudah
-- tidak dipakai. RPC ini SENGAJA terpisah dari get_my_access() (supaya tidak menulis ulang body
-- yg battle-tested tanpa akses DB langsung).
