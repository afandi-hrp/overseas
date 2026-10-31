// Helper modul Cost Agent / Biaya Keagenan (2026-10-13, fondasi Prompt 1) -- SATU sumber tipe, query baca, wrapper RPC,
// label status & formatter modul ini. Skema: sql/054_cost_agent_schema.sql. Ringkasan: docs/claude/cost-agent.md.
// Pola: baca lewat supabase.from (view/tabel ber-RLS), tulis HANYA lewat RPC berguard (fn_cost_agent_*); n8n via proxy
// server.ts (/api/n8n-proxy-start multipart, /api/n8n-proxy-json tanpa file) -- selalu apiFetch, JANGAN fetch polos.
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/apiFetch'
import { orSafe } from './supabaseQueryHelpers'
import { mergeLinesView, type InvoiceLinesResponse } from './CostAgentLinesView'
import type { Tone } from '../components/SeaAirAuditUi'

// ─── Nilai enum (nilai DB apa adanya; label Inggris lewat *_META) ───────────────────────────────────────────────
export type CostAgentInvoiceStatus =
  | 'processing' | 'failed' | 'verification' | 'waiting_approval' | 'rejected' | 'approved' | 'journal' | 'paid' | 'cancelled'
export type CostAgentVoyageStatus = 'draft' | 'confirmed' | 'closed'
export type CostAgentVoyageSource = 'manual' | 'api' | 'import' | 'ai'
export type CostAgentActivity = 'muat' | 'bongkar' | 'bongkar_muat' | 'sts' | 'bunker' | 'docking' | 'lainnya'
export type CostAgentCompareFlag = 'sesuai' | 'naik' | 'turun' | 'tanpa_history' | 'item_baru'
// 'manual' (sql/057) = pembanding pilihan user (lines.ref_history_id), selalu urutan pertama di history[].
// 'same_vessel' (sql/058 compare v2) = kapal sama, pelabuhan lain.
export type CostAgentMatchLevel = 'same_vessel_port' | 'nearest_dwt' | 'same_vessel' | 'nearest_port' | 'none' | 'manual'
// sql/058: kecocokan teks baris dihitung SERVER (badge memakai ini, JANGAN dihitung dari angka similarity).
export type CostAgentLineMatch = 'same_line' | 'similar' | 'different_line' | 'no_text'
export type CostAgentDocType = 'unknown' | 'invoice' | 'faktur_pajak' | 'po' | 'kwitansi' | 'nota_pelabuhan' | 'lampiran' | 'lainnya'
export type CostAgentDocStatus = 'processing' | 'done' | 'failed'
export type CostAgentTaxStatus = 'processing' | 'match' | 'mismatch' | 'error'
export type CostAgentApprovalDecision = 'pending' | 'approved' | 'rejected' | 'skipped'
export type CostAgentPaymentDocType = 'AP_NOTE' | 'PV'
export type CostAgentPaymentStatus = 'draft' | 'submitted' | 'posted' | 'failed' | 'paid' | 'cancelled'

// ─── Baris view daftar ──────────────────────────────────────────────────────────────────────────────────────────
export interface CostAgentVoyageListRow {
  id: number
  company_code: string | null
  vessel_id: number
  vessel_name: string
  vessel_type: string | null
  voyage_no: string
  seq_in_report: number | null
  charter_type: string | null
  report_month: string | null // YYYY-MM-DD (tgl 1)
  status: CostAgentVoyageStatus
  source: CostAgentVoyageSource
  route: string | null // "BLW → LSM → SAB"
  first_arrival: string | null
  last_departure: string | null
  cargo_total: number | null
  cargo_unit: string | null
  invoice_count: number
  next_port_code: string | null
  next_eta_at: string | null
  // 'noon_report' = voyage draft dari Noon Report Excel (jam/handling/cargo kosong); null = dokumen SOF/Time Sheet atau manual.
  input_source?: string | null
  updated_at: string
}

export interface CostAgentInvoiceListRow {
  id: number
  status: CostAgentInvoiceStatus
  company_code: string | null
  invoice_no: string | null
  invoice_date: string | null
  service_date: string | null
  grand_total: number | null
  currency: string
  vendor_name: string | null
  vessel_name: string | null
  port_code: string | null
  port_name: string | null
  voyage_no: string | null
  voyage_id: number | null
  voyage_call_id: number | null
  duplicate_of: number | null
  note_count: number | null
  line_count: number
  naik_count: number
  baru_count: number
  unverified_count: number
  tax_status: CostAgentTaxStatus | null
  // Kolom versi 2 (dokumen susulan) -- TIDAK ADA di sql/054 yang disalin 2026-10-13; opsional sampai view diperbarui.
  po_numbers?: string[] | null
  document_count?: number | null
  documents_processing?: number | null
  // sql/064: keterangan invoice -- view list BELUM memuatnya; diisi `fetchCostAgentInvoiceList` dari cost_agent_invoices (fail-open).
  description?: string | null
  created_at: string
  updated_at: string
}

// ─── Master ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface CostAgentCompany { code: string; name: string | null; npwp?: string | null; is_active?: boolean }
export interface CostAgentVessel {
  id: number; name: string; vessel_type: string | null; dwt: number | null; company_code: string | null
  prefix?: string | null; short_code?: string | null; is_active?: boolean
}
export interface CostAgentPort {
  id: number; code: string; name: string; aliases: string[]; tz: string; is_verified: boolean
  province?: string | null; lat?: number | null; lon?: number | null
}
export interface CostAgentVendor { id: number; name: string; npwp?: string | null; is_active?: boolean }
export interface CostAgentCostItem {
  id: number; code: string; name: string; category: string; gl_account: string | null; keywords?: string[]; is_active?: boolean
}

