// Master vendor Sea & Air (PPJK) — /settings/seaair-vendors, page_key `settings_seaair_vendors` (2026-10-01).
// Tabel `seaair_vendor_master` (sql/035): kode seperti di rekapan_seaair.emkl_vendor -> nama legal lengkap
// + TOP (hari). Dipakai Finance Handover: "Payable to" = nama lengkap PPJK, due date = tanggal submit +
// TOP (kosong = default 14 hari). Tulis langsung .insert/.update ke tabel (RLS has_edit_access, bukan RPC).
import React, { useEffect, useMemo, useState } from 'react'
import { Building2, Plus, Search, Pencil, X, Check } from 'lucide-react'
import Greeting from '../components/Greeting'
import { LoadingTableRow } from '../components/LoadingState'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DEFAULT_SEAAIR_TOP_DAYS } from '../utils/FinanceHandoverHelpers'

type Row = { id: string; vendor_code: string; legal_name: string | null; top_days: number | null; aktif: boolean; notes: string | null }
type Draft = { vendor_code: string; legal_name: string; top_days: string; aktif: boolean; notes: string }

const inputCls = 'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#5A305A]'
const toDraft = (r?: Row): Draft => ({ vendor_code: r?.vendor_code || '', legal_name: r?.legal_name || '', top_days: r?.top_days == null ? '' : String(r.top_days), aktif: r?.aktif ?? true, notes: r?.notes || '' })

export default function SeaAirVendorMasterPage() {
  const { canEdit, user } = useAuth()
  const editable = canEdit('settings_seaair_vendors')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(toDraft())
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  useEffect(() => { document.title = 'Sea & Air Vendors · BeeHive' }, [])

  const load = async () => {
    setError(null)
    const { data, error: e } = await supabase.from('seaair_vendor_master').select('id, vendor_code, legal_name, top_days, aktif, notes').order('vendor_code')
    if (e) { setError(e.message); setRows([]); return }
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows || []).filter(r => !q || r.vendor_code.toLowerCase().includes(q) || (r.legal_name || '').toLowerCase().includes(q))
  }, [rows, search])
  const missingName = (rows || []).filter(r => r.aktif && !r.legal_name?.trim()).length

  const startEdit = (r?: Row) => { setEditId(r ? r.id : 'new'); setDraft(toDraft(r)); setFormErr(null) }
  const save = async () => {
    const code = draft.vendor_code.trim().toUpperCase()
    if (!code) { setFormErr('Vendor code is required.'); return }
    const top = draft.top_days.trim() === '' ? null : Number(draft.top_days)
    if (top !== null && (!Number.isInteger(top) || top < 0 || top > 365)) { setFormErr('TOP must be a whole number of days (0–365).'); return }
    const payload = { vendor_code: code, legal_name: draft.legal_name.trim() || null, top_days: top, aktif: draft.aktif, notes: draft.notes.trim() || null, updated_at: new Date().toISOString(), updated_by: user?.email || null }
    setSaving(true)
    const res = editId === 'new'
      ? await supabase.from('seaair_vendor_master').insert(payload)
      : await supabase.from('seaair_vendor_master').update(payload).eq('id', editId)
    setSaving(false)
    if (res.error) { setFormErr(/duplicate|unique/i.test(res.error.message) ? `Vendor code ${code} already exists.` : res.error.message); return }
    setEditId(null)
    load()
  }

  const editRow = (
    <tr className="bg-[#FBF7F4] border-b border-slate-100">
      <td className="px-3 py-2"><input aria-label="Vendor code" value={draft.vendor_code} onChange={e => setDraft(d => ({ ...d, vendor_code: e.target.value }))} className={`${inputCls} uppercase`} placeholder="AKSI" /></td>
      <td className="px-3 py-2"><input aria-label="Full legal name" value={draft.legal_name} onChange={e => setDraft(d => ({ ...d, legal_name: e.target.value }))} className={inputCls} placeholder="PT. ANEKA KREASI SELARAS INDONESIA" /></td>
      <td className="px-3 py-2"><input aria-label="TOP days" type="number" min={0} max={365} value={draft.top_days} onChange={e => setDraft(d => ({ ...d, top_days: e.target.value }))} className={`${inputCls} text-right`} placeholder={String(DEFAULT_SEAAIR_TOP_DAYS)} /></td>
      <td className="px-3 py-2 text-center"><input aria-label="Active" type="checkbox" checked={draft.aktif} onChange={e => setDraft(d => ({ ...d, aktif: e.target.checked }))} className="accent-[#5A305A]" /></td>
      <td className="px-3 py-2"><input aria-label="Notes" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} className={inputCls} /></td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={save} disabled={saving} aria-label="Save" className="p-2 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white disabled:opacity-50"><Check size={14} /></button>
          <button type="button" onClick={() => setEditId(null)} aria-label="Cancel" className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><X size={14} /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0"><Building2 size={17} /></div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">Sea &amp; Air Vendors</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">PPJK full legal name and payment term (TOP) used by Finance Handover</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-3 pt-2 pb-8 flex flex-col gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-nowrap items-center gap-3 overflow-x-auto">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name..." aria-label="Search" className={`${inputCls} pl-8`} />
          </div>
          {missingName > 0 && <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">{missingName} active vendor{missingName === 1 ? '' : 's'} without full name</span>}
          {editable && (
            <button type="button" onClick={() => startEdit()} disabled={editId !== null} className="ml-auto inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white text-sm font-semibold disabled:opacity-50 whitespace-nowrap"><Plus size={14} /> Add vendor</button>
          )}
        </div>
        {formErr && <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">{formErr}</div>}
        {error && <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">Failed to load vendors: {error} (has sql/035 been run?)</div>}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left w-[120px]">Code</th>
                <th className="px-3 py-2.5 text-left">Full legal name</th>
                <th className="px-3 py-2.5 text-right w-[110px]">TOP (days)</th>
                <th className="px-3 py-2.5 text-center w-[70px]">Active</th>
                <th className="px-3 py-2.5 text-left w-[180px]">Notes</th>
                <th className="px-3 py-2.5 w-[90px]" />
              </tr>
            </thead>
            <tbody>
              {editId === 'new' && editRow}
              {rows === null ? <LoadingTableRow colSpan={6} /> : filtered.length === 0 && editId !== 'new' ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No vendors yet.</td></tr>
              ) : filtered.map(r => editId === r.id ? <React.Fragment key={r.id}>{editRow}</React.Fragment> : (
                <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2.5 font-bold text-[#3B1B3D]">{r.vendor_code}</td>
                  <td className="px-3 py-2.5">{r.legal_name || <span className="text-amber-700 text-xs font-semibold">Not set — Finance Handover shows the code</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.top_days ?? <span className="text-slate-400">{DEFAULT_SEAAIR_TOP_DAYS} (default)</span>}</td>
                  <td className="px-3 py-2.5 text-center">{r.aktif ? 'Yes' : <span className="text-slate-400">No</span>}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{r.notes || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    {editable && <button type="button" onClick={() => startEdit(r)} disabled={editId !== null} aria-label={`Edit ${r.vendor_code}`} className="p-2 rounded-lg border border-slate-200 text-[#5A305A] hover:bg-slate-50 disabled:opacity-40"><Pencil size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
