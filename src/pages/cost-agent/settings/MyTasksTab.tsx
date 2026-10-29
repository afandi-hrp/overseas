// Tab "My tasks" hub Cost Agent Settings (Tahap 2b, 2026-10-28, SQL 088) -- fn_cost_agent_my_tasks: tugas saya menurut role & giliran, dikelompokkan
// "To verify" (maker; tampil jumlah baris belum verified), "To validate" (checker), "To approve" (approver giliran saya). Klik invoice membuka detailnya.
// Dimuat ulang saat tab browser kembali aktif; badge jumlah di label tab dikirim lewat ctx.setMyTasks.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Chip, SA_BTN_OUTLINE } from '../../../components/SeaAirAuditUi'
import { fmtDateTimePort, fmtNumber } from '../../../utils/CostAgentHelpers'
import { costAgentMyTasks, type MyTask } from '../../../utils/CostAgentWorkflow'
import { StateRow, TD, TH, TableCard, useAsync, type HubCtx } from './hubUi'

const GROUPS: { task: MyTask['task']; title: string; hint: string }[] = [
  { task: 'verify', title: 'To verify', hint: 'Invoices in verification / returned to you' },
  { task: 'validate', title: 'To validate', hint: 'Waiting for checker validation' },
  { task: 'approve', title: 'To approve', hint: 'It is your turn in the approval steps' },
]

export default function MyTasksTab({ ctx }: { ctx: HubCtx }) {
  const tasks = useAsync(() => costAgentMyTasks(200), [])
  const rows = tasks.data ?? []
  const reload = tasks.reload

  useEffect(() => { ctx.setMyTasks?.(tasks.data ? tasks.data.length : 0) }, [tasks.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reload])

  return (
    <div className="space-y-3" data-my-tasks>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] text-[#6E5E70] flex-1 min-w-[200px]">Tasks that are waiting for you, based on your Cost Agent access (Maker / Checker / Approver) and the approval turn.</p>
        <button type="button" className={SA_BTN_OUTLINE} onClick={reload} disabled={tasks.loading}><RefreshCw size={13} className={tasks.loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {GROUPS.map(g => {
        const list = rows.filter(r => r.task === g.task)
        return (
          <section key={g.task} data-task-group={g.task}>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-[14px] font-bold text-[#3B1B3D]">{g.title}</h3>
              <Chip tone={list.length ? 'amber' : 'grey'}>{list.length}</Chip>
              <span className="text-[11.5px] text-[#8A7A8B]">{g.hint}</span>
            </div>
            <TableCard>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={TH}>Invoice</th><th className={TH}>Company</th><th className={TH}>Vendor</th><th className={TH}>Vessel</th>
                    <th className={`${TH} text-right`}>Amount</th>{g.task === 'verify' && <th className={`${TH} text-right`}>Open lines</th>}<th className={TH}>Since</th>
                  </tr>
                </thead>
                <tbody>
                  <StateRow colSpan={g.task === 'verify' ? 7 : 6} loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={reload} empty={list.length === 0} emptyText="Nothing waiting for you here" />
                  {list.map(t => (
                    <tr key={`${t.task}-${t.invoice_id}`} className="border-t border-[#F3EEEA]">
                      <td className={TD}><Link to={`/cost-agent/invoice/${t.invoice_id}`} className="font-semibold text-[#6B3470] hover:underline">{t.invoice_no || `#${t.invoice_id}`}</Link>
                        {t.acting_for && <div className="mt-0.5"><Chip tone="blue" title="You are a substitute for this approver">for {t.acting_for}</Chip></div>}</td>
                      <td className={`${TD} font-mono font-bold`}>{t.company || '—'}</td>
                      <td className={TD}>{t.vendor || '—'}</td>
                      <td className={TD}>{t.vessel || '—'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{t.amount === null ? '—' : fmtNumber(t.amount, 0)}</td>
                      {g.task === 'verify' && <td className={`${TD} text-right tabular-nums`}>{t.open_lines ?? '—'}</td>}
                      <td className={`${TD} whitespace-nowrap`}>{fmtDateTimePort(t.since, null, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </section>
        )
      })}
    </div>
  )
}
