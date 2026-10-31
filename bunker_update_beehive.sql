-- ============================================================================
-- MODUL BUNKER -- UPDATE ALUR BEEHIVE (Supabase)
-- Aman dijalankan berulang (idempotent) dan hanya menyentuh objek berawalan "bunker_".
-- Jalankan SEKALI di SQL Editor Supabase, SEBELUM workflow n8n dan aplikasi diperbarui.
--
-- PEMBAGIAN KEPEMILIKAN KOLOM (PENTING):
--   * Ditulis n8n   : lab_status, lab_detail, ba_tipe, nilai_tagihan  (+ kelengkapan_status
--                     yang sudah ada, kini ditambah kunci bt_dpp, bt_ppn, bpe, a2)
--   * Ditulis APP   : perlu_test_lab, lab_menyusul, lab_menyusul_alasan, lab_status_manual,
--                     dokumen_manual, status_pembayaran (otomatis via trigger),
--                     submitted_to_finance_at, submitted_by, dan seluruh tabel bunker_pembayaran
--   n8n TIDAK PERNAH menulis kolom milik APP, jadi aman dari tertimpa saat dokumen susulan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KOLOM BARU di bunker_dokumen
-- ----------------------------------------------------------------------------
-- (milik APP)
alter table public.bunker_dokumen add column if not exists perlu_test_lab boolean;          -- NULL = belum ditentukan Tim Bunker
alter table public.bunker_dokumen add column if not exists lab_menyusul boolean not null default false; -- lab menyusul krn credit term singkat
alter table public.bunker_dokumen add column if not exists lab_menyusul_alasan text;
alter table public.bunker_dokumen add column if not exists lab_status_manual text;           -- 'ONSPEC'/'OFFSPEC' bila AI tidak bisa membaca
alter table public.bunker_dokumen add column if not exists dokumen_manual jsonb not null default '{}'::jsonb; -- {"spb":true,"approval":true,"si":true,"foto":true,"po":true}
alter table public.bunker_dokumen add column if not exists status_pembayaran text not null default 'BELUM BAYAR';
alter table public.bunker_dokumen add column if not exists submitted_to_finance_at timestamptz;
alter table public.bunker_dokumen add column if not exists submitted_by text;

