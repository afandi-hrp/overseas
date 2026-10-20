// Auto Rename -- dialog: Review item, Confirm & Save, Connection settings, Keyboard shortcuts (modal React, pengganti <dialog>).
import React, { useEffect, useState } from 'react'
import { state, emit, get, itemById } from '../../utils/autoRename/store'
import { saveReview } from '../../utils/autoRename/rows'
import { saveModel, doSave, closeSaveDialog } from '../../utils/autoRename/source'
import { saveConn, resetConn, testConn } from '../../utils/autoRename/source'
import { conn, connUrl, CONN_DEFAULT, CONN_LABEL, type Conn } from '../../utils/autoRename/net'

const Modal: React.FC<{ wide?: boolean; onClose: () => void; children: React.ReactNode; label: string }> = ({ wide, onClose, children, label }) => (
  <div className="ar-back" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className={`ar-dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}><div className="dialog-body">{children}</div></div>
  </div>
)

// ───────────────────────── Review ─────────────────────────
function ReviewDialog() {
  const row = itemById(state.review.id)
  const [final, setFinal] = useState(() => row ? (row.final || row.suggestion || get(row.original, 'ItemName')) : '')
  const [decision, setDecision] = useState(() => row?.decision || '')
  const close = () => { state.review = null; emit() }
  if (!row) return null
  const query = String(final || row.final || row.suggestion || get(row.original, 'ItemName')).trim()
  return (
    <Modal wide onClose={close} label="Review Item Name">
      <div className="topline">
        <div><h2>Review Item Name</h2><p className="muted">{row.sheet} · {get(row.original, 'ItemCode')} · row {row.index}</p></div>
        <button className="quiet" onClick={close}>Close ✕</button>
      </div>
      <div className="dialoggrid">
        <div>
          <label className="lbl">Original name<textarea readOnly value={String(get(row.original, 'ItemName') ?? '')} /></label>
          <label className="lbl">Recommendation / Final<input placeholder="Final name after review" value={final} onChange={e => setFinal(e.target.value)} /></label>
          <label className="lbl">Validation notes<textarea readOnly value={row.notes || 'No AI notes yet.'} /></label>
          <label className="lbl">Decision
            <select value={decision} onChange={e => setDecision(e.target.value)}><option value="">Undecided</option><option value="SETUJU">Approve</option><option value="TOLAK">Reject</option><option value="TUNDA">Hold</option></select>
          </label>
          <div className="row"><button className="solid" onClick={() => saveReview(final, decision)}>Save decision</button><button className="quiet" onClick={close}>Cancel</button></div>
        </div>
        <div>
          <div className="image-tile"><div><b>Product image</b><p className="note">Open a Google Images search to match the item manually. No images are fetched automatically.</p></div></div>
          <div className="row" style={{ marginTop: 12 }}><a className="quiet" href={'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query)} target="_blank" rel="noopener noreferrer">View Google Images ↗</a></div>
          <div className="softbox" style={{ marginTop: 12 }}>
            <b className="small">Item information</b>
            <p className="note" style={{ whiteSpace: 'pre-line' }}>{`Status: ${row.status}\nDuplicate: ${row.duplicates.join(', ') || 'None'}\nRule: ${state.sheets[row.sheet].rule?.source || 'not checked yet'}`}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────── Save ─────────────────────────
function SaveDialog() {
  const m = saveModel()
  const sv = state.save
  return (
    <Modal onClose={() => { if (!sv.busy) closeSaveDialog() }} label="Confirm & Save to RESULT">
      <h2>Confirm &amp; Save to RESULT</h2>
      <p className="note">{m.summary}</p>
      <label className="muted small"><input type="checkbox" checked={!!state.ui.saveIncludeTunda} onChange={e => { state.ui.saveIncludeTunda = e.target.checked; emit() }} /> Include ON HOLD</label>
      {m.target && <p className="note warn-note">{m.target}</p>}
      <ol className="save-log small">{sv.log.map((l: any, i: number) => <li key={i} className={l.bad ? 'bad' : undefined}>{l.msg}</li>)}</ol>
      <p className="note">{sv.progress}</p>
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button className="solid" disabled={sv.busy || !m.canSave} onClick={() => doSave()}>{m.confirmLabel}</button>
        <button className="quiet" onClick={closeSaveDialog}>Cancel</button>
      </div>
    </Modal>
  )
}

// ───────────────────────── Connection settings ─────────────────────────
function ConnDialog() {
  const [c, setC] = useState<Conn>(() => conn())
  const [res, setRes] = useState('')
  const close = () => { state.connOpen = false; emit() }
  const setPath = (k: string, v: string) => setC(p => ({ ...p, paths: { ...p.paths, [k]: v.trim() } }))
  const read = (): Conn => ({ base: c.base.trim() || CONN_DEFAULT.base, timeout: Number(c.timeout) || 90, paths: c.paths })
  return (
    <Modal wide onClose={close} label="Connection settings">
      <h2>Connection settings</h2>
      <p className="muted small">Saved in this browser only. Paths are relative to the base URL, or a full https URL. No secret headers are sent.</p>
      <label className="lbl">n8n base URL<input value={c.base} onChange={e => setC(p => ({ ...p, base: e.target.value }))} /></label>
      <div className="dialoggrid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {Object.keys(CONN_DEFAULT.paths).map(k => (
          <label key={k} className="lbl">{CONN_LABEL[k]}<input value={c.paths[k]} onChange={e => setPath(k, e.target.value)} /><span className="muted tiny mono">{connUrl(read(), k)}</span></label>
        ))}
      </div>
      <label className="lbl">Run AI timeout (seconds)<input type="number" min={20} max={300} style={{ maxWidth: 120 }} value={c.timeout} onChange={e => setC(p => ({ ...p, timeout: Number(e.target.value) }))} /></label>
      <p className="note">{res}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="solid" onClick={() => setRes(saveConn(read()))}>Save</button>
        <button className="quiet" onClick={async () => { setRes('Testing…'); setRes(await testConn(read())) }}>Test connection</button>
        <button className="quiet" onClick={() => { resetConn(); setC(conn()); setRes('Defaults restored.') }}>Restore defaults</button>
        <button className="quiet" onClick={close}>Close</button>
      </div>
    </Modal>
  )
}

// ───────────────────────── Shortcuts ─────────────────────────
function HelpDialog() {
  const close = () => { state.helpOpen = false; emit() }
  return (
    <Modal onClose={close} label="Keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <table className="plain small"><tbody>
        <tr><td><kbd>?</kbd></td><td>Open/close this help</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>5</kbd></td><td>Explorer, Schema, Review, Wrangler, Monitor</td></tr>
        <tr><td><kbd>/</kbd></td><td>Focus search</td></tr>
        <tr><td><kbd>N</kbd></td><td>Next undecided row</td></tr>
        <tr><td><kbd>J</kbd> / <kbd>↓</kbd>, <kbd>K</kbd> / <kbd>↑</kbd></td><td>Next / previous row</td></tr>
        <tr><td><kbd>A</kbd> / <kbd>R</kbd> / <kbd>H</kbd></td><td>Approve / Reject / Hold focused row (always sets the decision)</td></tr>
        <tr><td><kbd>C</kbd> / <kbd>Delete</kbd></td><td>Clear the decision of the focused row (or click ⟲)</td></tr>
        <tr><td><kbd>E</kbd> or double-click</td><td>Edit final name inline (Enter save, Esc cancel) → MODIFIED</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Open Review dialog for focused row</td></tr>
        <tr><td><kbd>X</kbd></td><td>Toggle selection of focused row</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close dialog / cancel edit</td></tr>
      </tbody></table>
      <div className="row" style={{ marginTop: 10 }}><button className="quiet" onClick={close}>Close</button></div>
    </Modal>
  )
}

export default function ArDialogs() {
  // Esc menutup dialog teratas.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (state.review) { state.review = null; emit() }
      else if (state.connOpen) { state.connOpen = false; emit() }
      else if (state.helpOpen) { state.helpOpen = false; emit() }
      else if (state.save.open && !state.save.busy) closeSaveDialog()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  return (
    <>
      {state.review && <ReviewDialog key={state.review.id} />}
      {state.save.open && <SaveDialog />}
      {state.connOpen && <ConnDialog />}
      {state.helpOpen && <HelpDialog />}
    </>
  )
}