export interface CostAgentApprovalMatrixRow {
  id: number
  name: string
  company_code: string | null // null = semua PT
  vendor_id: number | null // null = semua vendor
  office?: 'MEDAN' | 'JAKARTA' | null // sql/079: null = berlaku utk semua office; terisi = hanya invoice kapal ber-office itu
  min_amount: number
  max_amount: number | null // null = tanpa batas atas
  step_no: number
  approver_label: string
  approver_emails: string[]
  approver_role: string | null
  approval_mode?: 'any' | 'all' // sql/090: 'any' (bawaan) salah satu email cukup; 'all' semua email harus setuju. approver_label = nama level.
  is_active: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

// ─── Detail voyage (fn_cost_agent_get_voyage) ───────────────────────────────────────────────────────────────────
export interface CostAgentCallInvoice { id: number; status: CostAgentInvoiceStatus; invoice_no: string | null; vendor_name: string | null; grand_total: number | null }
export interface CostAgentVoyageCall {
  id: number
  voyage_id: number
  seq: number
  port_id: number
  port_code: string
  port_name: string
  port_tz: string
  activity: CostAgentActivity
  arrived_at: string | null
  anchored_at: string | null
  berthed_at: string | null
  commenced_at: string | null
  completed_at: string | null
  departed_at: string | null
  handling_hours: number | null
  port_stay_hours: number | null
  remarks: string | null
  invoices: CostAgentCallInvoice[] | null
}
export interface CostAgentVoyageCargo {
  id: number; voyage_id: number; call_id: number | null; seq: number; product: string; qty: number; unit: string; remarks: string | null
}
// Baris harian Noon Report (fn_cost_agent_get_voyage -> `noon`, urut tanggal). Angka sudah number; null = kosong. `*_lo` = teks (SYS ME / CYL OIL / SYS AE).
export interface CostAgentNoonDay {
  report_date: string
  doc_no: string | null
  leg_type: string | null
  leg_seq: number | null
  call_id: number | null
  location: string | null
  partner: string | null
  weather: string | null
  latitude: number | null
  longitude: number | null
  master: string | null
  rob_hsfo: number | null; rob_lsfo: number | null; rob_mdo: number | null; rob_lsmgo: number | null; rob_fw: number | null; rob_lo: string | null
  recv_hsfo: number | null; recv_lsfo: number | null; recv_mdo: number | null; recv_lsmgo: number | null; recv_fw: number | null; recv_lo: string | null
  cons_hsfo: number | null; cons_lsfo: number | null; cons_mdo: number | null; cons_lsmgo: number | null; cons_fw: number | null; cons_lo: string | null
  nav?: Record<string, unknown> | null
  cargo?: unknown[] | null
  warnings: string[] | null
  source_file: string | null
}
export interface CostAgentVoyageDetail {
  id: number
  vessel_id: number
  vessel_name: string
  vessel_dwt: number | null
  vessel_type: string | null
  company_code: string | null
  voyage_no: string
  seq_in_report: number | null
  charter_type: string | null
  report_month: string | null
  next_port_id: number | null
  next_port_code: string | null
  next_port_name: string | null
  next_eta_at: string | null
  status: CostAgentVoyageStatus
  source: CostAgentVoyageSource
  remarks: string | null
  external_ref: string | null
  input_source?: string | null
  extra?: Record<string, any> | null
  calls: CostAgentVoyageCall[]
  cargo: CostAgentVoyageCargo[]
  noon?: CostAgentNoonDay[] | null
  cargo_total: number | null
  created_at: string
  updated_at: string
}

// Payload fn_cost_agent_save_voyage -- waktu = jam lokal pelabuhan "YYYY-MM-DD HH:mm" TANPA offset.
export interface CostAgentVoyagePayload {
  id?: number | null
  vessel_id: number
  company_code: string | null
  voyage_no: string
  seq_in_report?: number | null
  charter_type?: string | null
  report_month: string | null // 'YYYY-MM-01'
  next_port?: string | null // kode / nama pelabuhan (server resolve)
  next_eta_at?: string | null
  status?: CostAgentVoyageStatus
  remarks?: string | null
  calls: {
    seq: number; port_id: number; activity: CostAgentActivity
    arrived_at?: string | null; berthed_at?: string | null; commenced_at?: string | null; completed_at?: string | null; departed_at?: string | null
  }[]
  cargo: { product: string; qty: number; unit: string; call_seq?: number | null }[]
}
// warnings = peringatan urutan waktu (tidak memblok) -- objek {seq, field, msg} dari fn_cost_agent_save_voyage.
export interface CostAgentVoyageWarning { seq: number; field: string; msg: string }
export interface CostAgentSaveVoyageResult { voyage_id: number; warnings: CostAgentVoyageWarning[]; calls: { seq: number; call_id: number }[] }
export interface CostAgentUpsertVoyagesResult {
  saved: number
  voyages: { voyage_no: string; voyage_id: number; warnings: CostAgentVoyageWarning[] | null }[]
  errors: { voyage_no: string | null; vessel: string | null; external_ref: string | null; error: string }[]
}

// ─── Detail invoice (fn_cost_agent_get_invoice_history) ─────────────────────────────────────────────────────────
export interface CostAgentLineHistory {
  match_level: CostAgentMatchLevel
  history_id: number
  service_date: string
  invoice_no: string | null
  voyage_no: string | null
  amount: number
  qty: number | null
  unit_price: number | null
  vessel_name: string | null
  vessel_dwt: number | null
  port_code: string | null
  port_name: string | null
  vendor_name: string | null
  distance_km: number | null
  dwt_diff: number | null
  description_raw: string | null // sql/057: teks BARIS biaya saja
  invoice_description?: string | null // sql/057: judul invoice lama (dulu tergabung "judul | baris")
  similarity?: number | null // sql/057: kemiripan teks baris 0..1 (sql/058: hanya utk tooltip)
  line_match?: CostAgentLineMatch | null // sql/058
  days_diff?: number | null // sql/058: tgl history − tgl invoice (negatif = sebelum invoice)
  // sql/061: peran baris -- primary = pembanding utama (flag dihitung dari sini), next = pembanding ke-2, alternative = baris SAMA
  // (same_line) di kapal sendiri-pelabuhan lain / pelabuhan sama-kapal lain (hanya bila primary bukan same_line), manual = pilihan user.
  pick?: 'primary' | 'next' | 'alternative' | 'manual' | null
}
export interface CostAgentInvoiceLine {
  id: number
  invoice_id: number
  line_no: number
  description_raw: string
  cost_item_id: number | null
  cost_item_code: string | null
  cost_item_name: string | null
  match_method: string | null
  qty: number | null
  unit: string | null
  unit_price: number | null
  amount: number
  gl_account: string | null
  compare_flag: CostAgentCompareFlag | null
  compare_level: CostAgentMatchLevel | null
  compare_ref_amount: number | null
  compare_diff_pct: number | null
  remark: string | null
  include_in_history: boolean // sql/065: selalu true (semua baris masuk history saat approve; checkbox "Ref" dihapus)
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  ref_history_id?: number | null // sql/057: pembanding manual (null = otomatis)
  compare_similarity?: number | null // sql/057: kemiripan teks vs pembanding terpakai 0..1
  compare_alt_amount?: number | null // sql/061: nominal pembanding alternatif (baris same_line di tempat lain)
  compare_check?: boolean | null // sql/061: alternatif beda > 5% dari pembanding utama -> perlu dicek manual
  // sql/084: pajak per baris (pecahan, mis. 0.11); null = belum dihitung. Dibaca toleran (RPC riwayat mungkin belum membawanya).
  ppn_rate?: number | null
  pph_type?: string | null
  pph_rate?: number | null
  tax_source?: 'rule' | 'manual' | null
  // sql/108: nominal baris sudah termasuk PPN? null = belum diputuskan, true = termasuk, false = di luar PPN. ppn_amount / pph_amount SUDAH dihitung server (UI tidak menghitung ulang).
  amount_includes_vat?: boolean | null
  ppn_amount?: number | null
  pph_amount?: number | null
  // sql/101 (aturan cost line per peran): hanya ada pada view 'full'. Versi ASLI maker (maker_*) terisi bila checker mengubah / memecah baris;
  // origin_line_id terisi pada bagian hasil split (menunjuk baris yang dipecah). Approver (view 'maker') tidak menerima kolom-kolom ini.
  origin_line_id?: number | null
  maker_description?: string | null
  maker_amount?: number | null
  maker_qty?: number | null
  maker_unit_price?: number | null
  is_validated?: boolean
  validated_by?: string | null
  validated_at?: string | null
  checker_remark?: string | null
  history: CostAgentLineHistory[]
}
// check_notes dari fn_cost_agent_ingest_invoice: {type, msg} -- type vendor_unknown | vessel_unknown | port_unknown |
// voyage_unmatched | duplicate | total_mismatch | (v2) susulan_mismatch | vessel_fuzzy. msg Indonesia TIDAK ditampilkan (noteText).
export interface CostAgentCheckNote { type?: string; msg?: string; message?: string; [k: string]: unknown }
export interface CostAgentInvoice {
  id: number
  status: CostAgentInvoiceStatus
  source: string
  company_code: string | null
  vendor_id: number | null
  vessel_id: number | null
  port_id: number | null
  voyage_id: number | null
  voyage_call_id: number | null
  vendor_name: string | null
  vessel_name: string | null
  vessel_dwt: number | null
  vessel_type: string | null
  port_code: string | null
  port_name: string | null
  vendor_name_raw: string | null
  vessel_name_raw: string | null
  port_name_raw: string | null
  voyage_no_raw: string | null
  invoice_no: string | null
  invoice_date: string | null
  service_date: string | null
  currency: string
  subtotal: number | null
  ppn: number | null
  pph: number | null
  materai: number | null // sql/071: informasi saja -- nilainya SUDAH ada sbg baris biaya (cost item MATERAI)
  ppn_not_collected?: number | null // sql/071: PPN "tidak dipungut" (informasi; sudah dikurangkan dari `ppn`)
  grand_total: number | null
  lines_total: number | null
  file_url: string | null
  file_name: string | null
  files: { file_name?: string; file_url?: string; drive_id?: string }[]
  check_notes: CostAgentCheckNote[]
  duplicate_of: number | null
  error_message: string | null
  uploaded_by: string | null
  submitted_by: string | null
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  paid_ref: string | null
  po_numbers?: string[] | null // versi 2
  // sql/064: keterangan invoice (mis. "BY. AGEN DLL DI BJM - MV. CEMTRANS VOY 12"), ikut ke history saat approve.
  // description_auto = true selama masih otomatis dari template (ikut vessel/port/voyage), false bila sudah diubah user.
  description?: string | null
  description_auto?: boolean | null
  voyage: Record<string, any> | null
  voyage_call: Record<string, any> | null
  created_at: string
  updated_at: string
}
export interface CostAgentApproval {
  id: number; invoice_id: number; round_no: number; step_no: number; approver_label: string; approver_emails: string[]
  approver_role: string | null; decision: CostAgentApprovalDecision; decided_by: string | null; decided_at: string | null
  note: string | null; created_at: string
}
export interface CostAgentTaxCheck {
  id: number; invoice_id: number; doc_type: string; status: CostAgentTaxStatus; file_url: string | null; file_name: string | null
  fp_number: string | null; fp_date: string | null; seller_name: string | null; seller_npwp: string | null
  buyer_name: string | null; buyer_npwp: string | null; dpp: number | null; ppn: number | null
  check_results: { field: string; expected: unknown; actual: unknown; ok: boolean }[]
  error_message: string | null; created_at: string
}
export interface CostAgentPaymentRequest {
  id: number; invoice_id: number; doc_type: CostAgentPaymentDocType; doc_no: string | null; amount: number
  pph_amount: number | null; due_date: string | null; bank_name: string | null; bank_account_name: string | null
  bank_account_no: string | null; description: string | null
  journal_lines: { gl_account: string; description?: string; debit?: number; credit?: number }[]
  status: CostAgentPaymentStatus; posted_ref: string | null; posted_at: string | null; response: unknown
  created_by: string | null; created_at: string
}
export interface CostAgentStatusLogRow {
  id: number; invoice_id: number; from_status: string | null; to_status: string; actor: string | null; note: string | null; created_at: string
}
// Versi 2 (dokumen susulan) -- tabel cost_agent_invoice_documents BELUM ADA di sql/054 yang disalin 2026-10-13.
export interface CostAgentInvoiceDocument {
  id: number; invoice_id: number; job_id: string; mode: 'invoice' | 'susulan'; seq: number; file_name: string | null
  file_url: string | null; doc_type: CostAgentDocType; status: CostAgentDocStatus; extracted: { summary?: string; [k: string]: unknown } | null
  tax_check_id: number | null; error_message: string | null; uploaded_by: string | null; created_at: string
}
export interface CostAgentInvoiceHistory {
  invoice: CostAgentInvoice
  lines: CostAgentInvoiceLine[]
  lines_view?: 'full' | 'maker' // sql/101: 'maker' = pengguna HANYA berperan approver (baris asli maker, tanpa split / kolom checker)
  approvals: CostAgentApproval[]
  tax_checks: CostAgentTaxCheck[]
  payments: CostAgentPaymentRequest[]
  timeline: CostAgentStatusLogRow[]
  documents?: CostAgentInvoiceDocument[] // versi 2
}
export interface CostAgentMatrixStep { step_no: number; approver_label: string; approver_emails: string[]; approver_role: string | null }

// ─── Query baca daftar (pagination server-side) ─────────────────────────────────────────────────────────────────
export interface CostAgentListParams {
  page: number // mulai 1
  pageSize: number
  search?: string
  searchCols?: string[]
  // Filter kesamaan sederhana; nilai kosong/null/'All' diabaikan. Array = `.in()`.
  eq?: Record<string, string | number | boolean | (string | number)[] | null | undefined>
  gte?: Record<string, string | number | null | undefined>
  lte?: Record<string, string | number | null | undefined>
  isNull?: string[] // kolom yang harus NULL (`.is(k, null)`)
  orderBy?: string
  ascending?: boolean
}

export async function fetchCostAgentList<T>(table: string, p: CostAgentListParams): Promise<{ rows: T[]; count: number }> {
  let q: any = supabase.from(table).select('*', { count: 'exact' })
  Object.entries(p.eq || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === 'All') return
    q = Array.isArray(v) ? (v.length ? q.in(k, v) : q) : q.eq(k, v)
  })
  Object.entries(p.gte || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q = q.gte(k, v) })
  Object.entries(p.lte || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q = q.lte(k, v) })
  ;(p.isNull || []).forEach(k => { q = q.is(k, null) })
  const term = (p.search || '').trim()
  if (term && p.searchCols?.length) q = q.or(p.searchCols.map(c => `${c}.ilike.%${orSafe(term)}%`).join(','))
  q = q.order(p.orderBy || 'updated_at', { ascending: !!p.ascending })
  if (p.orderBy !== 'id') q = q.order('id', { ascending: !!p.ascending })
  const from = (Math.max(1, p.page) - 1) * p.pageSize
  const { data, error, count } = await q.range(from, from + p.pageSize - 1)
  if (error) throw new Error(error.message)
  return { rows: (data || []) as T[], count: count ?? 0 }
}

