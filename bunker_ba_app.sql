-- ============================================================================
-- MODUL BUNKER -- PEMBUATAN BERITA ACARA (BA) LEWAT APLIKASI (Supabase)
-- Jalankan SETELAH bunker_update_beehive.sql. Aman dijalankan berulang (idempotent),
-- hanya menyentuh objek berawalan "bunker_".
--
-- Format dokumen: FM-BA.PST-001 (Tgl. Revisi 00, efektif 27 Februari 2024), dua tipe:
--   TANPA_LAB       "Berita Acara Pembayaran Bunker Tanpa Hasil Tes Laboratorium"
--   TANPA_POTONGAN  "Berita Acara Pembayaran Bunker Tanpa Pemotongan" (hasil lab OFFSPEC)
-- Kedua nilai itu SAMA dengan nilai kolom bunker_dokumen.ba_tipe yang dibaca n8n dari BA
-- bertandatangan yang diupload, jadi satu istilah di seluruh sistem.
--
-- PENTING: membuat BA di aplikasi TIDAK otomatis menganggap dokumen BA "sudah ada".
-- BA yang sah adalah BA bertandatangan yang diupload kembali lewat upload biasa (n8n yang
-- mengisi kelengkapan_status.ba). Tabel bunker_ba hanya menyimpan isi/riwayat BA yang dibuat.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DAFTAR PEJABAT PENANDATANGAN (diatur lewat tabel, bukan ditulis di kode aplikasi)
--    4 kolom tanda tangan di BA: Diajukan (BUYERS_SUPPORT), Diketahui (BUYERS_OFFICER),
--    Diperiksa (PURCHASING_SUPERVISOR), Disetujui (PURCHASING_MANAGER).
--    Data awal diambil dari 3 contoh BA di folder proyek; PERIKSA & SESUAIKAN sebelum dipakai.
-- ----------------------------------------------------------------------------
create table if not exists public.bunker_ba_pejabat (
    id          uuid primary key default gen_random_uuid(),
    peran       text not null check (peran in
                    ('BUYERS_SUPPORT', 'BUYERS_OFFICER', 'PURCHASING_SUPERVISOR', 'PURCHASING_MANAGER')),
    nama        text not null,
    jabatan     text not null,
    departemen  text not null default 'Purchasing',
    aktif       boolean not null default true,
    created_at  timestamptz not null default now(),
    unique (peran, nama)
);

insert into public.bunker_ba_pejabat (peran, nama, jabatan) values
    ('BUYERS_SUPPORT',        'Felin',           'Buyers Support'),
    ('BUYERS_SUPPORT',        'Jacinta',         'Buyers Support'),
    ('BUYERS_OFFICER',        'Lidya Yunita',    'Buyers Officer'),
    ('BUYERS_OFFICER',        'Jesslyn Nyolinda','Buyers Officer'),
    ('BUYERS_OFFICER',        'Felintia',        'Buyers Officer'),
    ('PURCHASING_SUPERVISOR', 'Dessy Anggraini', 'Purchasing Supervisor'),
    ('PURCHASING_MANAGER',    'Medelin Dini',    'Purchasing Manager')
on conflict (peran, nama) do nothing;