-- (milik n8n)
alter table public.bunker_dokumen add column if not exists lab_status text;                 -- 'ONSPEC' / 'OFFSPEC' / NULL
alter table public.bunker_dokumen add column if not exists lab_detail jsonb not null default '{}'::jsonb;
alter table public.bunker_dokumen add column if not exists ba_tipe text;                     -- 'TANPA_LAB' / 'TANPA_POTONGAN' / 'LAINNYA' / NULL
alter table public.bunker_dokumen add column if not exists nilai_tagihan jsonb not null default '{}'::jsonb; -- {mata_uang, dpp, ppn, total, ada_ppn}

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'bunker_dokumen_status_pembayaran_chk') then
        alter table public.bunker_dokumen add constraint bunker_dokumen_status_pembayaran_chk
            check (status_pembayaran in ('BELUM BAYAR', 'DOWN PAYMENT', 'CLEAR'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bunker_dokumen_lab_status_chk') then
        alter table public.bunker_dokumen add constraint bunker_dokumen_lab_status_chk
            check (lab_status is null or lab_status in ('ONSPEC', 'OFFSPEC'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'bunker_dokumen_lab_status_manual_chk') then
        alter table public.bunker_dokumen add constraint bunker_dokumen_lab_status_manual_chk
            check (lab_status_manual is null or lab_status_manual in ('ONSPEC', 'OFFSPEC'));
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. TABEL bunker_pembayaran -- 1 baris = 1 transfer dari Finance
--    (DPP / PPN untuk tagihan ber-PPN, FULL untuk tagihan tanpa PPN)
-- ----------------------------------------------------------------------------
create table if not exists public.bunker_pembayaran (
    id                  uuid primary key default gen_random_uuid(),
    bunker_dokumen_id   uuid not null references public.bunker_dokumen(id) on delete restrict,
    tahap               text not null check (tahap in ('DPP', 'PPN', 'FULL')),
    nominal             numeric(18,2) not null check (nominal > 0),
    mata_uang           text not null default 'IDR',
    tgl_transfer        date,
    no_referensi        text,
    catatan             text,
    bukti_filename      text,
    bukti_file_url      text,
    dicatat_oleh        text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists bunker_pembayaran_dokumen_idx on public.bunker_pembayaran (bunker_dokumen_id);

comment on table public.bunker_pembayaran is
    'Modul Bunker: catatan tiap transfer Finance (DPP/PPN/FULL). Status bunker_dokumen.status_pembayaran dihitung otomatis dari tabel ini.';

drop trigger if exists bunker_pembayaran_set_updated_at on public.bunker_pembayaran;
create trigger bunker_pembayaran_set_updated_at
    before update on public.bunker_pembayaran
    for each row execute function public.bunker_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Hitung status_pembayaran dari catatan transfer
--    BELUM BAYAR -> DOWN PAYMENT (ada transfer tapi belum lunas) -> CLEAR (lunas)
--    * Tagihan ber-PPN : CLEAR bila DPP terbayar penuh DAN PPN terbayar penuh
--    * Tanpa PPN       : CLEAR bila total terbayar penuh (tahap FULL)
--    Toleransi selisih: 500 (IDR) / 1 (USD), sama dgn toleransi perbandingan di n8n.
-- ----------------------------------------------------------------------------
create or replace function public.bunker_hitung_status_pembayaran(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_nilai     jsonb;
    v_mu        text;
    v_tol       numeric;
    v_dpp       numeric;
    v_ppn       numeric;
    v_total     numeric;
    v_ada_ppn   boolean;
    v_s_dpp     numeric;
    v_s_ppn     numeric;
    v_s_full    numeric;
    v_n         integer;
begin
    select nilai_tagihan into v_nilai from public.bunker_dokumen where id = p_id;
    v_nilai := coalesce(v_nilai, '{}'::jsonb);

    select count(*),
           coalesce(sum(nominal) filter (where tahap = 'DPP'), 0),
           coalesce(sum(nominal) filter (where tahap = 'PPN'), 0),
           coalesce(sum(nominal) filter (where tahap = 'FULL'), 0)
      into v_n, v_s_dpp, v_s_ppn, v_s_full
      from public.bunker_pembayaran where bunker_dokumen_id = p_id;

    if v_n = 0 then return 'BELUM BAYAR'; end if;

    v_mu    := upper(coalesce(nullif(v_nilai->>'mata_uang', ''), 'IDR'));
    v_tol   := case when v_mu = 'USD' then 1 else 500 end;
    v_dpp   := nullif(v_nilai->>'dpp', '')::numeric;
    v_ppn   := nullif(v_nilai->>'ppn', '')::numeric;
    v_total := nullif(v_nilai->>'total', '')::numeric;
    v_ada_ppn := case when v_nilai ? 'ada_ppn' then (v_nilai->>'ada_ppn')::boolean else null end;

    if coalesce(v_ada_ppn, false) or v_s_ppn > 0 then
        -- jalur tagihan ber-PPN
        if v_s_dpp > 0 and (v_dpp is null or v_s_dpp >= v_dpp - v_tol)
           and v_s_ppn > 0 and (v_ppn is null or v_s_ppn >= v_ppn - v_tol) then
            return 'CLEAR';
        end if;
        return 'DOWN PAYMENT';
    end if;

    -- jalur tagihan tanpa PPN (atau PPN belum diketahui)
    if v_s_full > 0 and (v_total is null or (v_s_full + v_s_dpp) >= v_total - v_tol) then
        return 'CLEAR';
    end if;
    return 'DOWN PAYMENT';
end;
$$;

create or replace function public.bunker_pembayaran_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    v_id := coalesce(new.bunker_dokumen_id, old.bunker_dokumen_id);
    update public.bunker_dokumen
       set status_pembayaran = public.bunker_hitung_status_pembayaran(v_id)
     where id = v_id;
    return null;
end;
$$;

drop trigger if exists bunker_pembayaran_status_trg on public.bunker_pembayaran;
create trigger bunker_pembayaran_status_trg
    after insert or update or delete on public.bunker_pembayaran
    for each row execute function public.bunker_pembayaran_after_change();

-- Bila n8n menghitung ulang nilai_tagihan (mis. invoice dikoreksi lewat upload susulan), status
-- pembayaran ikut dihitung ulang terhadap catatan transfer yang sudah ada.
create or replace function public.bunker_dokumen_after_nilai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_baru text;
begin
    v_baru := public.bunker_hitung_status_pembayaran(new.id);
    if v_baru is distinct from new.status_pembayaran then
        update public.bunker_dokumen set status_pembayaran = v_baru where id = new.id;
    end if;
    return null;
end;
$$;

drop trigger if exists bunker_dokumen_nilai_trg on public.bunker_dokumen;
create trigger bunker_dokumen_nilai_trg
    after update of nilai_tagihan on public.bunker_dokumen
    for each row
    when (old.nilai_tagihan is distinct from new.nilai_tagihan)
    execute function public.bunker_dokumen_after_nilai();

-- ----------------------------------------------------------------------------
-- 4. ATURAN pencatatan transfer (ditegakkan di database, bukan hanya di UI)
--    - Tagihan harus sudah dikirim ke Finance (submitted_to_finance_at terisi)
--    - Tagihan ber-PPN: tahap FULL ditolak. Tagihan tanpa PPN: tahap DPP/PPN ditolak.
--    - Tahap PPN hanya boleh dicatat bila DPP sudah tercatat DAN BPE + Lampiran A2 sudah ada.
-- ----------------------------------------------------------------------------
create or replace function public.bunker_pembayaran_validasi()
returns trigger
language plpgsql
as $$
declare
    r public.bunker_dokumen%rowtype;
    v_ada_ppn boolean;
    v_ada_dpp integer;
begin
    select * into r from public.bunker_dokumen where id = new.bunker_dokumen_id;
    if not found then
        raise exception 'Baris bunker_dokumen tidak ditemukan.';
    end if;

    if r.submitted_to_finance_at is null then
        raise exception 'Tagihan belum dikirim ke Finance, pembayaran belum bisa dicatat.';
    end if;

    v_ada_ppn := case when r.nilai_tagihan ? 'ada_ppn' then (r.nilai_tagihan->>'ada_ppn')::boolean else null end;

    if v_ada_ppn is true and new.tahap = 'FULL' then
        raise exception 'Tagihan ini dikenakan PPN: catat transfer sebagai tahap DPP lalu PPN, bukan FULL.';
    end if;
    if v_ada_ppn is false and new.tahap in ('DPP', 'PPN') then
        raise exception 'Tagihan ini tanpa PPN: catat transfer sebagai tahap FULL.';
    end if;

    if new.tahap = 'PPN' then
        select count(*) into v_ada_dpp from public.bunker_pembayaran
         where bunker_dokumen_id = new.bunker_dokumen_id and tahap = 'DPP';
        if v_ada_dpp = 0 then
            raise exception 'Transfer DPP belum tercatat. Catat pembayaran DPP lebih dulu sebelum PPN.';
        end if;
        if coalesce((r.kelengkapan_status->>'bpe')::boolean, false) is not true
           or coalesce((r.kelengkapan_status->>'a2')::boolean, false) is not true then
            raise exception 'BPE dan Lampiran A2 wajib diupload sebelum pembayaran PPN dicatat.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists bunker_pembayaran_validasi_trg on public.bunker_pembayaran;
create trigger bunker_pembayaran_validasi_trg
    before insert on public.bunker_pembayaran
    for each row execute function public.bunker_pembayaran_validasi();

-- ----------------------------------------------------------------------------
-- 4b. DAFTAR DOKUMEN WAJIB (bisa diatur tanpa mengubah kode)
--     Kolom aktif = TRUE  -> dokumen itu WAJIB utk submit ke Finance (berlaku sekarang)
--     Kolom aktif = FALSE -> belum berlaku (tidak diperiksa, tidak muncul sbg "kurang")
--     SPB, Approval Purchasing Manager dan Foto Kegiatan belum berlaku (menunggu integrasi
--     BeeSuite/Ascend dan keputusan batas ukuran foto), jadi diset aktif = FALSE.
--     Kelak cukup:  update public.bunker_dokumen_wajib set aktif = true where kode = 'spb';
--     Kwitansi bersifat OPSIONAL, sengaja tidak ada di daftar ini.
--     "si" = PI di dokumen resmi = Stock In (hasil upload).
-- ----------------------------------------------------------------------------
create table if not exists public.bunker_dokumen_wajib (
    kode    text primary key,
    nama    text not null,
    aktif   boolean not null default true,
    urutan  integer not null default 0
);

insert into public.bunker_dokumen_wajib (kode, nama, aktif, urutan) values
    ('spb',      'SPB',                         false, 1),
    ('po',       'Purchase Order',              true,  2),
    ('approval', 'Approval Purchasing Manager', false, 3),
    ('si',       'PI (Stock In)',               true,  4),
    ('br',       'Bunker Receipt',              true,  5),
    ('ts',       'Tank Sounding',               true,  6),
    ('foto',     'Foto Kegiatan Bunker',        false, 7),
    ('invoice',  'Invoice',                     true,  8),
    ('fp',       'Faktur Pajak',                true,  9)
on conflict (kode) do nothing;

-- ----------------------------------------------------------------------------
-- 5. SYARAT SUBMIT KE FINANCE
--    Dokumen wajib = baris aktif di bunker_dokumen_wajib (lihat 4b; saat ini PO, PI/Stock In,
--    Bunker Receipt, Tank Sounding, Invoice, Faktur Pajak). Sebuah dokumen dianggap ADA bila
--    kunci kelengkapan_status (diisi n8n dari hasil upload) ATAU dokumen_manual (diisi app/
--    integrasi) bernilai true -- jadi nanti saat SPB/PO/Approval terhubung ke BeeSuite/Ascend
--    cukup mengisi dokumen_manual.
--    Syarat bersyarat:
--      perlu_test_lab NULL  -> keputusan belum diambil, belum boleh submit
--      perlu_test_lab TRUE  -> hasil lab wajib (kecuali lab_menyusul + alasan terisi);
--                              bila lab OFFSPEC -> Berita Acara wajib
--      perlu_test_lab FALSE -> Berita Acara wajib
--    Status verifikasi silang (BUTUH REVIEW) TIDAK memblokir; dikembalikan sbg informasi.
-- ----------------------------------------------------------------------------
create or replace function public.bunker_syarat_submit(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
    r          public.bunker_dokumen%rowtype;
    ks         jsonb;
    dm         jsonb;
    v_kurang   jsonb := '[]'::jsonb;
    v_info     jsonb := '[]'::jsonb;
    v_lab_eff  text;
    v_lab_wajib boolean := false;
    v_ba_wajib  boolean := false;
    v_ada_lab   boolean;
    v_ada_ba    boolean;
    w           record;
begin
    select * into r from public.bunker_dokumen where id = p_id;
    if not found then
        raise exception 'Baris bunker_dokumen % tidak ditemukan.', p_id;
    end if;

    ks := coalesce(r.kelengkapan_status, '{}'::jsonb);
    dm := coalesce(r.dokumen_manual, '{}'::jsonb);

    for w in select kode, nama from public.bunker_dokumen_wajib where aktif order by urutan, kode loop
        if not (coalesce((ks->>w.kode)::boolean, false) or coalesce((dm->>w.kode)::boolean, false)) then
            v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                'kode', w.kode, 'nama', w.nama, 'alasan', 'Dokumen wajib belum dilampirkan'));
        end if;
    end loop;

    v_lab_eff := coalesce(r.lab_status_manual, r.lab_status);
    v_ada_lab := coalesce((ks->>'lab')::boolean, false) or coalesce((dm->>'lab')::boolean, false);
    v_ada_ba  := coalesce((ks->>'ba')::boolean, false)  or coalesce((dm->>'ba')::boolean, false);

    if r.perlu_test_lab is null then
        v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
            'kode', 'tentukan_test_lab', 'nama', 'Keputusan test lab',
            'alasan', 'Tim Bunker belum menentukan apakah bunker ini perlu test lab'));
    elsif r.perlu_test_lab then
        if not v_ada_lab then
            if r.lab_menyusul then
                if coalesce(btrim(r.lab_menyusul_alasan), '') = '' then
                    v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                        'kode', 'lab_menyusul_alasan', 'nama', 'Alasan hasil lab menyusul',
                        'alasan', 'Hasil lab ditandai menyusul tetapi alasan (mis. credit term singkat) belum diisi'));
                else
                    v_info := v_info || jsonb_build_array(jsonb_build_object(
                        'kode', 'lab_menyusul', 'pesan', 'Hasil lab menyusul: ' || r.lab_menyusul_alasan));
                end if;
            else
                v_lab_wajib := true;
                v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                    'kode', 'lab', 'nama', 'Hasil Test Lab',
                    'alasan', 'Bunker ini dipilih untuk test lab, hasil lab wajib dilampirkan'));
            end if;
        else
            v_lab_wajib := true;
            if v_lab_eff is null then
                v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                    'kode', 'lab_status', 'nama', 'Status hasil lab (Onspec/Offspec)',
                    'alasan', 'Status Onspec/Offspec tidak terbaca otomatis, tentukan manual'));
            elsif v_lab_eff = 'OFFSPEC' then
                v_ba_wajib := true;
                if not v_ada_ba then
                    v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                        'kode', 'ba', 'nama', 'Berita Acara',
                        'alasan', 'Hasil lab OFFSPEC, Berita Acara wajib dilampirkan'));
                end if;
            end if;
        end if;
    else
        v_ba_wajib := true;
        if not v_ada_ba then
            v_kurang := v_kurang || jsonb_build_array(jsonb_build_object(
                'kode', 'ba', 'nama', 'Berita Acara',
                'alasan', 'Tanpa test lab, Berita Acara wajib dilampirkan'));
        end if;
    end if;

    if r.status = 'BUTUH REVIEW' then
        v_info := v_info || jsonb_build_array(jsonb_build_object(
            'kode', 'status_verifikasi', 'pesan', 'Verifikasi silang dokumen masih BUTUH REVIEW (tidak memblokir submit).'));
    end if;

    return jsonb_build_object(
        'boleh_submit', jsonb_array_length(v_kurang) = 0,
        'kurang',       v_kurang,
        'info',         v_info,
        'lab_wajib',    v_lab_wajib,
        'ba_wajib',     v_ba_wajib,
        'lab_status_efektif', v_lab_eff
    );