export const COST_AGENT_VOYAGE_SEARCH_COLS = ['vessel_name', 'voyage_no', 'route', 'charter_type']
export const COST_AGENT_INVOICE_SEARCH_COLS = ['invoice_no', 'vendor_name', 'vessel_name', 'port_code', 'port_name', 'voyage_no']

export const fetchCostAgentVoyageList = (p: CostAgentListParams) =>
  fetchCostAgentList<CostAgentVoyageListRow>('cost_agent_voyage_list_v', { searchCols: COST_AGENT_VOYAGE_SEARCH_COLS, ...p })
export async function fetchCostAgentInvoiceList(p: CostAgentListParams) {
  const res = await fetchCostAgentList<CostAgentInvoiceListRow>('cost_agent_invoice_list_v', { searchCols: COST_AGENT_INVOICE_SEARCH_COLS, ...p })
  // sql/064: view list belum punya kolom `description` -> ambil dari cost_agent_invoices utk baris halaman ini saja.
  // Gagal (mis. kolom/hak) -> daftar tetap tampil tanpa keterangan.
  const missing = res.rows.filter(r => r.description === undefined).map(r => r.id)
  if (missing.length) {
    const { data, error } = await supabase.from('cost_agent_invoices').select('id, description').in('id', missing)
    if (error) console.warn('[CostAgent] keterangan invoice tidak terbaca:', error.message)
    else {
      const m = new Map((data || []).map((d: any) => [Number(d.id), d.description ?? null]))
      res.rows.forEach(r => { if (r.description === undefined) r.description = m.get(Number(r.id)) ?? null })
    }
  }
  return res
}

// Master utk dropdown/combobox (kecil; dibaca sekali per halaman).
async function selectAll<T>(table: string, cols: string, order: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(cols).order(order).limit(5000)
  if (error) throw new Error(error.message)
  return (data || []) as T[]
}
export const fetchCostAgentCompanies = () => selectAll<CostAgentCompany>('cost_agent_companies', 'code, name, npwp, is_active', 'code')
export const fetchCostAgentVessels = () =>
  selectAll<CostAgentVessel>('cost_agent_vessels', 'id, name, vessel_type, dwt, company_code, prefix, short_code, is_active', 'name')
export const fetchCostAgentPorts = () =>
  selectAll<CostAgentPort>('cost_agent_ports', 'id, code, name, aliases, tz, is_verified, province, lat, lon', 'code')
export const fetchCostAgentVendors = () => selectAll<CostAgentVendor>('cost_agent_vendors', 'id, name, npwp, is_active', 'name')
export const fetchCostAgentCostItems = () =>
  selectAll<CostAgentCostItem>('cost_agent_cost_items', 'id, code, name, category, gl_account, keywords, is_active', 'code')

// ─── Wrapper RPC (lempar Error dgn message Supabase -- pesan Indonesia dari RPC ditampilkan apa adanya) ─────────
export async function callCostAgentRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

// p_actor: dikirim email user (server memakai auth.email() bila ada).
export const costAgentGetVoyage = (voyageId: number) =>
  callCostAgentRpc<CostAgentVoyageDetail | null>('fn_cost_agent_get_voyage', { p_voyage_id: voyageId })
export const costAgentSaveVoyage = (voyage: CostAgentVoyagePayload, actor?: string | null) =>
  callCostAgentRpc<CostAgentSaveVoyageResult>('fn_cost_agent_save_voyage', { p_voyage: voyage, p_source: 'manual', p_actor: actor ?? null })
// sql/073 (2026-10-23): hapus voyage + port call/cargo/noon. Server menolak bila ada invoice terkait atau status closed.
export const costAgentDeleteVoyage = (voyageId: number, reason?: string | null) =>
  callCostAgentRpc<{ deleted: number; status: string; calls: number; cargo: number; noon_days: number }>('fn_cost_agent_delete_voyage', { p_voyage_id: voyageId, p_reason: reason ?? null })
export const costAgentUpsertVoyages =(rows: unknown[], actor?: string | null) =>
  callCostAgentRpc<CostAgentUpsertVoyagesResult>('fn_cost_agent_upsert_voyages', { p_rows: rows, p_source: 'import', p_actor: actor ?? null })
// Detail invoice = fn_cost_agent_get_invoice_history (header, history per baris, approval ...) + fn_cost_agent_get_invoice_lines (sql/101: baris MENURUT PERAN).
// Daftar baris yang dipakai UI selalu dari RPC kedua: approver (saja) menerima versi maker; baris dari RPC pertama tidak ada di versi itu dibuang (mergeLinesView).
// Gagal membaca baris -> error (tidak jatuh ke baris RPC pertama, supaya split checker tidak bocor ke approver).
export async function costAgentGetInvoiceHistory(invoiceId: number): Promise<CostAgentInvoiceHistory | null> {
  const [h, r] = await Promise.all([
    callCostAgentRpc<CostAgentInvoiceHistory | null>('fn_cost_agent_get_invoice_history', { p_invoice_id: invoiceId }),
    callCostAgentRpc<InvoiceLinesResponse>('fn_cost_agent_get_invoice_lines', { p_invoice_id: invoiceId }),
  ])
  return mergeLinesView(h, r)
}
// ─── Perbandingan dokumen (sql/072: fn_cost_agent_get_invoice_documents / fn_cost_agent_start_redo) ──────────────
export type DocCmpOverall = 'not_analysed' | 'incomplete' | 'attention' | 'ok'
export type DocCmpStatus = 'ok' | 'diff' | 'warn' | 'na'
export type DocCmpLineStatus = 'match' | 'match_group' | 'match_sum' | 'match_agg' | 'match_gross' | 'manual' | 'diff' | 'none' | 'no_doc' | 'not_in_fp' | 'pending' | 'not_required' | 'confirmed_none'
export interface DocCmpRef { part_id: number; item_id: number | null; doc_type: string | null; doc_no: string | null; description: string | null; group_name: string | null; kind: string | null; amount: number | null }
export interface DocCmpFile {
  id: number; seq: number | null; file_name: string | null; file_url: string | null; doc_type: CostAgentDocType | string; status: CostAgentDocStatus | string
  mode: string | null; job_id: string | null; analysis: 'analysed' | 'processing' | 'failed' | 'not_analysed' | string; analysis_error: string | null; created_at: string
}
export interface DocCmpPart {
  id: number; file_id: number | null; file_name: string | null; doc_type: string | null; is_tax_equivalent: boolean | null /* SQL 097: selalu false -- JANGAN dipakai utk tampilan; faktur pajak = doc_type faktur_pajak */; doc_no: string | null; doc_date: string | null
  issuer_name: string | null; buyer_name: string | null; vessel_name: string | null; total_amount: number | null; dpp: number | null; ppn: number | null; tax_status: string | null
  invoice_ref: string | null; dates: Record<string, string | null> | null; page_from: number | null; page_to: number | null; summary: string | null
  duplicate_of: number | null; items_n: number | null; items_sum: number | null
  stamp_duty?: number | null // nilai materai pada nota/FP (item MATERAI di nota tetap ada seperti biasa)
}
export interface DocCmpCompleteness {
  key: 'invoice' | 'attachment' | 'tax_invoice' | 'receipt' | 'po' | string; label: string; required: boolean
  status: 'present' | 'missing' | 'pending' | 'not_required' | string; docs: { doc_no: string | null; doc_date: string | null; doc_type: string | null; part_id: number | null }[] | null
}
export interface DocCmpHeaderCheck { group: 'tax' | 'attachment' | string; part_id: number | null; field: string; invoice_value: string | number | null; doc_value: string | number | null; status: DocCmpStatus | string; note?: string | null }
export interface DocCmpDateCheck { part_id: number | null; source: string | null; doc_no: string | null; label: string; date: string | null; compare_to: string | null; gap_days: number | null; status: DocCmpStatus | string; note: string | null }
// match_gross = nominal baris invoice = harga jual + PPN (+ materai) sebuah nota/faktur pajak, atau item-item nota beserta PPN-nya.
// `matched_amount` = nominal baris itu sendiri (sudah termasuk PPN, JANGAN dijumlahkan ulang dari refs); `base` = bagian harga jual sebelum PPN; `note` = rincian teks.
// SQL 109: status 'manual' = ditautkan manual oleh user; `manual` memuat id item (cost_agent_invoice_doc_items), pelaku, waktu, alasan, dan incl (item + PPN). `diff` tetap diisi (tidak disembunyikan).
export interface DocCmpManualLink { ids: number[]; by: string; at: string; reason: string; incl: boolean }
// SQL 112: sisi lampiran memuat can_confirm_none (tombol "No attachment for this vendor") dan, bila status 'confirmed_none', confirmation {rule_id, by, at, note} + original_status ('none' | 'no_doc').
export interface DocCmpNoAttachConfirmation { rule_id: number | null; by?: string | null; at?: string | null; note?: string | null }
export interface DocCmpLineSide {
  status: DocCmpLineStatus | string; matched_amount: number | null; diff: number | null; refs: DocCmpRef[] | null; base?: number | null; note?: string | null; manual?: DocCmpManualLink | null
  can_confirm_none?: boolean; confirmation?: DocCmpNoAttachConfirmation | null; original_status?: string | null
}
// expect (SQL 093): dokumen yang DIHARAPKAN per baris -- attachment=false utk jenis biaya tanpa lampiran wajib; tax=true hanya bila baris kena PPN menurut tax rule. Tidak ada = data lama.
// SQL 107/108: includes_vat_hint = baris cocok dokumen sebagai harga + PPN (vat_rate = tarif pecahan yang dipakai, mis. 0.11 / null).
export interface DocCmpLine { line_id: number; line_no: number; description: string | null; cost_item: string | null; amount: number | null; attachment: DocCmpLineSide | null; tax: DocCmpLineSide | null; expect?: { attachment: boolean; tax: boolean } | null; includes_vat_hint?: boolean; vat_rate?: number | null }
export interface DocCmpOrphan { part_id: number; item_id: number | null; doc_type: string | null; doc_no: string | null; description: string | null; amount: number | null }
// SQL 098: item lampiran yang hanya BUKTI GANDA dari baris invoice yang sudah cocok (bukan orphan). `reason`: same_amount_as_line | total_of_document_items; `line_id` bisa null.
export interface DocCmpOrphanCovered extends DocCmpOrphan { reason: 'same_amount_as_line' | 'total_of_document_items' | string | null; line_id: number | null }
export interface DocCmpTaxTotals {
  fp_count: number | null; selling_price: number | null; covered_lines: number | null; dpp: number | null; ppn_collected: number | null; ppn_not_collected: number | null
  checks: { label: string; invoice_value: number | string | null; doc_value: number | string | null; diff: number | null; status: DocCmpStatus | string; note: string | null }[] | null
  rate_checks: { doc_no: string | null; rate_pct: number | null; status: DocCmpStatus | string; note: string | null }[] | null
}
// SQL 112: perbandingan tanggal tiba / berangkat + nama kapal lintas voyage report, invoice dan tiap dokumen (fn_cost_agent_trip_checks, kunci trip_checks). Server yang memutuskan status; UI hanya menampilkan.
export type TripSourceStatus = 'ref' | 'ok' | 'diff' | 'na' | 'missing' | 'not_linked'
export type TripFieldStatus = 'ok' | 'diff' | 'warn' | 'missing' | 'single' | 'na'
export interface TripSource {
  kind: 'voyage' | 'invoice' | 'document' | string; label: string; part_id?: number | null; doc_type: string | null; doc_no: string | null; file_name: string | null
  page: number | null; page_exact: boolean; page_from: number | null; page_to: number | null; location: string | null
  value: string | null; status: TripSourceStatus | string; gap_days: number | null; manual: boolean
}
export interface TripField {
  key: 'arrival' | 'departure' | 'vessel' | string; label: string; status: TripFieldStatus | string
  reference: { label: string | null; value: string | null } | null; spread_days: number | null; sources: TripSource[]
}
export interface DocCmpTripChecks {
  tolerance_days: number; voyage_linked: boolean; call_id: number | null
  summary: { diff: number; warn: number; missing: number }; fields: TripField[]
}
export interface CostAgentDocCompare {
  analysed: boolean
  trip_checks?: DocCmpTripChecks | null
  invoice?: Record<string, any> | null
  summary: { overall: DocCmpOverall; red_flags: number; attachment?: Record<string, number> | null; tax?: Record<string, number> | null } | null
  files: DocCmpFile[] | null
  parts: DocCmpPart[] | null
  completeness: DocCmpCompleteness[] | null
  header_checks: DocCmpHeaderCheck[] | null
  date_checks: DocCmpDateCheck[] | null
  lines: DocCmpLine[] | null
  orphans: { attachment: DocCmpOrphan[] | null; tax: DocCmpOrphan[] | null; attachment_covered?: DocCmpOrphanCovered[] | null } | null
  tax_totals: DocCmpTaxTotals | null
}
export const costAgentGetInvoiceDocuments = (invoiceId: number) =>
  callCostAgentRpc<CostAgentDocCompare | null>('fn_cost_agent_get_invoice_documents', { p_invoice_id: invoiceId })
