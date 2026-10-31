// Bagian "Vendors without attachments" di tab Vendors hub Cost Agent Settings (SQL 112, 2026-10-31): daftar vendor + jenis biaya yang sudah dikonfirmasi maker di sebuah invoice sebagai
// "memang tidak pernah mengirim lampiran" (fn_cost_agent_list_no_attachment_rules). Invoice berikutnya dari vendor + jenis biaya itu dikenali otomatis. Hak lihat = hak halaman hub;
// tombol Revoke hanya bila ctx.editable (server tetap memutuskan siapa boleh: checker / master / pembuat konfirmasi, pesan error tampil apa adanya).
import { useEffect, useState } from 'react'
import { FilterSearch } from '../../../components/CostAgentUi'
import { RevokeNoAttachmentDialog } from '../../../components/CostAgentNoAttachmentDialogs'
import { Chip, SA_CARD } from '../../../components/SeaAirAuditUi'
import { costAgentListNoAttachmentRules, fmtDateTimePort, fmtNumber, type NoAttachRule } from '../../../utils/CostAgentHelpers'
import { FILTER_SEARCH, StateRow, TD, TH, ICON_BTN_DANGER, useAsync, useDebounced, type HubCtx } from './hubUi'

const COLS = 8

export default function NoAttachmentRulesSection({ ctx }: { ctx: HubCtx }) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [revoked, setRevoked] = useState(false)
  const { data, loading, error, reload } = useAsync(() => costAgentListNoAttachmentRules({ q, includeRevoked: revoked }), [q, revoked])
  const rows = data ?? []
  const [revokeFor, setRevokeFor] = useState<NoAttachRule | null>(null)
  useEffect(() => { setRevokeFor(null) }, [q, revoked])

  return (
    <section className={`${SA_CARD} overflow-hidden`} data-no-attachment-rules>
      <div className="px-4 py-3 border-b border-[#EADFD6] space-y-2.5">
        <div>
          <h3 className="text-[14px] font-bold text-[#3B1B3D]">Vendors without attachments</h3>
          <p className="text-[12px] text-[#6E5E70]">Cost lines for which a vendor never sends an attachment. Confirmed by the maker on an invoice; recognised automatically on later invoices.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className={FILTER_SEARCH}><FilterSearch value={search} onChange={setSearch} placeholder="Vendor / cost item…" /></div>
          <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#3B1B3D] cursor-pointer select-none">
            <input type="checkbox" className="accent-[#6B3470]" checked={revoked} onChange={e => setRevoked(e.target.checked)} data-show-revoked /> Show revoked
          </label>
          <span className="ml-auto text-[12px] text-[#6E5E70] tabular-nums">{data ? `${fmtNumber(rows.length, 0)} confirmation${rows.length === 1 ? '' : 's'}` : ''}</span>
        </div>
      </div>
      <div className="overflow-x-auto [&_tbody_tr:hover]:bg-[#FBF7F4] max-h-[26rem] overflow-y-auto">
        <table className="min-w-full">
          <thead><tr>{['Vendor', 'Cost item', 'Note', 'Confirmed by', 'Confirmed at', 'From invoice', 'Status', ''].map(h => <th key={h || 'actions'} className={`${TH} sticky top-0 z-[1]`}>{h}</th>)}</tr></thead>
          <tbody>
            <StateRow colSpan={COLS} loading={loading} error={error} onRetry={reload} empty={rows.length === 0} emptyText="No confirmations yet." />
            {!loading && !error && rows.map(r => (
              <tr key={r.id} className={`border-t border-[#F3EEEA] ${r.is_active ? '' : 'opacity-70 bg-[#FAF8F7]'}`} data-no-attachment-row={r.id}>
                <td className={`${TD} font-semibold min-w-[160px] [overflow-wrap:anywhere]`}>{r.vendor_name ?? `Vendor #${r.vendor_id}`}</td>
                <td className={`${TD} min-w-[160px] [overflow-wrap:anywhere]`}>{r.cost_item_name ?? `Cost item #${r.cost_item_id}`}{r.cost_item_code && <div className="font-mono text-[10.5px] text-[#6E5E70]">{r.cost_item_code}</div>}</td>
                <td className={`${TD} min-w-[180px] max-w-[280px] [overflow-wrap:anywhere]`}>{r.note || <span className="text-[#8A7A8B]">—</span>}</td>
                <td className={`${TD} [overflow-wrap:anywhere]`}>{r.confirmed_by || '—'}</td>
                <td className={`${TD} whitespace-nowrap`}>{fmtDateTimePort(r.confirmed_at, null, false)}</td>
                <td className={`${TD} [overflow-wrap:anywhere]`}>{r.source_invoice_no || <span className="text-[#8A7A8B]">—</span>}</td>
                <td className={TD}>
                  {r.is_active ? <Chip tone="green">Active</Chip>
                    : <span title={[r.revoke_reason, r.revoked_by && `by ${r.revoked_by}`, r.revoked_at && fmtDateTimePort(r.revoked_at, null, false)].filter(Boolean).join(' · ') || undefined}><Chip tone="grey">Revoked</Chip></span>}
                  {!r.is_active && r.revoke_reason && <div className="mt-0.5 text-[10.5px] text-[#8A7A8B] [overflow-wrap:anywhere]">{r.revoke_reason}</div>}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {ctx.editable && r.is_active && <button type="button" className={ICON_BTN_DANGER} onClick={() => setRevokeFor(r)} data-revoke-rule={r.id}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {revokeFor && <RevokeNoAttachmentDialog ruleId={revokeFor.id} what={`${revokeFor.vendor_name ?? 'this vendor'} · ${revokeFor.cost_item_name ?? revokeFor.cost_item_code ?? 'this cost'}`} onClose={() => setRevokeFor(null)}
        onDone={() => { setRevokeFor(null); ctx.toast('Confirmation revoked.'); reload() }} />}
    </section>
  )
}