end;
$$;

create or replace function public.bunker_submit_ke_finance(p_id uuid, p_user text default null)
returns jsonb
language plpgsql
as $$
declare
    v_syarat jsonb;
    v_sudah  timestamptz;
begin
    select submitted_to_finance_at into v_sudah from public.bunker_dokumen where id = p_id;
    if not found then
        raise exception 'Baris bunker_dokumen % tidak ditemukan.', p_id;
    end if;
    if v_sudah is not null then
        return jsonb_build_object('ok', true, 'sudah_dikirim', true, 'submitted_at', v_sudah);
    end if;

    v_syarat := public.bunker_syarat_submit(p_id);
    if not (v_syarat->>'boleh_submit')::boolean then
        raise exception 'Belum bisa submit ke Finance. Kekurangan: %',
            (select string_agg(x->>'nama', ', ') from jsonb_array_elements(v_syarat->'kurang') x);
    end if;

    update public.bunker_dokumen
       set submitted_to_finance_at = now(),
           submitted_by            = p_user,
           status_workflow         = 'OUTSTANDING FINANCE'
     where id = p_id;

    return jsonb_build_object('ok', true, 'sudah_dikirim', false, 'submitted_at', now());
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Ringkasan pembayaran utk ditampilkan di app (nilai tagihan, sudah dibayar, sisa)
-- ----------------------------------------------------------------------------
create or replace function public.bunker_ringkasan_pembayaran(p_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
    r        public.bunker_dokumen%rowtype;
    v_dpp    numeric; v_ppn numeric; v_total numeric;
    s_dpp    numeric; s_ppn numeric; s_full numeric;
    v_ada_ppn boolean;
begin
    select * into r from public.bunker_dokumen where id = p_id;
    if not found then raise exception 'Baris bunker_dokumen % tidak ditemukan.', p_id; end if;

    v_dpp   := nullif(r.nilai_tagihan->>'dpp', '')::numeric;
    v_ppn   := nullif(r.nilai_tagihan->>'ppn', '')::numeric;
    v_total := nullif(r.nilai_tagihan->>'total', '')::numeric;
    v_ada_ppn := case when r.nilai_tagihan ? 'ada_ppn' then (r.nilai_tagihan->>'ada_ppn')::boolean else null end;

    select coalesce(sum(nominal) filter (where tahap = 'DPP'), 0),
           coalesce(sum(nominal) filter (where tahap = 'PPN'), 0),
           coalesce(sum(nominal) filter (where tahap = 'FULL'), 0)
      into s_dpp, s_ppn, s_full
      from public.bunker_pembayaran where bunker_dokumen_id = p_id;

    return jsonb_build_object(
        'status_pembayaran', r.status_pembayaran,
        'mata_uang',   coalesce(nullif(r.nilai_tagihan->>'mata_uang', ''), 'IDR'),
        'ada_ppn',     v_ada_ppn,
        'tagihan',     jsonb_build_object('dpp', v_dpp, 'ppn', v_ppn, 'total', v_total),
        'dibayar',     jsonb_build_object('dpp', s_dpp, 'ppn', s_ppn, 'full', s_full),
        'sisa',        jsonb_build_object(
                          'dpp',   case when v_dpp   is null then null else greatest(v_dpp - s_dpp, 0) end,
                          'ppn',   case when v_ppn   is null then null else greatest(v_ppn - s_ppn, 0) end,
                          'total', case when v_total is null then null else greatest(v_total - s_full - s_dpp, 0) end)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. VIEW bunker_dokumen_tahap -- klasifikasi menu/tab utk app (sesuai FLOW BeeHive)
--    DOKUMEN BELUM LENGKAP : ada dokumen wajib AKTIF (tabel bunker_dokumen_wajib) yang belum dilampirkan
--    OUTSTANDING TIM BUNKER: semua dokumen wajib aktif lengkap, belum dikirim ke Finance (Tim Bunker
--                            menentukan test lab / melengkapi Lab/BA)
--    OUTSTANDING FINANCE   : sudah dikirim ke Finance, belum CLEAR (status_pembayaran
--                            BELUM BAYAR atau DOWN PAYMENT -> sisa PPN masih diproses)
--    CLEAR                 : seluruh pembayaran selesai
--    Memakai hak akses pemanggil (security_invoker) supaya RLS tabel dasar tetap berlaku.
-- ----------------------------------------------------------------------------
create or replace view public.bunker_dokumen_tahap
with (security_invoker = true) as
select
    d.id,
    d.no_po_key,
    d.status_pembayaran,
    d.submitted_to_finance_at,
    case
        when d.submitted_to_finance_at is not null and d.status_pembayaran = 'CLEAR' then 'CLEAR'
        when d.submitted_to_finance_at is not null then 'OUTSTANDING FINANCE'
        when exists (
            select 1 from jsonb_array_elements(s.syarat->'kurang') x
             where x->>'kode' in (select w.kode from public.bunker_dokumen_wajib w)
        ) then 'DOKUMEN BELUM LENGKAP'
        else 'OUTSTANDING TIM BUNKER'
    end as tahap,
    (s.syarat->>'boleh_submit')::boolean as boleh_submit,
    s.syarat->'kurang' as kurang
from public.bunker_dokumen d
cross join lateral (select public.bunker_syarat_submit(d.id) as syarat) s;

-- ----------------------------------------------------------------------------
-- 8. WAJIB TERAKHIR: reload schema cache PostgREST
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