// SQL 112: hanya checker / master yang boleh menambah jenis biaya baru. Keputusan SEPENUHNYA dari RPC ini (tanpa aturan peran di aplikasi); server tetap menolak 42501 bila dilanggar.
export const costAgentCanAddCostItem = () => callCostAgentRpc<boolean>('fn_cost_agent_can_add_cost_item', {})
// SQL 112: "vendor ini memang tanpa lampiran" per jenis biaya. Hasil confirm: { line_id, rule_id, already, validation_reset }.
export interface NoAttachConfirmResult { line_id: number; rule_id: number | null; already?: boolean; validation_reset?: boolean }
export const costAgentConfirmNoAttachment = (lineId: number, note: string) =>
  callCostAgentRpc<NoAttachConfirmResult>('fn_cost_agent_confirm_no_attachment', { p_line_id: lineId, p_note: note })
export const costAgentRevokeNoAttachment = (ruleId: number, reason: string) =>
  callCostAgentRpc<{ rule_id: number; revoked: boolean }>('fn_cost_agent_revoke_no_attachment', { p_rule_id: ruleId, p_reason: reason })
export interface NoAttachRule {
  id: number; vendor_id: number; vendor_name: string | null; cost_item_id: number; cost_item_code: string | null; cost_item_name: string | null
  note: string | null; is_active: boolean; confirmed_by: string | null; confirmed_at: string | null
  source_invoice_id: number | null; source_invoice_no: string | null; revoked_by: string | null; revoked_at: string | null; revoke_reason: string | null
}
export const costAgentListNoAttachmentRules = (a: { vendorId?: number | null; q?: string; includeRevoked?: boolean; limit?: number } = {}) =>
  callCostAgentRpc<NoAttachRule[] | null>('fn_cost_agent_list_no_attachment_rules', { p_vendor_id: a.vendorId ?? null, p_q: a.q?.trim() || null, p_include_revoked: !!a.includeRevoked, p_limit: a.limit ?? 200 })
// Analisis ulang: job baru (invoice, baris & status TIDAK berubah). Lanjutkan dgn `costAgentRedoDocs` (webhook n8n) lalu polling.
export const costAgentStartRedo = (invoiceId: number, actor?: string | null) =>
  callCostAgentRpc<{ job_id: string; invoice_id: number; files: number }>('fn_cost_agent_start_redo', { p_invoice_id: invoiceId, p_actor: actor ?? null })
export const costAgentUpdateInvoiceHeader = (a: {
  invoiceId: number; vendorId: number | null; vesselId: number | null; portId: number | null; voyageCallId: number | null
  companyCode: string | null; actor?: string | null
}) => callCostAgentRpc<void>('fn_cost_agent_update_invoice_header', {
  p_invoice_id: a.invoiceId, p_vendor_id: a.vendorId, p_vessel_id: a.vesselId, p_port_id: a.portId,
  p_voyage_call_id: a.voyageCallId, p_company_code: a.companyCode, p_actor: a.actor ?? null,
})
// sql/069: koreksi nominal header (status verification/rejected/failed). Server menghitung ulang grand total = subtotal + ppn - pph + materai
// dan mengembalikannya.
export const costAgentUpdateInvoiceAmounts = (a: { invoiceId: number; subtotal: number; ppn: number; pph: number; materai: number; actor?: string | null }) =>
  callCostAgentRpc<number>('fn_cost_agent_update_invoice_amounts', {
    p_invoice_id: a.invoiceId, p_subtotal: a.subtotal, p_ppn: a.ppn, p_pph: a.pph, p_materai: a.materai, p_actor: a.actor ?? null,
  })
// sql/064: ubah keterangan invoice (status verification/rejected/failed, canEdit cost_agent_invoice). '' = kembali otomatis.
// Server menyimpan huruf besar, maks 300 karakter; mengembalikan keterangan tersimpan.
export const COST_AGENT_DESCRIPTION_MAX = 300
export const costAgentSetInvoiceDescription = (invoiceId: number, description: string, actor?: string | null) =>
  callCostAgentRpc<string | null>('fn_cost_agent_set_invoice_description', { p_invoice_id: invoiceId, p_description: description, p_actor: actor ?? null })
