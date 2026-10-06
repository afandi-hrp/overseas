import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award, BrainCircuit, CircleAlert, CircleX, FileSearch, List, ListChecks, ListTodo, OctagonAlert, PanelLeftClose,
  PanelLeftOpen, Printer, ShieldCheck, TriangleAlert, UploadCloud, Zap,
} from 'lucide-react';
import Greeting from '../components/Greeting';
import SingleFileDrop from '../components/SingleFileDrop';
import { LoadingSpinner } from '../components/LoadingState';

// LSA (2026-10-06) -- MIGRASI dari halaman mandiri `LSA.html` ("Waruna LSA Audit — Modern Compliance
// Dashboard") ke dalam app, submenu Compare Doc. LOGIKA SAMA dgn file asli (permintaan user: "murni
// migrasi"): Quotation & Certificate wajib, Delivery Order opsional, maks 50 MB/PDF; POST FormData
// (`job_id`, `penawaran`, `sertifikat`, `surat_jalan`) LANGSUNG ke webhook n8n `audit-dokumen`;
// polling `check-status-audit` tiap 8 dtk (header no-cache), batas 10 menit (timer 1 dtk); baris
// hasil = payload1..payload20 digabung -> base64 UTF-8 -> JSON; aturan status/warna/grup/filter
// "Only Issues" (menyembunyikan SEMUA baris kelas row-match, termasuk tab sertifikat) SAMA.
// Semua nilai dulu di-escape `esc()` -> di React dirender sbg teks biasa (otomatis ter-escape), jadi
// tanpa DOMPurify. Yang berubah hanya tampilan (gaya app, Sora, lebar penuh).
const WEBHOOK_URL = 'https://n8.waruna-group.co.id/webhook/audit-dokumen';
const STATUS_URL = 'https://n8.waruna-group.co.id/webhook/check-status-audit';
const MAX_WAIT_SECONDS = 600;

const SORA: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };

// = esc() asli tanpa escape HTML (React sudah meng-escape): null/undefined -> '-'.
const t = (value: unknown) => String(value ?? '-');