-- ----------------------------------------------------------------------------
-- 2. TABEL bunker_ba -- 1 baris = 1 BA yang dibuat dari aplikasi
--    isi (jsonb) = SNAPSHOT seluruh isi dokumen saat dibuat, supaya BA yang sudah diterbitkan
--    tidak berubah sendiri kalau data bunker_dokumen diperbarui kemudian. Bentuk isi ada di
--    prompt aplikasi (prompt_claude_code_bunker_update_gabungan.md, bagian B3).
-- ----------------------------------------------------------------------------
create table if not exists public.bunker_ba (
    id                  uuid primary key default gen_random_uuid(),
    bunker_dokumen_id   uuid not null references public.bunker_dokumen(id) on delete restrict,
    tipe                text not null check (tipe in ('TANPA_LAB', 'TANPA_POTONGAN')),
    tanggal             date not null default current_date,
    nomor_ba            text,             -- BOLEH DIISI/DIUBAH BEBAS oleh aplikasi; NULL/kosong saat insert = diisi otomatis
    tahun               integer,          -- otomatis: tahun dari tanggal (informasi)
    urut                integer,          -- otomatis: angka di depan nomor_ba (informasi, dipakai utk saran nomor berikutnya)
    isi                 jsonb not null default '{}'::jsonb,
    status              text not null default 'DRAFT'
                            check (status in ('DRAFT', 'DICETAK', 'DIBATALKAN')),
    dibuat_oleh         text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- versi awal file ini membuat index unik (tahun, urut); dilepas karena nomor kini bebas diubah
-- (mis. penomoran per bulan akan memakai urut yang sama di bulan berbeda). Keunikan dijaga di nomor_ba.
drop index if exists public.bunker_ba_tahun_urut_uq;
create unique index if not exists bunker_ba_nomor_uq on public.bunker_ba (nomor_ba);
-- satu BA aktif per PO (BA yang salah dibatalkan dulu, atau cukup diedit selama masih DRAFT)
create unique index if not exists bunker_ba_satu_aktif_per_po
    on public.bunker_ba (bunker_dokumen_id) where status <> 'DIBATALKAN';
create index if not exists bunker_ba_dokumen_idx on public.bunker_ba (bunker_dokumen_id);

drop trigger if exists bunker_ba_set_updated_at on public.bunker_ba;
create trigger bunker_ba_set_updated_at
    before update on public.bunker_ba
    for each row execute function public.bunker_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. PENOMORAN: NNN/BA-BNKR/PRC/<bulan romawi>/<tahun>   mis. 012/BA-BNKR/PRC/X/2026
--    "X/2026" = bulan (romawi) dan tahun BA. NOMOR BISA DIUBAH BEBAS: aplikasi mengirim nomor_ba
--    apa adanya (teks bebas, harus unik) atau mengosongkannya agar dibuat otomatis.
--    Saran nomor berikutnya (bunker_ba_nomor_berikutnya) menghitung urutan dari BA yang tercatat:
--      penomoran_per = 'TAHUN'  -> urutan berlanjut sepanjang tahun (default)
--      penomoran_per = 'BULAN'  -> urutan mulai 001 lagi tiap bulan
--    Ganti dengan satu perintah bila Purchasing memakai aturan lain:
--      update public.bunker_ba_pengaturan set nilai = 'BULAN' where kunci = 'penomoran_per';
--    Nomor yang diketik manual tidak harus mengikuti pola ini; angka di depan nomor (sebelum
--    "/") dipakai sebagai urutan bila terbaca.
-- ----------------------------------------------------------------------------
create table if not exists public.bunker_ba_pengaturan (
    kunci   text primary key,
    nilai   text not null
);
insert into public.bunker_ba_pengaturan (kunci, nilai) values ('penomoran_per', 'TAHUN')
on conflict (kunci) do nothing;

create or replace function public.bunker_ba_bulan_romawi(p_bulan integer)
returns text
language sql
immutable
as $$
    select (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[p_bulan];
$$;

create or replace function public.bunker_ba_format_nomor(p_urut integer, p_tanggal date)
returns text
language sql
immutable
as $$
    select lpad(p_urut::text, 3, '0') || '/BA-BNKR/PRC/'
           || public.bunker_ba_bulan_romawi(extract(month from p_tanggal)::integer)
           || '/' || extract(year from p_tanggal)::integer::text;
$$;

-- nomor urut berikutnya utk sebuah tanggal BA, sesuai pengaturan penomoran_per
-- (BA berstatus DIBATALKAN tetap dihitung: nomor yang pernah terbit tidak dipakai ulang)
drop function if exists public.bunker_ba_urut_berikutnya(integer);
create or replace function public.bunker_ba_urut_berikutnya(p_tanggal date default current_date)
returns integer
language sql
stable
as $$
    select coalesce(max(b.urut), 0) + 1
    from public.bunker_ba b
    where b.tahun = extract(year from p_tanggal)::integer
      and (coalesce((select nilai from public.bunker_ba_pengaturan where kunci = 'penomoran_per'), 'TAHUN') <> 'BULAN'
           or extract(month from b.tanggal) = extract(month from p_tanggal));
$$;

-- saran nomor lengkap utk ditampilkan (dan boleh diubah) di form
create or replace function public.bunker_ba_nomor_berikutnya(p_tanggal date default current_date)
returns text
language sql
stable
as $$
    select public.bunker_ba_format_nomor(public.bunker_ba_urut_berikutnya(p_tanggal), p_tanggal);
$$;

create or replace function public.bunker_ba_isi_nomor()
returns trigger
language plpgsql
as $$
declare
    m text[];
begin
    new.tahun := extract(year from new.tanggal)::integer;
    new.nomor_ba := nullif(btrim(new.nomor_ba), '');
    if new.nomor_ba is null then
        if tg_op = 'UPDATE' then
            raise exception 'Nomor BA tidak boleh dikosongkan.';
        end if;
        -- kunci per tahun agar dua pengguna yang membuat BA bersamaan tidak mendapat nomor kembar
        perform pg_advisory_xact_lock(hashtext('bunker_ba_urut_' || new.tahun::text));
        new.nomor_ba := public.bunker_ba_nomor_berikutnya(new.tanggal);
    end if;
    m := regexp_match(new.nomor_ba, '^0*([0-9]{1,6})\s*/');
    new.urut := case when m is null then null else m[1]::integer end;
    return new;
end;
$$;

drop trigger if exists bunker_ba_nomor_trg on public.bunker_ba;
create trigger bunker_ba_nomor_trg
    before insert or update of nomor_ba, tanggal on public.bunker_ba
    for each row execute function public.bunker_ba_isi_nomor();

-- BA yang sudah DICETAK / DIBATALKAN tidak boleh diubah isinya (hanya status DICETAK -> DIBATALKAN
-- yang diperbolehkan). Selama masih DRAFT bebas diedit, termasuk nomornya.
create or replace function public.bunker_ba_kunci()
returns trigger
language plpgsql
as $$
begin
    if old.status <> 'DRAFT'
       and (new.isi is distinct from old.isi or new.tanggal is distinct from old.tanggal
            or new.nomor_ba is distinct from old.nomor_ba or new.tipe is distinct from old.tipe
            or new.bunker_dokumen_id is distinct from old.bunker_dokumen_id) then
        raise exception 'BA % sudah berstatus %, isinya tidak bisa diubah. Batalkan lalu buat BA baru bila perlu.',
            old.nomor_ba, old.status;
    end if;
    if old.status = 'DIBATALKAN' and new.status <> 'DIBATALKAN' then
        raise exception 'BA % sudah dibatalkan dan tidak bisa diaktifkan kembali.', old.nomor_ba;
    end if;
    return new;
end;
$$;

drop trigger if exists bunker_ba_kunci_trg on public.bunker_ba;
create trigger bunker_ba_kunci_trg
    before update on public.bunker_ba
    for each row execute function public.bunker_ba_kunci();

-- ----------------------------------------------------------------------------
-- 4. TIPE BA YANG DISARANKAN utk sebuah PO (memakai aturan yang sama dgn syarat submit)
--      perlu_test_lab = false                      -> TANPA_LAB
--      perlu_test_lab = true & lab OFFSPEC         -> TANPA_POTONGAN
--      selain itu (ONSPEC / belum ada hasil / belum diputuskan) -> NULL (BA tidak diperlukan
--      atau belum bisa ditentukan)
--    Status lab efektif = lab_status_manual bila ada, kalau tidak lab_status dari n8n.
-- ----------------------------------------------------------------------------
create or replace function public.bunker_ba_tipe_disarankan(p_id uuid)
returns text
language sql
stable
as $$
    select case
        when d.perlu_test_lab is false then 'TANPA_LAB'
        when d.perlu_test_lab is true
             and upper(coalesce(d.lab_status_manual, d.lab_status, '')) = 'OFFSPEC' then 'TANPA_POTONGAN'
        else null
    end
    from public.bunker_dokumen d
    where d.id = p_id;
$$;

-- ----------------------------------------------------------------------------
-- WAJIB TERAKHIR: reload schema cache PostgREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