// sql/065: p_include_in_history SELALU true (semua baris masuk history saat approve; "Use as reference" dihapus dari UI).
export const costAgentVerifyLine = (a: {
  lineId: number; costItemId: number | null; isVerified: boolean; remark?: string | null
  learnAlias: boolean; actor?: string | null
}) => callCostAgentRpc<void>('fn_cost_agent_verify_line', {
  p_line_id: a.lineId, p_cost_item_id: a.costItemId, p_is_verified: a.isVerified, p_remark: a.remark ?? null,
  p_include_in_history: true, p_learn_alias: a.learnAlias, p_actor: a.actor ?? null,
})
// sql/065: edit manual baris (status verification/rejected + canEdit cost_agent_invoice). Server: baris jadi BELUM verified,
// cost item dikenali ulang bila teks berubah (kecuali sudah dipilih manual), lines_total & compare dihitung ulang, dicatat di
// Timeline. Description wajib (maks 500), amount wajib; qty/unit price opsional. changed=false = tidak ada yang berubah.
export const COST_AGENT_LINE_DESCRIPTION_MAX = 500
export interface CostAgentUpdateLineResult { changed: boolean; changes?: string[] }
export const costAgentUpdateLine = (a: {
  lineId: number; description: string; qty: number | null; unitPrice: number | null; amount: number; actor?: string | null
}) => callCostAgentRpc<CostAgentUpdateLineResult>('fn_cost_agent_update_line', {
  p_line_id: a.lineId, p_description: a.description, p_qty: a.qty, p_unit_price: a.unitPrice, p_amount: a.amount,
  p_actor: a.actor ?? null,
})
export const costAgentAddCostItem = (a: {
  code: string; name: string; category: string; glAccount?: string | null; keywords?: string[]; actor?: string | null
}) => callCostAgentRpc<number>('fn_cost_agent_add_cost_item', {
  p_code: a.code, p_name: a.name, p_category: a.category, p_gl_account: a.glAccount ?? null,
  p_keywords: a.keywords ?? [], p_actor: a.actor ?? null,
})
// ─── History browser & vendor baru (sql/057, 2026-10-13) ────────────────────────────────────────────────────────
// Filter fn_cost_agent_search_history: minimal SATU dari cost_item_id/port_id/vessel_id/vendor_id (RPC error bila kosong).
export interface CostAgentHistoryFilter {
  cost_item_id?: number | null; port_id?: number | null; vessel_id?: number | null; vendor_id?: number | null
  q?: string | null; date_from?: string | null; date_to?: string | null; description?: string | null
  ref_date?: string | null // sql/058: 'YYYY-MM-DD' tgl invoice -> days_diff
  sort?: 'similarity' | 'date' | null // sql/058: Best match | Newest
}
export const hasHistoryMainFilter = (f: CostAgentHistoryFilter) => [f.cost_item_id, f.port_id, f.vessel_id, f.vendor_id].some(v => v != null)
export interface CostAgentHistorySearchRow {
  history_id: number; service_date: string; invoice_no: string | null; voyage_no: string | null; amount: number
  qty: number | null; unit_price: number | null; cost_item_code: string | null; cost_item_name: string | null
  vessel_name: string | null; vessel_dwt: number | null; port_code: string | null; port_name: string | null
  vendor_name: string | null; company_code: string | null; description_raw: string | null; invoice_description: string | null
  source: 'import' | 'app' | string; similarity: number | null
  line_match?: CostAgentLineMatch | null; days_diff?: number | null // sql/058
}
export interface CostAgentHistorySearchResult { rows: CostAgentHistorySearchRow[]; has_more: boolean; limit: number; offset: number; sort?: string }
export const costAgentSearchHistory = (filter: CostAgentHistoryFilter, limit = 20, offset = 0) => {
  // Kirim hanya key terisi (null / '' dibuang).
  const p = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ''))
  return callCostAgentRpc<CostAgentHistorySearchResult>('fn_cost_agent_search_history', { p_filter: p, p_limit: limit, p_offset: offset })
}
// Hanya status verification/rejected; historyId null = kembali ke pembanding otomatis. Flag compare dihitung ulang server.
export const costAgentSetLineReference = (lineId: number, historyId: number | null, actor?: string | null) =>
  callCostAgentRpc<void>('fn_cost_agent_set_line_reference', { p_line_id: lineId, p_history_id: historyId, p_actor: actor ?? null })
// Nama/alias/NPWP sudah ada -> server mengembalikan id vendor lama (tidak dobel).
export const costAgentAddVendor = (a: { name: string; npwp?: string | null; aliases?: string[]; actor?: string | null }) =>
  callCostAgentRpc<number>('fn_cost_agent_add_vendor', { p_name: a.name, p_npwp: a.npwp ?? null, p_aliases: a.aliases ?? [], p_actor: a.actor ?? null })