function decodeBase64Utf8(base64: string) {
  const binString = atob(String(base64 || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binString, char => char.codePointAt(0) as number);
  return new TextDecoder().decode(bytes);
}

function formatWorkflowVersionDate(value: any) {
  if (!value) return '-';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}-${month}-${year}`;
  }
  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return raw;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsedDate);
}

type StatusKey = 'ANOMALY' | 'REVIEW' | 'MATCH';
function statusStyle(status: any): { key: StatusKey; label: string; cell: string; match: boolean } {
  const s = String(status || '').toUpperCase();
  if (s.includes('ANOMALY') || s.includes('FAIL') || s.includes('DISCREPANCY')) {
    return { key: 'ANOMALY', label: '⚠️ ANOMALY', cell: 'bg-red-50 text-red-800', match: false };
  }
  if (s.includes('REVIEW') || s.includes('UNVERIFIED')) {
    return { key: 'REVIEW', label: '🔍 REVIEW', cell: 'bg-amber-50 text-amber-800', match: false };
  }
  return { key: 'MATCH', label: '✅ MATCH', cell: 'bg-emerald-50 text-emerald-800', match: true };
}

function ExpiryBadge({ status, days }: { status: any; days: any }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap border';
  if (status === 'EXPIRED') return <span className={`${base} bg-red-50 text-red-800 border-red-200`}>🔴 EXPIRED{days !== null && days !== undefined ? ` (${Math.abs(days)}d ago)` : ''}</span>;
  if (status === 'EXPIRING_SOON') return <span className={`${base} bg-amber-50 text-amber-800 border-amber-200`}>🟡 {days}d LEFT</span>;
  if (status === 'VALID') return <span className={`${base} bg-emerald-50 text-emerald-800 border-emerald-200`}>🟢 VALID</span>;
  return <span className={`${base} bg-slate-100 text-slate-500 border-slate-200`}>-</span>;
}

const CertBadges = ({ list }: { list: any[] }) => (
  <div className="flex gap-1 flex-wrap">
    {list.map((c, i) => (
      <span key={i} className="border border-[#E5D5E9] bg-[#F7F1F8] text-[#5A305A] rounded-full px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap">🏷️ {t(c)}</span>
    ))}
  </div>
);

function QuotationTable({ parsed, onlyIssues, print }: { parsed: any; onlyIssues: boolean; print?: boolean }) {
  const rows = parsed.tabel_audit.filter((row: any) => String(row.kategori || '').toUpperCase() === 'PENAWARAN');
  const groups: Record<string, any[]> = {};
  rows.forEach((row: any) => {
    const key = row.grup_penawaran || 'Other Items';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  const td = `border-b border-slate-200 align-top [overflow-wrap:anywhere] ${print ? 'p-1.5 text-[8px]' : 'px-2.5 py-2.5 text-[10.5px]'}`;
  const docVal = 'px-1.5 py-1 border border-slate-100 rounded bg-[#FCFCFD] font-semibold';
  const entries = Object.entries(groups);

  return (
    <tbody>
      {entries.length === 0 ? (
        <tr><td colSpan={6} className="text-center py-8 text-slate-500 text-xs">No quotation items found.</td></tr>
      ) : entries.map(([groupName, items]) => {
        const groupHasFail = items.some(item => statusStyle(item.status || item.hasil_ai).key === 'ANOMALY');
        const groupHasReview = items.some(item => statusStyle(item.status || item.hasil_ai).key === 'REVIEW');
        const groupIsMatch = !groupHasFail && !groupHasReview;
        return (
          <React.Fragment key={groupName}>
            {!(onlyIssues && groupIsMatch) && (
              <tr><td colSpan={6} className={`${td} bg-slate-100 text-slate-700 font-extrabold ${print ? '' : '!text-[11px]'}`}>📁 {t(groupName)}</td></tr>
            )}
            {items.map((row, ri) => {
              const s = statusStyle(row.status || row.hasil_ai);
              if (onlyIssues && s.match) return null;
              const alias = String(row.alias_sistem || '-');
              const split = alias.split(' - ');
              const itemCode = split.shift() || '-';
              const systemName = split.join(' - ') || '-';
              const certs = String(row.cert_terkait || '').split(',').map(x => x.trim())
                .filter(x => x && x !== '-' && x.toUpperCase() !== 'NOT FOUND');
              return (
                <React.Fragment key={ri}>
                  <tr className="break-inside-avoid">
                    <td className={`${td} text-center`}><b>{t(row.no_urut_penawaran || '-')}</b></td>
                    <td className={td}>
                      <div className="px-1.5 py-1 border-l-[3px] border-yellow-400 rounded bg-yellow-50 text-yellow-900 font-bold mb-1">{t(row.keterangan)}</div>
                      <div className="px-1.5 py-1 border-l-[3px] border-sky-300 rounded bg-blue-50 text-sky-700 font-semibold mb-1">{t(systemName)}</div>
                      <div className="px-1.5 py-1 border-l-[3px] border-green-300 rounded bg-green-50 text-green-800 font-bold font-mono text-[10px]">{t(itemCode)}</div>
                    </td>
                    <td className={td}><div className={docVal}>{t(row.di_penawaran)}</div></td>
                    <td className={td}>
                      <div className={`${docVal} ${certs.length ? 'mb-1' : ''}`}>{t(row.di_sertifikat)}</div>
                      {certs.length > 0 && <CertBadges list={certs} />}
                    </td>
                    <td className={td}><div className={`${docVal} text-center`}>{t(row.di_do)}</div></td>
                    <td className={`${td} !align-middle text-center font-extrabold ${s.cell}`}>{s.label}</td>
                  </tr>
                  {s.key !== 'MATCH' && row.reason && (
                    <tr className="break-inside-avoid">
                      <td className={`${td} bg-slate-50`} />
                      <td colSpan={5} className={`${td} bg-slate-50`}>
                        <div className={`px-2.5 py-2 rounded-md text-[10px] border-l-[3px] ${s.key === 'ANOMALY' ? 'border-red-600 bg-red-50 text-red-800' : 'border-amber-600 bg-amber-50 text-amber-900'}`}>
                          <b>{s.key === 'ANOMALY' ? '💡 AI Reason' : '🔍 Needs Review'}:</b> {t(row.reason)}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </tbody>
  );
}

function CertificateTable({ parsed, onlyIssues, print }: { parsed: any; onlyIssues: boolean; print?: boolean }) {
  const list: any[] = Array.isArray(parsed.certificate_registry) ? parsed.certificate_registry : [];
  const td = `border-b border-slate-200 align-top [overflow-wrap:anywhere] ${print ? 'p-1.5 text-[8px]' : 'px-2.5 py-2.5 text-[10.5px]'}`;
  return (
    <tbody>
      {list.length === 0 ? (
        <tr><td colSpan={12} className="text-center py-8 text-slate-500 text-xs">No certificate registry data.</td></tr>
      ) : onlyIssues ? null /* semua baris registry ber-kelas row-match di versi asli -> ikut tersembunyi */ : list.map((cert, i) => {
        const certNumbers = Array.isArray(cert.cert_numbers) ? cert.cert_numbers : (cert.cert_no ? [cert.cert_no] : ['-']);
        const mm = cert.mismatch_fields || {};
        const cls = (field: string) => (mm[field] ? '!bg-red-50 text-red-800 after:content-["⚠"] after:ml-1 after:text-[9px]' : '');
        return (
          <tr key={i} className="break-inside-avoid">
            <td className={`${td} text-center`}>{i + 1}</td>
            <td className={td}><b>{t(cert.report_name)}</b></td>
            <td className={td}><CertBadges list={certNumbers} /></td>
            <td className={`${td} ${cls('ship_name')}`}>{t(cert.ship_name)}</td>
            <td className={`${td} ${cls('owner')}`}>{t(cert.owner)}</td>
            <td className={`${td} text-center ${cls('imo_no')}`}><b>{t(cert.imo_no)}</b></td>
            <td className={`${td} text-center`}>{t(cert.class)}</td>
            <td className={`${td} text-center`}>{t(cert.gt)}</td>
            <td className={`${td} text-center ${cls('call_sign')}`}>{t(cert.call_sign)}</td>
            <td className={td}>{t(cert.service_date)}</td>
            <td className={td}>{t(cert.next_inspection_date)}<br /><ExpiryBadge status={cert.expiry_status} days={cert.expiry_days} /></td>
            <td className={`${td} !align-middle text-center font-extrabold bg-emerald-50 text-emerald-800`}>✅ {t(cert.status || 'OK')}</td>
          </tr>
        );
      })}
    </tbody>
  );
}

const thCls = (print?: boolean) => `text-left font-extrabold uppercase tracking-wide text-[#52325E] bg-[#FAF7FB] border-b border-slate-200 ${print ? 'p-1.5 text-[8px]' : 'px-2.5 py-2.5 text-[9px]'}`;
const sectionCls = (print?: boolean) => `bg-gradient-to-r from-[#5A305A] to-[#73507B] text-white font-extrabold tracking-wide ${print ? 'px-2 py-1.5 text-[9px]' : 'px-3.5 py-3 text-[11px]'}`;

function QuotationTableFull({ parsed, onlyIssues, print }: { parsed: any; onlyIssues: boolean; print?: boolean }) {
  const sticky = print ? '' : 'sticky z-10';
  return (
    <table className={`w-full border-collapse table-fixed ${print ? '' : 'min-w-[980px]'}`}>
      <colgroup><col style={{ width: 42 }} /><col style={{ width: '43%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} /><col style={{ width: '10%' }} /><col style={{ width: '18%' }} /></colgroup>
      <thead>
        <tr><td colSpan={6} className={`${sectionCls(print)} ${sticky} top-0`}>Document Compliance Check &amp; Reconciliation</td></tr>
        <tr>
          {['No', 'Inspection Point (Vendor / System / Code)', 'Quotation', 'Certificate', 'DO', 'Audit Status'].map((h, i) => (
            <th key={h} className={`${thCls(print)} ${sticky} top-[40px] ${i === 0 || i >= 4 ? 'text-center' : ''}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <QuotationTable parsed={parsed} onlyIssues={onlyIssues} print={print} />
    </table>
  );
}

function CertificateTableFull({ parsed, onlyIssues, print }: { parsed: any; onlyIssues: boolean; print?: boolean }) {
  const sticky = print ? '' : 'sticky z-10';
  const widths = [42, '16%', '12%', '11%', '10%', '7%', '6%', '5%', '7%', '8%', '10%', '6%'];
  const heads: [string, boolean][] = [['No', true], ['Report Name', false], ['Certificate No', false], ['Ship Name', false], ['Owner', false], ['IMO', true], ['Class', true], ['GT', true], ['Call Sign', true], ['Service Date', false], ['Exp Date', false], ['Status', true]];
  return (
    <table className={`w-full border-collapse table-fixed ${print ? '' : 'min-w-[980px]'}`}>
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr><td colSpan={12} className={`${sectionCls(print)} ${sticky} top-0`}>Certificate List &amp; Ship Validation</td></tr>
        <tr>{heads.map(([h, c]) => <th key={h} className={`${thCls(print)} ${sticky} top-[40px] ${c ? 'text-center' : ''}`}>{h}</th>)}</tr>
      </thead>
      <CertificateTable parsed={parsed} onlyIssues={onlyIssues} print={print} />
    </table>
  );
}

function AttentionSummary({ parsed, print }: { parsed: any; print?: boolean }) {
  const items: any[] = Array.isArray(parsed.attention_items) ? parsed.attention_items : [];
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#FAF7FB] border-b border-slate-200 text-xs font-extrabold text-[#32193D]">
        <ListTodo size={16} /> Needs Attention ({items.length})
      </div>
      <div className={print ? '' : 'max-h-[220px] overflow-y-auto'}>
        {items.map((item, i) => {
          const type = String(item.type || 'REVIEW').toUpperCase();
          const anomaly = type === 'ANOMALY';
          return (
            <div key={i} className="flex gap-2.5 items-start px-4 py-2.5 border-b border-dashed border-slate-200 last:border-b-0 text-[10.5px]">
              {anomaly ? <CircleX size={14} className="text-red-600 shrink-0 mt-px" /> : <CircleAlert size={14} className="text-amber-600 shrink-0 mt-px" />}
              <div className="min-w-0">
                <b className="block text-[#172033] font-extrabold mb-0.5">{t(item.title)}</b>
                {t(item.message)}
              </div>
              <span className={`ml-auto text-[8px] font-bold uppercase rounded-full px-1.5 py-0.5 whitespace-nowrap ${anomaly ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                {anomaly ? 'Anomaly' : 'Review'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Ringkasan header laporan (dipakai layar & cetak).
function overallInfo(parsed: any) {
  const overall = String(parsed.status_keseluruhan || 'UNVERIFIED').replace(/_/g, ' ');
  const score = Number(parsed.compliance_score || 0);
  const detail = parsed.compliance_detail || {};
  let statusColor = '#d97706';
  if (overall.includes('ALL MATCH')) statusColor = '#16a34a';
  if (overall.includes('DISCREPANCY') || overall.includes('FAILED') || overall.includes('INCOMPLETE') || overall.includes('MISSING')) statusColor = '#dc2626';
  const scoreCls = score >= 90 ? 'text-green-800 bg-green-50 border-green-200' : score >= 70 ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-red-800 bg-red-50 border-red-200';
  const missing = (parsed.document_checks || []).filter((x: any) => String(x.status || '').toUpperCase() === 'MISSING');
  const workflow = parsed?.workflow_version || {};
  const version = workflow.version || '';
  const hasVersion = Boolean(version);
  const versionText = hasVersion ? `${version} · ${formatWorkflowVersionDate(workflow.release_date || '')}` : 'Version not available';
  const versionTitle = hasVersion
    ? [
      `N8N Workflow Version: ${version}`,
      `Release Date: ${formatWorkflowVersionDate(workflow.release_date || '')}`,
      `Updated By: ${workflow.updated_by || '-'}`,
      `Updated At: ${workflow.updated_at || '-'}`,
      `Change: ${workflow.release_note || 'No release note available'}`,
    ].join('\n')
    : 'Workflow version belum dikirim dari node n8n Olah Data JSON1.';
  return {
    overall, statusColor, scoreCls,
    scoreText: `${t(detail.matched || 0)}/${t(detail.total || 0)} • ${t(score)}%`,
    missingText: missing.length ? `Required documents incomplete: ${missing.map((x: any) => x.check || x.field || 'Document').join(', ')}` : '',
    hasVersion, versionText, versionTitle,
    vessel: (parsed.ship_info || {}).name_of_ship || '-',
    vendor: (parsed.ship_info || {}).vendor_name || '-',
  };
}

export default function LsaPage() {
  useEffect(() => { document.title = 'LSA · BeeHive'; }, []);

  const quotationRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);
  const deliveryRef = useRef<HTMLInputElement>(null);
  const [qView, setQView] = useState<File | null>(null);
  const [cView, setCView] = useState<File | null>(null);
  const [dView, setDView] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [tab, setTab] = useState<'penawaran' | 'sertifikat'>('penawaran');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [formHidden, setFormHidden] = useState(false);

  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAll = () => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    if (timerInterval.current) clearInterval(timerInterval.current);
    pollingInterval.current = null;
    timerInterval.current = null;
  };
  useEffect(() => stopAll, []);

  const showMessage = (text: string, isError = false) => setMessage({ text, isError });

  function renderAuditReport(p: any) {
    if (!p || !Array.isArray(p.tabel_audit)) {
      showMessage('Unrecognized audit payload format.', true);
      return;
    }
    setParsed(p);
  }

  async function checkStatus(jobId: string) {
    try {
      const res = await fetch(`${STATUS_URL}?job_id=${encodeURIComponent(jobId)}&_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) return;

      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : (json.data || [json]);
      const ourRow = rows.find((row: any) => row['Job ID'] === jobId || row.job_id === jobId);
      if (json.status === 'processing' || !ourRow) return;

      stopAll();
      setPolling(false);
      setReportVisible(true);
      setSubmitting(false);

      let fullPayload = '';
      const keys = Object.keys(ourRow);
      for (let i = 1; i <= 20; i++) {
        const key = keys.find(k => k.toLowerCase().replace(/\s/g, '') === `payload${i}`);
        if (key) fullPayload += ourRow[key] || '';
      }
      const p = JSON.parse(decodeBase64Utf8(fullPayload));
      renderAuditReport(p);
    } catch (error) {
      console.log('Waiting for audit data...', error);
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const maxSize = 50 * 1024 * 1024;
    const qFile = quotationRef.current?.files?.[0];
    const cFile = certRef.current?.files?.[0];
    const dFile = deliveryRef.current?.files?.[0];

    if ([qFile, cFile, dFile].some(file => file && file.size > maxSize)) {
      showMessage('Maximum file size is 50 MB per PDF. Please compress larger documents.', true);
      return;
    }

    const jobId = `JOB-${Date.now()}`;
    setSubmitting(true);
    setMessage(null);
    setReportVisible(false);

    const formData = new FormData();
    formData.append('job_id', jobId);
    if (qFile) formData.append('penawaran', qFile);
    if (cFile) formData.append('sertifikat', cFile);
    if (dFile) formData.append('surat_jalan', dFile);

    try {
      const req = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
      if (!req.ok) throw new Error('Connection to n8n failed.');

      setPolling(true);
      setSeconds(0);
      const start = Date.now();
      stopAll();
      timerInterval.current = setInterval(() => {
        const s = Math.floor((Date.now() - start) / 1000);
        setSeconds(s);
        if (s > MAX_WAIT_SECONDS) {
          stopAll();
          setPolling(false);
          setSubmitting(false);
          showMessage('Process exceeded 10 minutes. Please check the n8n execution.', true);
        }
      }, 1000);
      pollingInterval.current = setInterval(() => checkStatus(jobId), 8000);
    } catch (error: any) {
      setSubmitting(false);
      showMessage(error?.message || String(error), true);
    }
  };

  const info = parsed ? overallInfo(parsed) : null;
  const issueCount = parsed
    ? parsed.tabel_audit.filter((r: any) => String(r.kategori || '').toUpperCase() === 'PENAWARAN' && !statusStyle(r.status || r.hasil_ai).match).length
    : 0;
  const certCount = parsed && Array.isArray(parsed.certificate_registry) ? parsed.certificate_registry.length : 0;

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10" style={SORA}>
      {/* Kertas A4 landscape (sama asli) -- hanya selama halaman ini terpasang. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 1cm; } }'}</style>

      <header className="px-3 pt-1 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0">
              <ShieldCheck size={17} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">LSA</h1>
              <p className="text-[#5A305A] font-light text-sm mt-1">AI compliance check of the quotation, certificate report and delivery order.</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="px-3 pt-2 pb-2">
        <div className={`grid grid-cols-1 gap-3 items-start ${formHidden ? '' : 'lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]'}`}>
          {/* ===== FORM ===== */}
          {!formHidden && (
            <aside className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden lg:sticky lg:top-2">
              <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-[#5A305A] to-[#73507B] text-white">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><ShieldCheck size={18} /></div>
                  <div>
                    <h2 className="font-bold text-base leading-tight">LSA Verification</h2>
                    <p className="text-[11px] text-white/75 mt-0.5">Waruna AI Audit Workspace</p>
                  </div>
                </div>
              </div>

              <form onSubmit={onSubmit} className="p-5 space-y-5">
                <SingleFileDrop step={1} label="Quotation Document" hint="PDF only · max 50 MB" accept=".pdf" inputRef={quotationRef} file={qView} onFile={setQView} disabled={submitting} />
                <SingleFileDrop step={2} label="Certificate Report" hint="PDF only · max 50 MB" accept=".pdf" inputRef={certRef} file={cView} onFile={setCView} disabled={submitting} />
                <SingleFileDrop step={3} label="Delivery Order" badge="Optional" required={false} hint="PDF only · max 50 MB" accept=".pdf" inputRef={deliveryRef} file={dView} onFile={setDView} disabled={submitting} />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 bg-[#5A305A] hover:bg-[#73507B] text-white rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-70 disabled:cursor-wait"
                >
                  {submitting ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> PROCESSING...</>
                  ) : (
                    <><Zap size={15} /> RUN AI VERIFICATION</>
                  )}
                </button>

                {message && (
                  <div className={`flex items-start gap-2 rounded-xl p-3 text-[11px] font-semibold border ${message.isError ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {message.isError && <TriangleAlert size={14} className="shrink-0 mt-px" />} {message.text}
                  </div>
                )}
              </form>
            </aside>
          )}

          {/* ===== HASIL ===== */}
          <section className="min-w-0">
            {polling && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-full bg-[#F5EDF3] flex items-center justify-center">
                    <BrainCircuit size={34} className="text-[#5A305A]" />
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#5A305A]/30 animate-ping" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">Analyzing documents...</h3>
                <p className="text-xs text-[#6E5E70] mt-1 max-w-md">Quotation, certificate, DO, master vessel, and item mapping are being reconciled.</p>
                <div className="w-full max-w-sm mt-6">
                  <div className="h-1.5 rounded-full bg-[#F5EDF3] overflow-hidden">
                    <div className="h-full bg-[#5A305A] transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (seconds / MAX_WAIT_SECONDS) * 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6E5E70] mt-2">
                    <span className="inline-flex items-center gap-1.5"><LoadingSpinner className="scale-75" /> Waiting time: <b>{seconds}</b> seconds</span>
                    <span>Limit 10 min</span>
                  </div>
                </div>
              </div>
            )}

            {!polling && !reportVisible && (
              <div className="bg-white/80 rounded-2xl shadow-sm border border-[#EADFD6] min-h-[420px] flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F5EDF3] flex items-center justify-center mb-4">
                  <FileSearch size={28} className="text-[#5A305A]" />
                </div>
                <h3 className="text-lg font-bold text-[#5A305A]">No audit result yet</h3>
                <p className="text-xs text-[#6E5E70] mt-1 max-w-md">Upload the quotation and certificate report (delivery order optional) to start the compliance check.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full max-w-3xl text-left">
                  {[
                    { icon: UploadCloud, title: 'Upload documents', desc: 'Quotation and certificate report are required; the delivery order is optional.' },
                    { icon: BrainCircuit, title: 'AI reconciliation', desc: 'Items are matched against certificates, DO, master vessel and item mapping (up to 10 minutes).' },
                    { icon: ListChecks, title: 'Review & print', desc: 'Check anomalies and items to review, the certificate registry, then print the report.' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl border border-[#EADFD6] bg-[#FBF7F4] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-white border border-[#EADFD6] flex items-center justify-center"><s.icon size={15} className="text-[#5A305A]" /></div>
                        <span className="text-[10px] font-bold text-[#6E5E70]">STEP {i + 1}</span>
                      </div>
                      <div className="text-xs font-semibold text-[#2A1A2C]">{s.title}</div>
                      <div className="text-[11px] text-[#6E5E70] mt-1 leading-relaxed">{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!polling && reportVisible && (
              <div className="bg-white rounded-2xl shadow-sm border border-[#EADFD6] overflow-hidden">
                {formHidden && message && (
                  <div className={`m-4 mb-0 flex items-start gap-2 rounded-xl p-3 text-[11px] font-semibold border ${message.isError ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {message.isError && <TriangleAlert size={14} className="shrink-0 mt-px" />} {message.text}
                  </div>
                )}
                <div className="px-5 pt-5 border-b border-[#EADFD6] bg-gradient-to-b from-white to-[#FCFAFE]">
                  <div className="flex items-stretch justify-between gap-4 flex-wrap">
                    <div className="flex gap-5 items-center flex-wrap">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#6E5E70]">Vessel Name</span>
                        <span className="text-[15px] font-extrabold text-[#32193D] [overflow-wrap:anywhere]">{info ? info.vessel : '-'}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#6E5E70]">Vendor</span>
                        <span className="text-[15px] font-extrabold text-[#32193D] [overflow-wrap:anywhere]">{info ? info.vendor : '-'}</span>
                      </div>
                      <div className="flex flex-col gap-1 pl-4 border-l border-slate-200 min-w-[190px]">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#6E5E70]">N8N Workflow Version</span>
                        <span
                          title={info ? info.versionTitle : 'Workflow version belum tersedia dari n8n.'}
                          className={`inline-flex items-center w-fit gap-2 min-h-[27px] px-2.5 py-1 rounded-full border text-[10px] font-extrabold whitespace-nowrap cursor-help ${
                            info?.hasVersion ? 'border-blue-300/60 bg-blue-600/[.08] text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                          }`}
                        >
                          <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${info?.hasVersion ? 'bg-blue-600 ring-[3px] ring-blue-600/15' : 'bg-slate-400 ring-[3px] ring-slate-400/15'}`} />
                          {info ? info.versionText : 'Version not available'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 pl-4 border-l border-slate-200">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-[#6E5E70]">Overall Status</span>
                      {info ? (
                        <span className="flex items-center flex-wrap gap-2 text-[15px] font-extrabold">
                          <span style={{ color: info.statusColor }}>{info.overall}</span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap border ${info.scoreCls}`}>{info.scoreText}</span>
                        </span>
                      ) : <span className="text-[15px] font-extrabold">-</span>}
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => setFormHidden(h => !h)}
                        className="h-9 px-3 rounded-xl border border-[#5A305A] text-[#5A305A] bg-white hover:bg-[#F5EDF3] text-[11px] font-semibold flex items-center gap-1.5"
                      >
                        {formHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                        {formHidden ? 'Show Upload Form' : 'Hide Upload Form'}
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="h-9 px-3 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white text-[11px] font-semibold flex items-center gap-1.5"
                      >
                        <Printer size={15} /> Print Report
                      </button>
                    </div>
                  </div>

                  {info?.missingText && (
                    <div className="mt-3.5 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 font-semibold text-xs">
                      <OctagonAlert size={17} className="shrink-0" /> {info.missingText}
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-3 mt-4 flex-wrap">
                    <div className="flex gap-0.5">
                      {([
                        { k: 'penawaran', label: 'Document Compliance', icon: ListChecks, count: issueCount, countCls: 'bg-red-100 text-red-700' },
                        { k: 'sertifikat', label: 'Certificate Registry', icon: Award, count: certCount, countCls: 'bg-[#F5EDF3] text-[#5A305A]' },
                      ] as const).map(tb => (
                        <button
                          key={tb.k}
                          onClick={() => setTab(tb.k)}
                          className={`px-3.5 py-3 border-b-[3px] text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                            tab === tb.k ? 'text-[#5A305A] border-[#5A305A] bg-[#FAF7FB]' : 'text-[#6E5E70] border-transparent hover:text-[#5A305A] hover:bg-[#F7F1F8]'
                          }`}
                        >
                          <tb.icon size={15} /> {tb.label}
                          {parsed && tb.count > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${tb.countCls}`}>{tb.count}</span>}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 pb-2">
                      <button
                        onClick={() => setOnlyIssues(false)}
                        className={`rounded-lg px-3 py-2 text-[10px] font-bold inline-flex items-center gap-1.5 border ${!onlyIssues ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white border-slate-200 text-[#6E5E70]'}`}
                      >
                        <List size={14} /> Show All Items
                      </button>
                      <button
                        onClick={() => setOnlyIssues(true)}
                        className={`rounded-lg px-3 py-2 text-[10px] font-bold inline-flex items-center gap-1.5 border ${onlyIssues ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-[#6E5E70]'}`}
                      >
                        <TriangleAlert size={14} /> Only Issues
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  {parsed && tab === 'penawaran' && (
                    <>
                      <AttentionSummary parsed={parsed} />
                      <div className="overflow-auto max-h-[68vh] border border-slate-200 rounded-xl bg-white">
                        <QuotationTableFull parsed={parsed} onlyIssues={onlyIssues} />
                      </div>
                    </>
                  )}
                  {parsed && tab === 'sertifikat' && (
                    <div className="overflow-auto max-h-[68vh] border border-slate-200 rounded-xl bg-white">
                      <CertificateTableFull parsed={parsed} onlyIssues={onlyIssues} />
                    </div>
                  )}
                  {!parsed && <div className="text-center text-xs text-[#6E5E70] py-10">No report data.</div>}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Area cetak: header + kedua tab penuh (sama asli: tab/tombol/filter tidak dicetak, filter Only Issues tetap berlaku). */}
      {reportVisible && !polling && parsed && info && createPortal(
        <div id="lsa-print-area" className="hidden print:block bg-white text-[9px]" style={{ ...SORA, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          <div className="flex gap-6 items-end flex-wrap pb-3 mb-3 border-b border-slate-300">
            <div><div className="text-[8px] font-bold uppercase text-slate-500">Vessel Name</div><div className="text-sm font-extrabold text-[#32193D]">{info.vessel}</div></div>
            <div><div className="text-[8px] font-bold uppercase text-slate-500">Vendor</div><div className="text-sm font-extrabold text-[#32193D]">{info.vendor}</div></div>
            <div><div className="text-[8px] font-bold uppercase text-slate-500">N8N Workflow Version</div><div className="text-[10px] font-bold">{info.versionText}</div></div>
            <div>
              <div className="text-[8px] font-bold uppercase text-slate-500">Overall Status</div>
              <div className="text-sm font-extrabold"><span style={{ color: info.statusColor }}>{info.overall}</span> <span className="text-[9px]">({info.scoreText})</span></div>
            </div>
          </div>
          {info.missingText && <div className="mb-3 px-2 py-1.5 border border-red-300 bg-red-50 text-red-800 font-semibold">{info.missingText}</div>}
          <AttentionSummary parsed={parsed} print />
          <div className="mb-5"><QuotationTableFull parsed={parsed} onlyIssues={onlyIssues} print /></div>
          <CertificateTableFull parsed={parsed} onlyIssues={onlyIssues} print />
        </div>,
        document.body,
      )}
    </div>
  );
}
