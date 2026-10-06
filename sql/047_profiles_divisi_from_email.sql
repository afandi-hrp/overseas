-- beehive:047 -- 2026-10-06: isi profiles.divisi otomatis dari domain email (WAJIB setelah sql/046).
--   ...@finance...           -> FINANCE     (mis. @finance.com)
--   ...@purchasing...        -> PURCHASING  (mis. @purchasing.com)
--   ...@shipmentoverseas...  -> SHIPMENT    (mis. @shipmentoverseas.com)
-- HANYA mengisi user yang divisinya masih kosong -- divisi yang sudah diatur manual di Manage Roles & Access
-- TIDAK ditimpa. Aman dijalankan ulang (user baru dgn domain itu ikut terisi saat dijalankan lagi).
-- Domain dicocokkan dari bagian setelah '@' yang DIAWALI nama di atas (finance.com, finance.co.id, dst).
-- Jalankan di SQL Editor (role postgres).

-- 1) Pratinjau (opsional): siapa saja yang akan diisi
select p.email, p.nama, p.divisi as divisi_sekarang,
       case
         when split_part(lower(p.email), '@', 2) like 'finance%' then 'FINANCE'
         when split_part(lower(p.email), '@', 2) like 'purchasing%' then 'PURCHASING'
         when split_part(lower(p.email), '@', 2) like 'shipmentoverseas%' then 'SHIPMENT'
       end as divisi_baru
from public.profiles p
where nullif(btrim(coalesce(p.divisi, '')), '') is null
  and split_part(lower(p.email), '@', 2) ~ '^(finance|purchasing|shipmentoverseas)'
order by divisi_baru, p.email;

-- 2) Isi divisi
update public.profiles p
set divisi = case
    when split_part(lower(p.email), '@', 2) like 'finance%' then 'FINANCE'
    when split_part(lower(p.email), '@', 2) like 'purchasing%' then 'PURCHASING'
    when split_part(lower(p.email), '@', 2) like 'shipmentoverseas%' then 'SHIPMENT'
  end
where nullif(btrim(coalesce(p.divisi, '')), '') is null
  and split_part(lower(p.email), '@', 2) ~ '^(finance|purchasing|shipmentoverseas)';

-- 3) Verifikasi: jumlah user per divisi ("(kosong)" = belum ada divisi, atur manual di Manage Roles & Access)
select coalesce(divisi, '(kosong)') as divisi, count(*) as jumlah_user,
       string_agg(email, ', ' order by email) as email
from public.profiles
group by coalesce(divisi, '(kosong)')
order by (coalesce(divisi, '(kosong)') = '(kosong)'), 1;
