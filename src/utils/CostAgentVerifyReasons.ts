// Alasan "kenapa baris belum auto-verified" (2026-10-29, permintaan user). Aturan dihitung di DATABASE (fn_cost_agent_get_line_verify_reasons, hanya baca,
// urutan SAMA dgn fn_cost_agent_auto_verify); modul ini hanya bentuk data tampilan: ringkasan, pengelompokan baris needs_user per kode. TIDAK menghitung/meniru aturan auto-verify.
// Tanpa import runtime (hanya tipe) supaya bisa dites langsung (npm test).

export interface LineReason {
  line_id: number
  line_no: number
  verified: boolean
  code: string // verified | auto_verify_off | invoice_status | line_doc_issue | no_cost_item | method_not_allowed | no_history | weak_level | above_history | manual_check | documents_incomplete | ready
  label: string // teks Inggris siap tampil
  hint: string | null
  needs_user: boolean // true = maker harus bertindak
}
export interface LineVerifyReasons {
  invoice_id: number
  auto_verify: { enabled: boolean; methods: string[]; levels: string[] }
  documents_complete: boolean
  summary: { total: number; verified: number; eligible: number; needs_user: number }
  lines: LineReason[]
}

export const reasonByLine = (r: LineVerifyReasons | null | undefined): Map<number, LineReason> => new Map((r?.lines ?? []).map(x => [x.line_id, x]))

// Satu baris ringkasan di atas tabel Lines. tone: 'user' (ada yang perlu dicek maker) / 'wait' (menunggu dokumen) / 'off' (auto-verify mati) / 'ok'.
export function reasonsSummary(r: LineVerifyReasons | null | undefined): { text: string; tone: 'ok' | 'user' | 'wait' | 'off' } | null {
  if (!r || !r.summary) return null
  if (r.auto_verify && r.auto_verify.enabled === false) return { text: 'Auto-verify is off in Settings', tone: 'off' }
  const { verified, total, needs_user: k } = r.summary
  const base = `Auto-verified ${verified} of ${total}`
  if (k > 0) return { text: `${base} · ${k} need your check`, tone: 'user' }
  if (r.documents_complete === false) return { text: `${base} · Waiting for documents`, tone: 'wait' }
  return { text: base, tone: 'ok' }
}

// Judul kelompok per kode (urutan tampil = urutan di sini). Kode tak dikenal -> label baris pertama kelompok itu.
const GROUP_ORDER: { code: string; title: string }[] = [
  { code: 'above_history', title: 'Above history' },
  { code: 'no_cost_item', title: 'No cost item' },
  { code: 'method_not_allowed', title: 'Cost item matched loosely' },
  { code: 'no_history', title: 'No history' },
  { code: 'weak_level', title: 'Weak history match' },
  { code: 'manual_check', title: 'Another history differs' },
  { code: 'line_doc_issue', title: 'Document issue' },
  { code: 'auto_verify_off', title: 'Auto-verify off' },
]
export interface ReasonGroup { code: string; title: string; lineNos: number[]; lineIds: number[] }

// Baris needs_user yang belum verified, dikelompokkan per kode: "Above history (3): lines 8, 11, 14".
export function groupNeedsUser(r: LineVerifyReasons | null | undefined): ReasonGroup[] {
  const pending = (r?.lines ?? []).filter(l => l.needs_user && !l.verified)
  const byCode = new Map<string, LineReason[]>()
  pending.forEach(l => { const a = byCode.get(l.code) ?? []; a.push(l); byCode.set(l.code, a) })
  const known = GROUP_ORDER.map(g => g.code)
  const codes = [...known.filter(c => byCode.has(c)), ...Array.from(byCode.keys()).filter(c => !known.includes(c))]
  return codes.map(code => {
    const ls = (byCode.get(code) ?? []).slice().sort((a, b) => a.line_no - b.line_no)
    return { code, title: GROUP_ORDER.find(g => g.code === code)?.title ?? ls[0]?.label ?? code, lineNos: ls.map(l => l.line_no), lineIds: ls.map(l => l.line_id) }
  })
}
export const groupHeading = (g: ReasonGroup): string => `${g.title} (${g.lineNos.length})`
