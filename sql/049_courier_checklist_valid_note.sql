-- beehive:049 — Courier Checklist: "Valid (note)" (2026-10-08, keputusan user)
-- Dokumen WAJIB yang masih Missing boleh di-Accept dengan catatan (Checklist Note = dokumen_checklist.catatan_checklist).
-- Dokumen yang di-Accept dicatat di kolom BARU `accepted_docs` (daftar nama kolom ada_*, mis. {ada_invoice_duty,ada_bt_vendor}).
-- Aturan hitung (trigger hitung_kelengkapan): dokumen dianggap LENGKAP kalau kolom ada_* = true ATAU (dokumen ada di
-- accepted_docs DAN catatan_checklist tidak kosong). Catatan dihapus -> dokumen yang di-Accept kembali Missing.
-- Upload susulan (n8n / Upload additional doc) mengisi ada_* = true -> entri accepted_docs dokumen itu otomatis dibuang
-- (status jadi Lengkap biasa, catatan tetap tersimpan sbg riwayat). Kolom ada_* TIDAK diubah.
-- Data lama TIDAK di-backfill (accepted_docs default '{}' -> hasil hitung sama seperti sebelumnya). Idempotent.
-- Pre-check: fungsi public.hitung_kelengkapan() SUDAH ADA (dicek user 2026-10-08, trigger trg_hitung_kelengkapan) dan
-- sengaja diganti di sini -- badan lama dipertahankan, hanya ditambah aturan accepted_docs.

alter table public.dokumen_checklist add column if not exists accepted_docs text[] not null default '{}';
comment on column public.dokumen_checklist.accepted_docs is
  'beehive:049 dokumen wajib missing yg di-Accept dgn catatan (Valid (note)); dihitung lengkap selama catatan_checklist terisi';

create or replace function public.hitung_kelengkapan()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $function$
declare
  mandatory_pib text[] := array[
    'ada_invoice_freight','ada_fp_invoice_freight',
    'ada_invoice_duty','ada_fp_invoice_duty',
    'ada_billing_djbc','ada_bpn','ada_cipl','ada_awb',
    'ada_pib','ada_sppb','ada_po',
    'ada_final_invoice','ada_bt_vendor'
  ];
  mandatory_cn text[] := array[
    'ada_invoice_freight','ada_fp_invoice_freight',
    'ada_invoice_duty','ada_fp_invoice_duty',
    'ada_billing_djbc','ada_bpn','ada_cipl','ada_awb',
    'ada_sppbmcp','ada_final_invoice','ada_bt_vendor'
  ];
  nama_dok jsonb := '{
    "ada_invoice_freight":"Invoice Freight",
    "ada_fp_invoice_freight":"FP Invoice Freight",
    "ada_invoice_duty":"Invoice Duty",
    "ada_fp_invoice_duty":"FP Invoice Duty",
    "ada_billing_djbc":"Billing DJBC",
    "ada_bpn":"BPN",
    "ada_cipl":"CIPL",
    "ada_awb":"AWB",
    "ada_pib":"PIB",
    "ada_sppb":"SPPB",
    "ada_po":"PO (Ascend)",
    "ada_sppbmcp":"SPPBMCP",
    "ada_final_invoice":"Final Invoice",
    "ada_bt_vendor":"BT Vendor"
  }'::jsonb;

  list_mandatory text[];
  row_json       jsonb;
  field          text;
  total_mand     int := 0;
  total_ada      int := 0;
  kurang_list    text[] := '{}';
  pct            numeric;
  note_ok        boolean;
begin
  -- Tentukan list mandatory berdasarkan jenis dokumen
  if new.jenis_dokumen = 'PIB' then
    list_mandatory := mandatory_pib;
  else
    list_mandatory := mandatory_cn;
  end if;

  -- Konversi NEW row ke JSONB untuk akses dinamis
  row_json := to_jsonb(new);

  -- "Valid (note)" hanya berlaku selama Checklist Note terisi
  note_ok := btrim(coalesce(new.catatan_checklist, '')) <> '';

  -- Upload susulan (ada_* = true) menggantikan Valid (note): buang entri accepted_docs yg sudah ada / bukan dokumen wajib
  new.accepted_docs := coalesce((
    select array_agg(a order by a)
      from unnest(coalesce(new.accepted_docs, '{}'::text[])) as a
     where a = any (list_mandatory)
       and coalesce((row_json ->> a)::boolean, false) = false
  ), '{}'::text[]);

  -- Hitung ada dan kurang
  foreach field in array list_mandatory loop
    total_mand := total_mand + 1;
    if (row_json ->> field)::boolean = true then
      total_ada := total_ada + 1;
    elsif note_ok and field = any (new.accepted_docs) then
      total_ada := total_ada + 1;                       -- Valid (note): dihitung lengkap
    else
      kurang_list := array_append(kurang_list, nama_dok ->> field);
    end if;
  end loop;

  -- Hitung persentase
  pct := round((total_ada::numeric / total_mand::numeric) * 100, 2);

  -- Set nilai hasil hitung ke NEW
  new.total_mandatory     := total_mand;
  new.total_mandatory_ada := total_ada;
  new.pct_kelengkapan     := pct;
  new.status_kelengkapan  := case when array_length(kurang_list, 1) is null
                                  then 'LENGKAP'
                                  else 'TIDAK LENGKAP' end;
  new.dokumen_kurang      := case when array_length(kurang_list, 1) is null
                                  then '-'
                                  else array_to_string(kurang_list, ', ') end;
  return new;
end;
$function$;
