// AUTO-SEED dari scan src/ 2026-10-19 (.from('tabel').<op> / .rpc('nama') statis). Nama dinamis (variabel) di
// SharedDataTable/CostAgentHelpers/VendorMasterPage dll TIDAK tertangkap scan -> dilengkapi dari log gateway mode 'log'
// ([DB-GW] UNLISTED ...) sebelum mode 'enforce' dinyalakan.
export type DbOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export const TABLE_WHITELIST: Record<string, DbOp[]> = {
  accounting_rekap_finance: ['delete', 'select', 'update'],
  audit_po_ap_comp: ['delete', 'insert', 'select', 'update'],
  audit_po_apovs_comp: ['delete', 'insert', 'select', 'update'],
  audit_po_pi_local_comp: ['delete', 'insert', 'select', 'update'],
  audit_trail: ['insert', 'select'],
  bunker_dokumen: ['delete', 'select', 'update'],
  bunker_processing_queue: ['delete', 'select'],
  cost_agent_approval_matrix: ['delete', 'insert', 'select', 'update'],
  cost_agent_approvals: ['select'],
  cost_agent_invoice_documents: ['select'],
  cost_agent_invoice_list_v: ['select'],
  cost_agent_invoices: ['select'],
  cost_agent_settings: ['select'],
  cost_agent_vendors: ['select'],
  cost_agent_voyage_calls: ['select'],
  cost_validasi_catatan_seaair: ['delete', 'select', 'upsert'],
  cost_validasi_far_overseas_air: ['select'],
  cost_validasi_seaair: ['select'],
  courier_checklist_doc_log: ['select'],
  courier_vendor_master: ['select'],
  dokumen_checklist: ['insert', 'select', 'update'],
  dokumen_checklist_seaair: ['delete', 'select'],
  dokumen_validasi: ['select'],
  dokumen_validasi_matriks_seaair: ['select'],
  dokumen_validasi_seaair: ['delete'],
  far_overseas_air_processing_queue: ['delete', 'select'],
  far_overseas_memo_log: ['select'],
  far_overseas_signer_config: ['select'],
  far_overseas_step_signers: ['select'],
  far_overseas_tarif_quotation: ['select'],
  far_overseas_tarif_quotation_detail: ['select'],
  far_overseas_vendor_master: ['select'],
  kurs_bi_seaair: ['delete', 'select', 'update'],
  kurs_rule_vendor_seaair: ['select'],
  master_vessel: ['delete', 'insert', 'select', 'update'],
  profiles: ['select', 'update'],
  rekapan_courier: ['insert', 'select', 'update'],
  rekapan_far_overseas_air: ['select'],
  rekapan_seaair: ['delete', 'select', 'update'],
  reporting_cost_allocation: ['delete', 'insert', 'select'],
  role_page_access: ['delete', 'insert', 'select', 'update'],
  roles: ['delete', 'insert', 'select'],
  seaair_form_e_note: ['delete', 'select', 'upsert'],
  seaair_vendor_master: ['select'],
  tabel_audit_cn: ['select'],
  tabel_audit_pib: ['select'],
  tabel_audit_seaair: ['select', 'update'],
  tabel_checklist_validasi: ['insert', 'select', 'update'],
  tabel_cost_validasi: ['select', 'update'],
  tabel_fuel_surcharge: ['delete', 'insert', 'select'],
  tabel_npwp: ['delete', 'insert', 'select', 'update'],
  tabel_ppjk_cost_rule: ['delete', 'insert', 'select', 'update'],
  tabel_processing_queue: ['delete', 'select', 'update'],
  tabel_rate_sheet_dhl: ['delete', 'insert', 'select', 'update'],
  tabel_rate_sheet_fedex: ['delete', 'insert', 'select', 'update'],
  tabel_rate_sheet_ups: ['delete', 'insert', 'select', 'update'],
  tabel_surcharge_dhl: ['delete', 'insert', 'select', 'update'],
  tabel_surcharge_fedex: ['delete', 'insert', 'select', 'update'],
  tabel_surcharge_rule: ['delete', 'insert', 'select', 'update'],
  tabel_zone_mapping: ['delete', 'insert', 'select', 'update'],
  table_column_order: ['select', 'upsert'],
  tarif_kontrak_seaair: ['select', 'upsert'],
  user_approval_tiers: ['delete', 'select', 'upsert'],
  // Penunjuk tanda tangan terbaru per user (sql/083) -- DITULIS hanya lewat RPC fn_set_my_signature.
  user_signatures: ['select'],
  user_roles: ['delete', 'insert', 'select'],
  v_audit_trail: ['select'],
};

