-- RLS untuk modul Direct Loading (FAR Overseas Air) -- 5 tabel yang belum ada RLS-nya, sesuai
-- hasil sql/000_checks.sql. Jalankan SETELAH sql/001_rbac_and_bunker_rls.sql (butuh function
-- has_page_access() yang didefinisikan di sana).
--
-- Pemetaan tabel -> page_key sudah dicek langsung ke kode (grep semua `.from('<tabel>')`):
--   rekapan_far_overseas_air, cost_validasi_far_overseas_air, far_overseas_air_processing_queue,
--   far_overseas_signer_config -- SEMUA cuma dipakai dari halaman Direct Loading
--   (FarOverseasAirPage.tsx / FarOverseasAirCostValidationModal.tsx / FarOverseasAirDetailModal.tsx)
--   -> page_key 'direct_loading'.
--   far_overseas_tarif_vendor -- CUMA dipakai dari FarOverseasVendorTarifPage.tsx
--   (/settings/tarif-far-overseas-vendor) -> page_key 'settings_tarif_far_overseas_vendor'.
--
-- n8n menulis ke tabel-tabel ini pakai SERVICE ROLE KEY (sama seperti Bunker) -- otomatis
-- melewati RLS, jadi policy ini tidak mengganggu proses ekstraksi/update otomatis dari n8n.

alter table public.rekapan_far_overseas_air enable row level security;
alter table public.cost_validasi_far_overseas_air enable row level security;
alter table public.far_overseas_air_processing_queue enable row level security;
alter table public.far_overseas_signer_config enable row level security;
alter table public.far_overseas_tarif_vendor enable row level security;

drop policy if exists rekapan_far_overseas_air_page_access on public.rekapan_far_overseas_air;
create policy rekapan_far_overseas_air_page_access on public.rekapan_far_overseas_air
  for all using (public.has_page_access('direct_loading'))
  with check (public.has_page_access('direct_loading'));

drop policy if exists cost_validasi_far_overseas_air_page_access on public.cost_validasi_far_overseas_air;
create policy cost_validasi_far_overseas_air_page_access on public.cost_validasi_far_overseas_air
  for all using (public.has_page_access('direct_loading'))
  with check (public.has_page_access('direct_loading'));

drop policy if exists far_overseas_air_processing_queue_page_access on public.far_overseas_air_processing_queue;
create policy far_overseas_air_processing_queue_page_access on public.far_overseas_air_processing_queue
  for all using (public.has_page_access('direct_loading'))
  with check (public.has_page_access('direct_loading'));

drop policy if exists far_overseas_signer_config_page_access on public.far_overseas_signer_config;
create policy far_overseas_signer_config_page_access on public.far_overseas_signer_config
  for all using (public.has_page_access('direct_loading'))
  with check (public.has_page_access('direct_loading'));

drop policy if exists far_overseas_tarif_vendor_page_access on public.far_overseas_tarif_vendor;
create policy far_overseas_tarif_vendor_page_access on public.far_overseas_tarif_vendor
  for all using (public.has_page_access('settings_tarif_far_overseas_vendor'))
  with check (public.has_page_access('settings_tarif_far_overseas_vendor'));