// Combobox vendor koreksi header: cari nama (ilike, maks 20) -- tidak memuat seluruh master.
export async function searchCostAgentVendors(term: string, limit = 20): Promise<CostAgentVendor[]> {
  let q: any = supabase.from('cost_agent_vendors').select('id, name, npwp, is_active').order('name').limit(limit)
  const t = term.trim()
  if (t) q = q.ilike('name', `%${t.replace(/[\\%_]/g, m => '\\' + m)}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []) as CostAgentVendor[]
}
// NPWP lama 15 digit -> "00.000.000.0-000.000" (input bebas, non-digit dibuang).
export function formatNpwp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 15)
  const parts: [number, string][] = [[2, '.'], [5, '.'], [8, '.'], [9, '-'], [12, '.']]
  let out = ''
  for (let i = 0; i < d.length; i++) { out += d[i]; const sep = parts.find(([n]) => n === i + 1); if (sep && i + 1 < d.length) out += sep[1] }
  return out
}

export const costAgentSubmitForApproval = (invoiceId: number, actor?: string | null) =>
  callCostAgentRpc<unknown>('fn_cost_agent_submit_for_approval', { p_invoice_id: invoiceId, p_actor: actor ?? null })
export const costAgentDecideApproval = (invoiceId: number, decision: 'approved' | 'rejected', note: string | null, actor?: string | null) =>
  callCostAgentRpc<unknown>('fn_cost_agent_decide_approval', { p_invoice_id: invoiceId, p_decision: decision, p_note: note, p_actor: actor ?? null })
// `office` (sql/079): 'MEDAN' | 'JAKARTA' | null. Aturan paling spesifik per step menang: vendor > office > PT > umum (dihitung server).
export const costAgentMatrixFor = (company: string | null, vendorId: number | null, amount: number, office: string | null = null) =>
  callCostAgentRpc<CostAgentMatrixStep[]>('fn_cost_agent_matrix_for', { p_company: company, p_vendor_id: vendorId, p_amount: amount, p_office: office })
export const costAgentCreatePaymentRequest = (invoiceId: number, docType: CostAgentPaymentDocType, data: Record<string, unknown>, actor?: string | null) =>
  callCostAgentRpc<number>('fn_cost_agent_create_payment_request', { p_invoice_id: invoiceId, p_doc_type: docType, p_data: data, p_actor: actor ?? null })
export const costAgentMarkPaid = (invoiceId: number, paidAt: string, paidRef: string, actor?: string | null) =>
  callCostAgentRpc<unknown>('fn_cost_agent_mark_paid', { p_invoice_id: invoiceId, p_paid_at: paidAt, p_paid_ref: paidRef, p_actor: actor ?? null })

// ─── Proxy n8n (server.ts) ──────────────────────────────────────────────────────────────────────────────────────
// Key localStorage override URL (diisi halaman Settings › Webhooks; kosong = env server).
export const COST_AGENT_WEBHOOK_STORAGE_KEYS = {
  cost_agent: 'n8n_cost_agent_webhook_url',
  cost_agent_voyage: 'n8n_cost_agent_voyage_webhook_url',
  cost_agent_noon: 'n8n_cost_agent_noon_webhook_url',
  cost_agent_voyage_pull: 'n8n_cost_agent_voyage_pull_url',
  cost_agent_payment: 'n8n_cost_agent_payment_url',
} as const
export type CostAgentWebhookType = keyof typeof COST_AGENT_WEBHOOK_STORAGE_KEYS

function webhookHeaders(type: CostAgentWebhookType): Record<string, string> {
  const h: Record<string, string> = { 'X-Webhook-Type': type }
  try {
    const custom = localStorage.getItem(COST_AGENT_WEBHOOK_STORAGE_KEYS[type])
    if (custom) h['X-Webhook-Url'] = custom
  } catch { /* localStorage tidak tersedia -> pakai env server */ }
  return h
}

async function readProxyResponse(res: Response): Promise<any> {
  const text = await res.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { data = { pesan: text } }
  if (!res.ok || data?.status === 'error') throw new Error(data?.pesan || data?.message || `Automation server error (HTTP ${res.status}).`)
  return data
}

// Upload multipart (invoice baru / dokumen susulan / voyage report). `meta` -> field `cost_agent_meta` (JSON, maks 4 KB);
// `uploaded_by` diisi server dari sesi login. Respons n8n dikembalikan apa adanya (mis. {job_id, invoice_id, mode}).
export async function costAgentUpload(type: 'cost_agent' | 'cost_agent_voyage' | 'cost_agent_noon', files: File[], meta: Record<string, unknown>): Promise<any> {
  const fd = new FormData()
  files.forEach((f, i) => fd.append('file_' + i, f))
  fd.append('cost_agent_meta', JSON.stringify(meta))
  const res = await apiFetch('/api/n8n-proxy-start', { method: 'POST', body: fd, headers: webhookHeaders(type) })
  return readProxyResponse(res)
}

// Analisis ulang dokumen (2026-10-23): proxy multipart TANPA file, cost_agent_meta {mode:'redo_docs', invoice_id, job_id} (job_id dari costAgentStartRedo).
export const costAgentRedoDocs = (invoiceId: number, jobId: string) =>
  costAgentUpload('cost_agent', [], { mode: 'redo_docs', invoice_id: invoiceId, job_id: jobId })

// Status job upload / analisis ulang (polling 5 dtk): dokumen per job_id + status invoice-nya. `done` = tidak ada dokumen 'processing' DAN tidak ada invoice 'processing'.
export interface CostAgentJobSnapshot {
  done: boolean
  invoiceIds: number[]
  docs: { invoice_id: number | null; status: string; error_message: string | null; file_name: string | null }[]
  invoices: { id: number; status: CostAgentInvoiceStatus }[]
}
export async function fetchCostAgentJobSnapshot(jobId: string, knownInvoiceIds: number[] = []): Promise<CostAgentJobSnapshot> {
  const { data: docs, error } = await supabase.from('cost_agent_invoice_documents').select('invoice_id, status, error_message, file_name').eq('job_id', jobId)
  if (error) throw new Error(error.message)
  const list = (docs || []) as CostAgentJobSnapshot['docs']
  const ids = Array.from(new Set([...knownInvoiceIds, ...list.map(d => d.invoice_id).filter((x): x is number => x != null).map(Number)]))
  let invoices: CostAgentJobSnapshot['invoices'] = []
  if (ids.length) {
    const { data: inv, error: e2 } = await supabase.from('cost_agent_invoices').select('id, status').in('id', ids)
    if (e2) throw new Error(e2.message)
    invoices = (inv || []).map((r: any) => ({ id: Number(r.id), status: r.status }))
  }
  const done = !list.some(d => d.status === 'processing') && !invoices.some(i => i.status === 'processing')
  return { done, invoiceIds: ids, docs: list, invoices }
}

// Aksi tanpa file (tarik voyage / posting pembayaran). `requested_by` diisi server.
export async function costAgentJsonAction(type: 'cost_agent_voyage_pull' | 'cost_agent_payment', body: Record<string, unknown>): Promise<any> {
  const res = await apiFetch('/api/n8n-proxy-json', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { ...webhookHeaders(type), 'Content-Type': 'application/json' },
  })
  return readProxyResponse(res)
}

// ─── Label & warna ──────────────────────────────────────────────────────────────────────────────────────────────
export const INVOICE_STATUS_META: Record<CostAgentInvoiceStatus, { label: string; tone: Tone }> = {
  processing: { label: 'Processing (AI)', tone: 'blue' },
  failed: { label: 'Failed', tone: 'red' },
  verification: { label: 'Verification', tone: 'amber' },
  waiting_approval: { label: 'Waiting Approval', tone: 'purple' },
  rejected: { label: 'Rejected', tone: 'red' },
  approved: { label: 'Approved', tone: 'green' },
  journal: { label: 'Journal (AP/PV)', tone: 'plum' },
  paid: { label: 'Paid', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
}
// Urutan tab status di halaman invoice.
export const INVOICE_STATUS_ORDER: CostAgentInvoiceStatus[] = ['processing', 'failed', 'verification', 'waiting_approval', 'rejected', 'approved', 'journal', 'paid']

export const VOYAGE_STATUS_META: Record<CostAgentVoyageStatus, { label: string; tone: Tone; hint?: string }> = {
  draft: { label: 'Draft', tone: 'amber', hint: 'Needs review' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  closed: { label: 'Closed', tone: 'grey' },
}
export const VOYAGE_SOURCE_LABEL: Record<CostAgentVoyageSource, string> = { manual: 'Manual', api: 'API', import: 'Import', ai: 'AI' }

export const ACTIVITY_LABEL: Record<CostAgentActivity, string> = {
  muat: 'Load', bongkar: 'Discharge', bongkar_muat: 'Load & Discharge', sts: 'STS', bunker: 'Bunker', docking: 'Docking', lainnya: 'Other',
}

// ─── Noon Report (2026-10-22) ───────────────────────────────────────────────────────────────────────────────────
// Respons webhook n8n `baca-noon-report-cost-agent` (via proxy cost_agent_noon). Teks warnings/reason/notes dari server berbahasa
// Indonesia -- ditampilkan apa adanya.
export interface CostAgentNoonUploadResult {
  ok?: boolean
  saved?: number
  days_saved?: number
  skipped_days?: number
  voyages?: {
    vessel_name?: string | null; voyage_no?: string | null; voyage_id?: number | null; call_id?: number | null; seq?: number | null
    activity?: string | null; status?: string | null; created_voyage?: boolean; days?: number | null
    warnings?: ({ msg?: string } | string)[] | null
  }[]
  errors?: ({ error?: string; voyage_no?: string | null; doc_no?: string | null; port?: string | null } | string)[]
  notes?: (string | { msg?: string })[]
  // sql/078: label BARU yang dipelajari AI pada kiriman ini + catatan AI (Indonesia, apa adanya). Anggap [] bila tidak ada.
  learned_labels?: { label?: string | null; field?: string | null; example_value?: string | null }[] | null
  ai_notes?: (string | { msg?: string })[] | null
  ai?: {
    summary?: { sheets?: number; saved_days?: number; calls?: number; skipped_days?: number }
    warnings?: ({ msg?: string } | string)[]
    skipped?: { date?: string; reason?: string; ai_review?: string | null }[]
  }
}
// Peringatan hasil penilaian AI atas hari ambigu ("Review AI (hanya peringatan) ..."): hanya peringatan, keputusan hari tidak diubah AI.
export const isAiReviewWarning = (w: unknown): boolean => typeof w === 'string' && /^\s*Review AI\b/i.test(w)

// ─── Label Noon Report hasil belajar AI (sql/078) ─────────────────────────────────────────────────────────────
// Tabel `cost_agent_noon_label_alias` / `cost_agent_noon_ai_cache` TIDAK dibaca client; hanya lewat 3 RPC di bawah.
export interface CostAgentNoonAlias {
  id: number; label_norm: string; field: string; source: 'ai' | 'manual' | string; active: boolean
  example_label: string | null; example_value: string | null; example_file: string | null
  seen_count: number | null; created_at: string | null; last_seen_at: string | null; changed_by: string | null; changed_at: string | null
}
export const costAgentNoonAliasList = async () => (await callCostAgentRpc<CostAgentNoonAlias[] | null>('fn_cost_agent_noon_alias_list', {})) || []
export const costAgentNoonAliasSetActive = (id: number, active: boolean) =>
  callCostAgentRpc<{ id: number; label_norm: string; field: string; active: boolean }>('fn_cost_agent_noon_alias_set_active', { p_id: id, p_active: active })
export const costAgentNoonAliasAdd = (label: string, field: string) =>
  callCostAgentRpc<{ id: number; label_norm: string; field: string; active: boolean; source: string }>('fn_cost_agent_noon_alias_add', { p_label: label, p_field: field })
// Nama field baku (persis nilai dari list/RPC) -> nama ramah. Yang tidak ada di sini ditampilkan apa adanya.
export const NOON_FIELD_LABEL: Record<string, string> = {
  'NOON POSITION REPORT OF': 'Vessel name', 'VOYAGE NUMBER': 'Voyage number', 'CURRENT LOCATION': 'Current location',
  LATITUDE: 'Latitude', LONGITUDE: 'Longitude', FROM: 'From', TO: 'To', 'STEAMING TIME': 'Steaming hours', 'DISTANCE TO RUN': 'Distance run',
  HSFO: 'HSFO (high-sulphur fuel oil)', LSFO: 'LSFO (low-sulphur fuel oil)', MDO: 'MDO (marine diesel oil)',
  LSMGO: 'LSMGO (low-sulphur marine gas oil)', HSD: 'HSD (high-speed diesel)', FW: 'Fresh water', LO: 'Lubricating oil',
}
export const noonFieldLabel = (field: string | null | undefined): string => (field ? NOON_FIELD_LABEL[field] || field : '—')
// Pilihan dropdown "Add label": urutan & nilai persis field baku yang dikenali n8n.
export const NOON_FIELD_OPTIONS: string[] = [
  'NOON POSITION REPORT OF', 'VOYAGE NUMBER', 'NAME OF MASTER', 'FROM', 'TO', 'CURRENT LOCATION', 'LATITUDE', 'LONGITUDE', 'COURSE',
  'DISTANCE TO RUN', 'TOTAL DISTANCE TO RUN', 'STEAMING TIME', 'TOTAL STEAMING TIME', 'AVERAGE SPEED', 'GENERAL AVERAGE SPEED',
  'DISTANCE TO GO', 'ETA DATE', 'RPM REV PER MINUTE', 'WEATHER CONDITION', 'HSFO', 'LSFO', 'MDO', 'LSMGO', 'HSD', 'FW', 'LO',
]
export const isNoonReportVoyage = (v: { input_source?: string | null; extra?: Record<string, any> | null } | null | undefined): boolean =>
  !!v && (v.input_source === 'noon_report' || v.extra?.input === 'noon_report')

export const COMPARE_FLAG_META: Record<CostAgentCompareFlag, { label: string; tone: Tone }> = {
  sesuai: { label: 'In line', tone: 'green' },
  naik: { label: 'Higher', tone: 'red' },
  turun: { label: 'Lower', tone: 'blue' },
  tanpa_history: { label: 'No history', tone: 'grey' },
  item_baru: { label: 'New item', tone: 'amber' },
}

// Jarak tanggal history vs invoice (sql/058 days_diff): "12 days before" / "5 days after" / "same day".
export function daysDiffLabel(d: number | null | undefined): string {
  if (d === null || d === undefined || isNaN(Number(d))) return ''
  const n = Math.round(Number(d))
  if (n === 0) return 'same day'
  const a = Math.abs(n)
  return `${a} day${a === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'}`
}

export function matchLevelLabel(level: CostAgentMatchLevel | null | undefined, h?: { dwt_diff?: number | null; distance_km?: number | null }): string {
  if (level === 'same_vessel_port') return 'Same vessel & port'
  // sql/058: nearest_dwt = pelabuhan sama, kapal DWT terdekat.
  if (level === 'nearest_dwt') return `Same port · nearest DWT${h?.dwt_diff != null ? ` (Δ ${fmtNumber(h.dwt_diff)})` : ''}`
  if (level === 'same_vessel') return 'Same vessel · other port'
  if (level === 'nearest_port') return `Nearest port (${fmtNumber(h?.distance_km ?? 0)} km)`
  if (level === 'manual') return 'Chosen by user'
  return 'No match'
}

export const DOC_TYPE_LABEL: Record<CostAgentDocType, string> = {
  unknown: 'Unknown', invoice: 'Invoice', faktur_pajak: 'Tax invoice (Faktur Pajak)', po: 'PO', kwitansi: 'Receipt (Kwitansi)',
  nota_pelabuhan: 'Port note', lampiran: 'Attachment', lainnya: 'Other',
}

export const TAX_STATUS_META: Record<CostAgentTaxStatus, { label: string; tone: Tone }> = {
  processing: { label: 'Checking', tone: 'blue' },
  match: { label: 'Match', tone: 'green' },
  mismatch: { label: 'Mismatch', tone: 'red' },
  error: { label: 'Error', tone: 'red' },
}

// ─── Formatter ──────────────────────────────────────────────────────────────────────────────────────────────────
const idNum = (maxFrac: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac })
const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
export const fmtNumber = (v: unknown, maxFrac = 2): string => { const n = toNumber(v); return n === null ? '—' : idNum(maxFrac).format(n) }
// Rupiah: titik ribuan, tanpa desimal ("Rp 1.250.000").
export const fmtRupiah = (v: unknown): string => { const n = toNumber(v); return n === null ? '—' : `Rp ${idNum(0).format(Math.round(n))}` }
// Nominal biaya keagenan (2026-10-23, sql/071): SELALU rupiah bulat TANPA desimal & tanpa pilihan mata uang -- sen sudah dibuang di database
// (format campuran USD / 2 desimal berisiko utk AP Note). `formatMoney` = nama di spesifikasi; `fmtMoney` dipertahankan (banyak pemanggil) dan
// parameter currency-nya DIABAIKAN. Format titik ribuan id-ID ("Rp 21.384.734") = SAMA seluruh aplikasi.
export const formatMoney = (v: unknown): string => fmtRupiah(v)
export const fmtMoney = (v: unknown, _currency?: string): string => formatMoney(v)
// Liter (cargo L15): titik ribuan.
export const fmtLiter = (v: unknown, unit = 'L'): string => { const n = toNumber(v); return n === null ? '—' : `${idNum(3).format(n)} ${unit}` }
export const fmtPct = (v: unknown): string => { const n = toNumber(v); return n === null ? '—' : `${n > 0 ? '+' : ''}${idNum(1).format(n)}%` }

// Singkatan zona waktu Indonesia (laporan voyage memakai LT = jam lokal pelabuhan).
const TZ_ABBR: Record<string, string> = {
  'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Ujung_Pandang': 'WITA', 'Asia/Jayapura': 'WIT',
}
export const tzAbbrev = (tz?: string | null): string => (tz ? TZ_ABBR[tz] || tz : 'WIB')

const partsIn = (iso: string, tz: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour'), mm: g('minute') }
}

// Nama bulan sendiri (Intl en-GB di Chrome/Node menulis "Sept") -- format tetap "06 Sep 2026".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Tampilan "06 Sep 2026 08:00 WITA" dlm zona pelabuhan.
export function fmtDateTimePort(iso: string | null | undefined, tz?: string | null, withZone = true): string {
  if (!iso) return '—'
  const zone = tz || 'Asia/Jakarta'
  const p = partsIn(iso, zone)
  if (!p) return String(iso)
  const s = `${p.d} ${MON[Number(p.m) - 1]} ${p.y} ${p.hh}:${p.mm}`
  return withZone ? `${s} ${tzAbbrev(zone)}` : s
}
// Ringkas utk tabel daftar: "06 Sep 20:00" (tanpa tahun & zona; tampilkan zona terpisah / tooltip pakai fmtDateTimePort).
export function fmtDateTimeCompact(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return '—'
  const p = partsIn(iso, tz || 'Asia/Jakarta')
  return p ? `${p.d} ${MON[Number(p.m) - 1]} ${p.hh}:${p.mm}` : String(iso)
}
// Tanggal saja ("06 Sep 2026"), utk kolom date (invoice_date, report_month dsb) -- tidak digeser zona.
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : String(v)
}
export function fmtReportMonth(v: string | null | undefined): string {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})/.exec(v)
  return m ? `${MON[Number(m[2]) - 1]} ${m[1]}` : String(v)
}