export const RPC_WHITELIST = new Set<string>([
  'approve_far_overseas_air',
  'fn_apply_credit_note',
  'fn_audit_trail_users',
  'fn_courier_finance_accept',
  'fn_courier_finance_mark_paid',
  'fn_courier_finance_undo_receive',
  'fn_courier_recap_awb_page',
  'fn_courier_recap_summary',
  'fn_courier_unlock_submit',
  'fn_delete_far_overseas_air',
  'fn_far_overseas_can_sign',
  'fn_far_overseas_confirm_ai_finding',
  'fn_far_overseas_finance_accept',
  'fn_far_overseas_finance_undo_receive',
  'fn_far_overseas_log_reminder',
  'fn_far_overseas_mark_paid',
  'fn_far_overseas_prepared_by_blockers',
  'fn_far_overseas_set_urgent',
  'fn_far_overseas_unconfirm_ai_finding',
  'fn_far_overseas_undo_last_sign',
  'fn_hitung_storage',
  'fn_recompute_totals',
  'fn_reporting_courier_distinct',
  'fn_reporting_distinct_pt',
  'fn_reporting_kategori_stats',
  'fn_revise_credit_note',
  'fn_save_storage_estimate',
  'fn_seaair_finance_accept',
  'fn_seaair_finance_mark_paid',
  'fn_seaair_finance_undo_receive',
  'fn_seaair_reread_from_ai',
  'fn_seaair_unlock_submit',
  'fn_set_user_divisi',
  'fn_ubah_awb_seaair',
  'fn_update_actual_value',
  'fn_user_activity',
  'fn_user_heartbeat',
  'get_kurs_efektif',
  'get_my_access',
  'get_my_approval_tiers',
  'get_my_column_access',
  'get_users_with_approval_tier',
  'hapus_far_overseas_tarif_quotation_detail',
  'insert_rekapan_far_overseas_manual',
  'insert_seaair_row',
  'nonaktifkan_far_overseas_tarif_quotation',
  'nonaktifkan_tarif_kontrak',
  'reject_far_overseas_air',
  'update_cost_validasi_far_overseas_manual',
  'update_cost_validasi_manual',
  'update_rekapan_far_overseas_manual',
  'update_rekapan_po_vessel',
  'update_seaair_row',
  'update_validasi_matriks_manual',
  'upsert_far_overseas_tarif_quotation',
  'upsert_far_overseas_tarif_quotation_detail',
  'upsert_far_overseas_vendor_master',
  'upsert_kurs_bi',
  'upsert_kurs_rule_vendor',
]);

// ── Tambahan MANUAL: nama tabel/RPC DINAMIS (variabel) yang terbukti dipakai kode -- digabung ke daftar di atas. ──
const MANUAL_TABLES: Record<string, DbOp[]> = {
  // SharedDataTable (Courier/Sea & Air audit & recap, buat/ubah/hapus baris)
  tabel_audit_pib: ['select', 'insert', 'update', 'delete'],
  tabel_audit_cn: ['select', 'insert', 'update', 'delete'],
  tabel_audit_seaair: ['select', 'insert', 'update', 'delete'],
  rekapan_courier: ['select', 'insert', 'update', 'delete'],
  rekapan_seaair: ['select', 'insert', 'update', 'delete'],
  dokumen_validasi: ['select', 'update', 'delete'],
  v_audit_trail: ['select'],
  // CourierCostReviewHelpers
  cost_validasi_review_courier: ['select', 'upsert', 'delete'],
  cost_validasi_review_courier_item: ['select', 'upsert', 'delete'],
  // VendorMasterPage (config.table)
  courier_vendor_master: ['select', 'insert', 'update'],
  seaair_vendor_master: ['select', 'insert', 'update'],
  // CostAgentHelpers (master & view lookup)
  cost_agent_companies: ['select'],
  cost_agent_cost_items: ['select'],
  cost_agent_ports: ['select'],
  cost_agent_vendor_bank: ['select'],
  cost_agent_vessels: ['select'],
  cost_agent_voyage_list_v: ['select'],
  // Wajib ganti password (sql/066) -- AuthContext membaca penanda milik sendiri
  user_security: ['select'],
  // Sea & Air panel Vendor payments (goods): baca ringan blocker_count utk gate Submit to Finance (2026-10-20)
  seaair_vp_hasil: ['select'],
};
for (const [t, ops] of Object.entries(MANUAL_TABLES)) {
  TABLE_WHITELIST[t] = [...new Set([...(TABLE_WHITELIST[t] ?? []), ...ops])];
}

