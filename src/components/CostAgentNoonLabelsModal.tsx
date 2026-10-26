// Dialog "Noon Report labels" (2026-10-26, sql/078). Label judul/kata di template Noon Report yang tidak dikenal kode n8n dipetakan AI saat
// template baru pertama kali diunggah, lalu DISIMPAN (alias). Di sini orang bisa meninjau, mematikan (tidak dipakai & tidak dipelajari ulang) dan
// menambah label manual. Data HANYA lewat 3 RPC (list / set_active / add); tabel alias tidak dibaca client. Berlaku pada upload berikutnya.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Sparkles, UserRound, AlertTriangle } from 'lucide-react'
import { CostAgentModal, FieldLabel } from './CostAgentUi'
import { Chip, SA_BTN_OUTLINE, SA_BTN_PRIMARY, SA_INPUT } from './SeaAirAuditUi'
import { LoadingSpinner } from './LoadingState'
import {
  costAgentNoonAliasList, costAgentNoonAliasSetActive, costAgentNoonAliasAdd, fmtDateTimePort, noonFieldLabel, NOON_FIELD_OPTIONS,
  type CostAgentNoonAlias,
} from '../utils/CostAgentHelpers'

const TH = 'px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E5E70] whitespace-nowrap bg-[#FBF7F4] border-b border-[#EADFD6] sticky top-0 z-[1]'
const TD = 'px-2.5 py-2 text-[12px] text-[#3B1B3D] align-top'

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-[#17663D]' : 'bg-[#CFC3CF]'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function CostAgentNoonLabelsModal({ onClose, onToast }: {
  onClose: () => void
  onToast: (msg: string, tone?: 'ok' | 'warn') => void
}) {
  const [rows, setRows] = useState<CostAgentNoonAlias[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState<CostAgentNoonAlias | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [label, setLabel] = useState('')
  const [field, setField] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setRows(await costAgentNoonAliasList()); setLoadError(null) }
    catch (e: any) { setLoadError(e.message || String(e)); setRows(prev => prev ?? []) }
  }, [])
  useEffect(() => { load() }, [load])

  // Optimistic: ubah di layar dulu, kembalikan + toast bila RPC gagal.
  const setActive = async (row: CostAgentNoonAlias, active: boolean) => {
    const apply = (v: boolean) => setRows(rs => (rs || []).map(r => (r.id === row.id ? { ...r, active: v } : r)))
    apply(active)
    try {
      await costAgentNoonAliasSetActive(row.id, active)
    } catch (e: any) {
      apply(!active)
      onToast(e.message || String(e), 'warn')
    }
  }
  const onSwitch = (row: CostAgentNoonAlias) => {
    if (row.active) setConfirmOff(row)
    else setActive(row, true)
  }

  const add = async () => {
    if (adding) return
    if (!label.trim() || !field) { setAddError('Enter the label and choose what it means.'); return }
    setAdding(true); setAddError(null)
    try {
      await costAgentNoonAliasAdd(label.trim(), field)
      setLabel(''); setField(''); setShowAdd(false)
      onToast('Label added — it is recognised from the next upload.')
      await load()
    } catch (e: any) {
      setAddError(e.message || String(e)) // pesan server apa adanya (mis. label tidak valid)
    } finally {
      setAdding(false)
    }
  }

  return (
    <CostAgentModal maxWidth="max-w-5xl" z="z-[80]" onClose={onClose} title="Noon Report labels"
      subtitle="Labels the system did not know are mapped by AI the first time a new template is uploaded. Turn a label off if it was mapped wrongly. Changes apply to the next upload."
      footer={<button type="button" className={SA_BTN_OUTLINE} onClick={onClose}>Close</button>}>
      <div className="p-5 space-y-3" data-noon-labels>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[12px] text-[#6E5E70]">{rows ? `${rows.length} learned label${rows.length === 1 ? '' : 's'}` : ' '}</p>
          <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setShowAdd(v => !v); setAddError(null) }} aria-expanded={showAdd} data-add-label-toggle><Plus size={13} /> Add label</button>
        </div>

        {showAdd && (
          <div className="rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-3 space-y-2" data-add-label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><FieldLabel required>Label as written</FieldLabel>
                <input className={SA_INPUT} value={label} onChange={e => setLabel(e.target.value)} disabled={adding} placeholder="e.g. NO. PELAYARAN" maxLength={120}
                  onKeyDown={e => { if (e.key === 'Enter') add() }} /></div>
              <div><FieldLabel required>Meaning</FieldLabel>
                <select className={SA_INPUT} value={field} onChange={e => setField(e.target.value)} disabled={adding}>
                  <option value="">Choose…</option>
                  {NOON_FIELD_OPTIONS.map(f => <option key={f} value={f}>{noonFieldLabel(f)}</option>)}
                </select></div>
            </div>
            {addError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12px] text-[#A8231A]" role="alert">{addError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={SA_BTN_OUTLINE} onClick={() => { setShowAdd(false); setAddError(null) }} disabled={adding}>Cancel</button>
              <button type="button" className={SA_BTN_PRIMARY} onClick={add} disabled={adding || !label.trim() || !field}>{adding ? 'Adding…' : 'Add label'}</button>
            </div>
          </div>
        )}

        {confirmOff && (
          <div className="rounded-xl border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2.5 text-[12.5px] text-[#7A4F00] flex items-center gap-3 flex-wrap" role="alertdialog" data-confirm-off>
            <AlertTriangle size={15} className="shrink-0" />
            <span className="min-w-0 flex-1"><b>{confirmOff.example_label || confirmOff.label_norm}</b> — This label will no longer be recognised. The AI will not suggest it again.</span>
            <button type="button" className={SA_BTN_OUTLINE} onClick={() => setConfirmOff(null)}>Cancel</button>
            <button type="button" className={SA_BTN_PRIMARY} onClick={() => { const r = confirmOff; setConfirmOff(null); setActive(r, false) }}>Turn off</button>
          </div>
        )}

        {loadError && <div className="rounded-lg border border-[#F4C3BC] bg-[#FDE7E4] px-3 py-2 text-[12.5px] text-[#A8231A]">{loadError}</div>}
        {rows === null && <div className="py-8 flex justify-center"><LoadingSpinner /></div>}
        {rows !== null && rows.length === 0 && !loadError && (
          <p className="py-8 text-center text-[12.5px] text-[#8A7A8B]" data-noon-labels-empty>No learned labels yet. Built-in labels are always recognised.</p>
        )}
        {rows !== null && rows.length > 0 && (
          <div className="rounded-lg border border-[#EADFD6] overflow-auto max-h-[55vh]">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className={TH}>Label as written</th><th className={TH}>Meaning</th><th className={TH}>Example value</th><th className={TH}>Source</th>
                  <th className={`${TH} text-right`}>Seen</th><th className={TH}>Last seen</th><th className={`${TH} text-center`}>Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-t border-[#F3EEEA] ${r.active ? '' : 'bg-[#FAF8F7] text-[#8A7A8B]'}`} data-alias-row={r.id} data-active={r.active ? 'true' : 'false'}>
                    <td className={`${TD} font-semibold [overflow-wrap:anywhere]`} title={r.example_file ? `First seen in ${r.example_file}` : undefined}>{r.example_label || r.label_norm}</td>
                    <td className={TD}>{noonFieldLabel(r.field)}</td>
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{r.example_value || '—'}</td>
                    <td className={TD}>{r.source === 'ai'
                      ? <Chip tone="purple"><Sparkles size={10} className="mr-0.5" />AI</Chip>
                      : <Chip tone="grey"><UserRound size={10} className="mr-0.5" />Manual</Chip>}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.seen_count ?? '—'}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtDateTimePort(r.last_seen_at, null, false)}</td>
                    <td className={`${TD} text-center`}><Switch on={r.active} onClick={() => onSwitch(r)} label={r.active ? 'Active — click to turn off' : 'Off — click to turn on'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CostAgentModal>
  )
}