// timestamptz dari DB -> nilai <input type="datetime-local"> dlm jam lokal pelabuhan ("YYYY-MM-DDTHH:mm").
export function toPortLocalInput(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return ''
  const p = partsIn(iso, tz || 'Asia/Jakarta')
  return p ? `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}` : ''
}
// Nilai input datetime-local -> format RPC "YYYY-MM-DD HH:mm" (jam lokal pelabuhan, TANPA offset; server yg mengonversi).
export function fromLocalInput(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v)
  return m ? `${m[1]} ${m[2]}` : null
}
// Durasi jam ("36.5 h") utk handling/port stay.
export const fmtHours = (v: unknown): string => { const n = toNumber(v); return n === null ? '—' : `${idNum(1).format(n)} h` }

// ─── Util form voyage ───────────────────────────────────────────────────────────────────────────────────────────
export const COST_AGENT_PRODUCTS = ['B50', 'PERTALITE', 'SOLAR', 'PERTAMAX', 'AVTUR', 'SEMEN CURAH']
export const COST_AGENT_CARGO_UNITS = ['L15', 'MT', 'KL', 'BBL']
export const COST_AGENT_CHARTER_TYPES = ['COA', 'TC', 'SPOT']
export const COST_AGENT_ACTIVITIES: CostAgentActivity[] = ['muat', 'bongkar', 'bongkar_muat', 'sts', 'bunker', 'docking', 'lainnya']
// Aktivitas yg dihitung "bongkar" di laporan bulanan / pilihan Discharge port cargo.
export const isDischargeActivity = (a: string) => a === 'bongkar' || a === 'bongkar_muat' || a === 'sts'

// Qty cargo dari input bebas: "3.751.843" (id-ID), "3,751,843" (Excel), "3751843.5" -> number | null.
export function parseQtyInput(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = v.trim().replace(/\s+/g, '')
  if (!s) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// <input type="month"> ("2026-09") <-> report_month ("2026-09-01").
export const monthToReportMonth = (m: string | null | undefined): string | null => (m && /^\d{4}-\d{2}/.test(m) ? `${m.slice(0, 7)}-01` : null)
export const reportMonthToMonth = (v: string | null | undefined): string => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : '')
export const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Selisih jam antara 2 waktu lokal pelabuhan yg SAMA zonanya ("YYYY-MM-DDTHH:mm") -- utk handling / port stay live di form.
export function diffLocalHours(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const a = new Date(from.replace(' ', 'T')).getTime()
  const b = new Date(to.replace(' ', 'T')).getTime()
  if (isNaN(a) || isNaN(b)) return null
  return Math.round(((b - a) / 3600000) * 100) / 100
}

// Kode pelabuhan per hop dari kolom `route` view ("BLW → LSM → SAB").
export const routePorts = (route: string | null | undefined): string[] =>
  (route || '').split('→').map(s => s.trim()).filter(Boolean)

// ─── Util halaman Agency Invoices (Prompt 3) ────────────────────────────────────────────────────────────────────
// Status yg bisa dikoreksi user (header & baris) -- SAMA guard RPC update_invoice_header / verify_line.
export const isInvoiceEditable = (st: string | null | undefined) => st === 'verification' || st === 'rejected'
// Dokumen susulan boleh dikirim di semua status kecuali processing / cancelled.
export const canUploadSupporting = (st: string | null | undefined) => !!st && st !== 'processing' && st !== 'cancelled'

// Teks alert check_notes: src/utils/CostAgentNotes.ts noteText() (2026-10-16; CHECK_NOTE_LABEL + msg Indonesia tidak dipakai lagi).

// Label cara baris dicocokkan ke cost item (`match_method`, sql/063). Metode lain -> tidak diberi label.
export const MATCH_METHOD_LABEL: Record<string, string> = {
  keyword_synonym: 'Keyword (typo/synonym)',
  history: 'Similar past line',
  alias_pattern: 'Learned alias',
}

// Jumlah invoice per status (tab) -- head count per status, filter sama daftar (tanpa filter status).
export async function fetchCostAgentInvoiceStatusCounts(f: { company?: string; search?: string }): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await Promise.all(INVOICE_STATUS_ORDER.map(async st => {
    let q: any = supabase.from('cost_agent_invoice_list_v').select('id', { count: 'exact', head: true }).eq('status', st)
    if (f.company) q = q.eq('company_code', f.company)
    const term = (f.search || '').trim()
    if (term) q = q.or(COST_AGENT_INVOICE_SEARCH_COLS.map(c => `${c}.ilike.%${orSafe(term)}%`).join(','))
    const { count, error } = await q
    if (!error) out[st] = count ?? 0
  }))
  return out
}

// error_message invoice failed (view daftar tidak membawa kolom ini).
export async function fetchCostAgentInvoiceErrors(ids: number[]): Promise<Record<number, string | null>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('cost_agent_invoices').select('id, error_message').in('id', ids)
  if (error) return {}
  return Object.fromEntries((data || []).map((r: any) => [r.id, r.error_message]))
}

// Pilihan port call utk upload / koreksi header: "MT. EXPO · Voy 5 · LSM (06 Sep)". Embed FK PostgREST.
export interface CostAgentCallOption {
  id: number; voyage_id: number; seq: number; arrived_at: string | null; departed_at: string | null
  port_id: number; port_code: string; port_name: string; port_tz: string
  voyage_no: string; report_month: string | null; company_code: string | null; vessel_id: number; vessel_name: string
}
const CALL_SELECT = 'id, voyage_id, seq, arrived_at, departed_at, port_id, port:cost_agent_ports(code, name, tz), voyage:cost_agent_voyages(voyage_no, report_month, company_code, vessel_id, vessel:cost_agent_vessels(name))'
const toCallOption = (r: any): CostAgentCallOption => ({
  id: r.id, voyage_id: r.voyage_id, seq: r.seq, arrived_at: r.arrived_at, departed_at: r.departed_at, port_id: r.port_id,
  port_code: r.port?.code || '', port_name: r.port?.name || '', port_tz: r.port?.tz || 'Asia/Jakarta',
  voyage_no: r.voyage?.voyage_no || '', report_month: r.voyage?.report_month || null, company_code: r.voyage?.company_code || null,
  vessel_id: r.voyage?.vessel_id, vessel_name: r.voyage?.vessel?.name || '',
})
export async function fetchCostAgentCallOptions(f: { vesselId?: number | null; ids?: number[]; limit?: number } = {}): Promise<CostAgentCallOption[]> {
  // Filter kapal di server: embed voyage `!inner` + eq kolom embed.
  const select = f.vesselId ? CALL_SELECT.replace('voyage:cost_agent_voyages(', 'voyage:cost_agent_voyages!inner(') : CALL_SELECT
  let q: any = supabase.from('cost_agent_voyage_calls').select(select)
  if (f.vesselId) q = q.eq('voyage.vessel_id', f.vesselId)
  if (f.ids?.length) q = q.in('id', f.ids)
  else q = q.order('arrived_at', { ascending: false, nullsFirst: false }).limit(f.limit ?? 400)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []).map(toCallOption)
}
export const callOptionLabel = (c: CostAgentCallOption) => {
  const d = c.arrived_at ? fmtDateTimePort(c.arrived_at, c.port_tz, false).slice(0, 6) : null
  return `${c.vessel_name} · Voy ${c.voyage_no} · ${c.port_code}${d ? ` (${d})` : ''}`
}

// Dokumen per job (versi 2: tabel cost_agent_invoice_documents). null = tabel belum ada / tidak bisa dibaca.
export async function fetchCostAgentDocumentsByJob(jobId: string): Promise<CostAgentInvoiceDocument[] | null> {
  const { data, error } = await supabase.from('cost_agent_invoice_documents').select('*').eq('job_id', jobId)
  if (error) return null
  return (data || []) as CostAgentInvoiceDocument[]
}

// Link Google Drive -> URL embed /preview (iframe). null = bukan link Drive yg dikenal (tampilkan tombol buka saja).
export function drivePreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(url) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url)
  return m && /google\.com/.test(url) ? `https://drive.google.com/file/d/${m[1]}/preview` : null
}