[
  // Courier (SharedDataTable rpcName dinamis)
  'fn_archive_pib', 'fn_archive_cn', 'fn_delete_pib', 'fn_delete_cn', 'fn_undraft_pib', 'fn_undraft_cn',
  // Sea & Air / Compare Doc / Reporting
  'fn_seaair_recap_issue_count', 'fn_reporting_vendor_stats',
  // Cost Agent (CostAgentHelpers `rpc(fn)` dinamis)
  'fn_cost_agent_add_cost_item', 'fn_cost_agent_add_vendor', 'fn_cost_agent_create_payment_request',
  'fn_cost_agent_decide_approval', 'fn_cost_agent_delete_invoice', 'fn_cost_agent_delete_voyage', 'fn_cost_agent_get_invoice_documents', 'fn_cost_agent_get_invoice_history',
  'fn_cost_agent_get_voyage', 'fn_cost_agent_mark_paid', 'fn_cost_agent_matrix_for', 'fn_cost_agent_save_voyage',
  'fn_cost_agent_search_history', 'fn_cost_agent_set_invoice_description', 'fn_cost_agent_start_redo', 'fn_cost_agent_set_line_reference',
  'fn_cost_agent_submit_for_approval', 'fn_cost_agent_update_invoice_amounts', 'fn_cost_agent_update_invoice_header', 'fn_cost_agent_update_line',
  'fn_cost_agent_upsert_voyages', 'fn_cost_agent_verify_line',
  // Cost Agent Settings (hub, sql/076/077/079): master data, dashboard, history, cost items
  'fn_cost_agent_dashboard', 'fn_cost_agent_browse_history', 'fn_cost_agent_set_history_active',
  'fn_cost_agent_list_vessels', 'fn_cost_agent_save_vessel', 'fn_cost_agent_set_vessels_office', 'fn_cost_agent_merge_vessels', 'fn_cost_agent_delete_vessel',
  'fn_cost_agent_list_cost_items', 'fn_cost_agent_save_cost_item', 'fn_cost_agent_rename_category', 'fn_cost_agent_test_classify',
  'fn_cost_agent_list_aliases', 'fn_cost_agent_update_alias', 'fn_cost_agent_delete_alias', 'fn_cost_agent_reclassify_open_lines',
  'fn_cost_agent_list_vendors', 'fn_cost_agent_save_vendor', 'fn_cost_agent_merge_vendors', 'fn_cost_agent_delete_vendor',
  'fn_cost_agent_list_ports', 'fn_cost_agent_save_port', 'fn_cost_agent_set_ports_verified', 'fn_cost_agent_merge_ports', 'fn_cost_agent_delete_port',
  'fn_cost_agent_list_companies', 'fn_cost_agent_save_company', 'fn_cost_agent_list_master_log',
  // Cost Agent: label hasil belajar AI Noon Report (sql/078)
  'fn_cost_agent_noon_alias_list', 'fn_cost_agent_noon_alias_set_active', 'fn_cost_agent_noon_alias_add',
  // Admin: tandai/lepas wajib ganti password (sql/066) & reset password user (sql/067)
  'fn_set_must_change_password', 'fn_admin_reset_user_password',
  // Finance Handover Courier: undo Paid (sql/068)
  'fn_courier_finance_undo_paid',
  // Sea & Air panel Vendor payments (goods) (2026-10-20): ambil hasil + 5 aksi
  'fn_vp_ambil_seaair', 'fn_vp_tambah_bukti_seaair', 'fn_vp_hapus_bukti_seaair', 'fn_vp_konfirmasi_ref_seaair',
  'fn_vp_terima_review_seaair', 'fn_vp_batal_terima_seaair',
  // Tanda tangan per user (sql/083): simpan / hapus penunjuk tanda tangan milik sendiri
  'fn_set_my_signature',
].forEach(r => RPC_WHITELIST.add(r));

// Bucket Storage yang boleh diakses lewat gateway (FarOverseasAirDocumentsModal: download + signed URL bukti bayar).
export const STORAGE_BUCKET_WHITELIST = new Set<string>(['far-overseas-payment-proofs', 'user-signatures']);
// Bucket yang boleh di-UPLOAD lewat gateway (POST/PUT object/<bucket>/<path>) -- tanda tangan user (sql/083, halaman Account); kebijakan Storage membatasi ke folder sendiri.
export const STORAGE_UPLOAD_BUCKET_WHITELIST = new Set<string>(['user-signatures']);