// Batas file upload (selaras server.ts: 50 MB/file, 30 file).
export const COST_AGENT_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
export const COST_AGENT_MAX_FILE_BYTES = 50 * 1024 * 1024
export const COST_AGENT_MAX_FILES = 30
export const fmtFileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// ─── Approval (Prompt 4) ────────────────────────────────────────────────────────────────────────────────────────
// Event badge sidebar "My Approvals" (pola *_CHANGED_EVENT modul lain).
export const COST_AGENT_APPROVALS_CHANGED_EVENT = 'beehive:cost-agent-approvals-changed'
export const notifyCostAgentApprovalsChanged = () => {
  try { window.dispatchEvent(new Event(COST_AGENT_APPROVALS_CHANGED_EVENT)) } catch { /* abaikan */ }
}

// Step aktif 1 invoice = step pending TERENDAH di round TERAKHIR (sama urutan fn_cost_agent_decide_approval).
export function activeApprovalStep(approvals: CostAgentApproval[]): CostAgentApproval | null {
  if (!approvals.length) return null
  const round = Math.max(...approvals.map(a => a.round_no))
  return approvals.filter(a => a.round_no === round && a.decision === 'pending').sort((a, b) => a.step_no - b.step_no)[0] || null
}
export const isApproverOf = (step: CostAgentApproval | null, email: string | null | undefined) =>
  !!step && !!email && (step.approver_emails || []).some(e => e.toLowerCase() === email.toLowerCase())

// Invoice waiting_approval yg step aktifnya memuat email user. Server tetap mengecek email (decide_approval).
export async function fetchMyApprovalInvoiceIds(email: string | null | undefined): Promise<number[]> {
  if (!email) return []
  const variants = [...new Set([email, email.toLowerCase()])]
  const { data: mine, error } = await supabase.from('cost_agent_approvals').select('invoice_id')
    .eq('decision', 'pending').overlaps('approver_emails', variants).limit(2000)
  if (error) throw new Error(error.message)
  const ids = [...new Set((mine || []).map((r: any) => Number(r.invoice_id)))]
  if (!ids.length) return []
  const [{ data: all, error: e2 }, { data: inv, error: e3 }] = await Promise.all([
    supabase.from('cost_agent_approvals').select('*').in('invoice_id', ids),
    supabase.from('cost_agent_invoices').select('id').in('id', ids).eq('status', 'waiting_approval'),
  ])
  if (e2) throw new Error(e2.message)
  if (e3) throw new Error(e3.message)
  const byInv = new Map<number, CostAgentApproval[]>()
  ;(all || []).forEach((a: any) => byInv.set(Number(a.invoice_id), [...(byInv.get(Number(a.invoice_id)) || []), a]))
  const waiting = new Set((inv || []).map((r: any) => Number(r.id)))
  return ids.filter(id => waiting.has(id) && isApproverOf(activeApprovalStep(byInv.get(id) || []), email))
}

// Approval matrix: CRUD langsung tabel (RLS has_edit_access('cost_agent_approval_matrix')).
export type CostAgentMatrixInput = Omit<CostAgentApprovalMatrixRow, 'id' | 'created_at' | 'updated_at'>
export async function fetchCostAgentApprovalMatrix(): Promise<CostAgentApprovalMatrixRow[]> {
  const { data, error } = await supabase.from('cost_agent_approval_matrix').select('*')
    .order('company_code', { ascending: true, nullsFirst: true }).order('vendor_id', { ascending: true, nullsFirst: true })
    .order('min_amount').order('step_no')
  if (error) throw new Error(error.message)
  return (data || []) as CostAgentApprovalMatrixRow[]
}
export async function saveCostAgentMatrixRule(id: number | null, row: CostAgentMatrixInput): Promise<void> {
  const payload = { ...row, updated_at: new Date().toISOString() }
  const { error } = id === null
    ? await supabase.from('cost_agent_approval_matrix').insert(payload)
    : await supabase.from('cost_agent_approval_matrix').update(payload).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteCostAgentMatrixRule(id: number): Promise<void> {
  const { error } = await supabase.from('cost_agent_approval_matrix').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Rentang nominal yg TIDAK tertutup aturan aktif umum (vendor kosong) utk 1 company (null = aturan "all companies" saja).
// Aturan per vendor tidak dihitung menutup (hanya berlaku utk vendor itu). Submit invoice di celah ini akan gagal.
// Nominal dianggap rupiah bulat: celah dihitung dgn presisi 1 (min > max sebelumnya + 1 = ada celah).
// `office` (sql/079): undefined/null = hanya aturan TANPA office (perilaku lama); 'MEDAN'/'JAKARTA' = aturan umum + aturan office itu (aturan tanpa office ikut menutup semua office).
export function matrixCoverageGaps(rules: CostAgentApprovalMatrixRow[], company: string | null, office?: string | null): { from: number; to: number | null }[] {
  const ranges = rules
    .filter(r => r.is_active && r.vendor_id === null && (r.company_code === null || r.company_code === company)
      && ((r.office ?? null) === null || (office != null && r.office === office)))
    .map(r => ({ min: Number(r.min_amount || 0), max: r.max_amount === null ? null : Number(r.max_amount) }))
    .sort((a, b) => a.min - b.min)
  const gaps: { from: number; to: number | null }[] = []
  let next = 0 // nilai terkecil yg belum tertutup
  for (const r of ranges) {
    if (r.min > next) gaps.push({ from: next, to: r.min })
    if (r.max === null) return gaps
    next = Math.max(next, r.max + 1)
  }
  gaps.push({ from: next, to: null })
  return gaps
}

// Nominal ringkas utk ladder ("50M", "1.5B", "250K").
export function fmtShortAmount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '∞'
  const n = Number(v)
  const f = (x: number) => idNum(1).format(x)
  if (Math.abs(n) >= 1e9) return `${f(n / 1e9)}B`
  if (Math.abs(n) >= 1e6) return `${f(n / 1e6)}M`
  if (Math.abs(n) >= 1e3) return `${f(n / 1e3)}K`
  return f(n)
}

// Email user aplikasi utk autocomplete approver (profiles; RLS bisa membatasi -> kembalikan yg terbaca saja).
export async function fetchAppUserEmails(): Promise<{ email: string; name: string | null }[]> {
  const { data, error } = await supabase.from('profiles').select('email, nama').not('email', 'is', null).order('email').limit(2000)
  if (error) return []
  return (data || []).map((r: any) => ({ email: String(r.email), name: r.nama ?? null }))
}

// ─── Payment (Prompt 5) ─────────────────────────────────────────────────────────────────────────────────────────
// Akun GL default jurnal AP Note / PV. AP vendor / VAT in / WHT payable SENGAJA KOSONG -- WAJIB dikonfirmasi Finance.
// Bisa diisi lewat tabel cost_agent_settings (key gl_ap_vendor / gl_vat_in / gl_wht_payable / gl_stamp_duty, value
// string JSON mis. '"21010"') tanpa ubah kode. Stamp duty default 61030 = GL cost item MATERAI di seed sql/055.
export const COST_AGENT_GL_DEFAULTS = { ap_vendor: '', vat_in: '', wht_payable: '', stamp_duty: '61030' }
export type CostAgentGlAccounts = typeof COST_AGENT_GL_DEFAULTS
export async function fetchCostAgentGlAccounts(): Promise<CostAgentGlAccounts> {
  const out = { ...COST_AGENT_GL_DEFAULTS }
  const { data } = await supabase.from('cost_agent_settings').select('key, value').in('key', ['gl_ap_vendor', 'gl_vat_in', 'gl_wht_payable', 'gl_stamp_duty'])
  ;(data || []).forEach((r: any) => {
    const v = r.value === null || r.value === undefined ? '' : String(r.value)
    if (!v) return
    if (r.key === 'gl_ap_vendor') out.ap_vendor = v
    if (r.key === 'gl_vat_in') out.vat_in = v
    if (r.key === 'gl_wht_payable') out.wht_payable = v
    if (r.key === 'gl_stamp_duty') out.stamp_duty = v
  })
  return out
}
export interface CostAgentJournalLine { gl_account: string; description: string; debit: number; credit: number }

// Saran rekening vendor terakhir (per browser) -- kenyamanan saja, bukan sumber data.
export type CostAgentVendorBank = { bank_name: string; bank_account_name: string; bank_account_no: string }
const BANK_KEY = 'cost_agent_vendor_bank'
export function loadVendorBank(vendorKey: string | number | null | undefined): CostAgentVendorBank | null {
  if (vendorKey === null || vendorKey === undefined) return null
  try { return (JSON.parse(localStorage.getItem(BANK_KEY) || '{}') as Record<string, CostAgentVendorBank>)[String(vendorKey)] || null } catch { return null }
}
export function saveVendorBank(vendorKey: string | number | null | undefined, bank: CostAgentVendorBank) {
  if (vendorKey === null || vendorKey === undefined) return
  try {
    const all = JSON.parse(localStorage.getItem(BANK_KEY) || '{}')
    all[String(vendorKey)] = bank
    localStorage.setItem(BANK_KEY, JSON.stringify(all))
  } catch { /* abaikan */ }
}
export const PAYMENT_STATUS_META: Record<CostAgentPaymentStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' }, submitted: { label: 'Sent — waiting posting', tone: 'blue' },
  posted: { label: 'Posted', tone: 'green' }, failed: { label: 'Failed', tone: 'red' }, paid: { label: 'Paid', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
}

// ─── Hapus invoice (masa uji coba, sql/056) ─────────────────────────────────────────────────────────────────────
// Admin saja; status journal / paid tidak bisa (sudah diposting ke finance). Anak invoice ikut terhapus (FK cascade).
export const canDeleteInvoice = (st: string | null | undefined) => !!st && st !== 'journal' && st !== 'paid'
export const costAgentDeleteInvoice = (invoiceId: number, reason?: string | null) =>
  callCostAgentRpc<{ deleted: number; status: string; history_rows_removed: number }>('fn_cost_agent_delete_invoice', { p_invoice_id: invoiceId, p_reason: reason ?? null })
