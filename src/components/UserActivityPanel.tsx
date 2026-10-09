// Panel "User Activity" (2026-10-09, permintaan user; sql/051_user_presence.sql) -- panel TERBAWAH Settings -> Manage Roles & Access
// (halaman itu adminOnly; RPC `fn_user_activity` juga menolak non-Admin). Menampilkan siapa yang Online / Idle / Offline, kapan terakhir
// masuk (auth.users.last_sign_in_at), terakhir terlihat, dan halaman yang sedang dibuka. Segar otomatis tiap 30 dtk selagi tab terlihat.
// Status dihitung dari JAM SERVER (utils/UserPresence.ts); heartbeat dikirim usePresenceHeartbeat (MainLayout).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingState } from './LoadingState';
import {
  presenceStatus, sortActivity, pageLabelFromPath, timeAgo, fmtDateTime,
  type ActivityRow, type PresenceStatus,
} from '../utils/UserPresence';

const REFRESH_MS = 30 * 1000;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s&/-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

const STATUS_META: Record<PresenceStatus, { label: string; chip: string; dot: string }> = {
  online: { label: 'Online', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  idle: { label: 'Idle', chip: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-400' },
  offline: { label: 'Offline', chip: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-300' },
};

export default function UserActivityPanel() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | PresenceStatus>('all');

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const { data, error: err } = await supabase.rpc('fn_user_activity');
    if (err) {
      // 42883 / PGRST202 = fungsi belum ada (sql/051 belum dijalankan).
      if ((err as any).code === '42883' || (err as any).code === 'PGRST202') setMissing(true);
      else setError(err.message);
      setRows(prev => prev ?? []);
    } else {
      setMissing(false);
      setError(null);
      setRows((Array.isArray(data) ? data : []) as ActivityRow[]);
    }
    if (manual) setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const sorted = useMemo(() => sortActivity(rows || []), [rows]);
  const counts = useMemo(() => {
    const c = { online: 0, idle: 0, offline: 0 };
    (rows || []).forEach(r => { c[presenceStatus(r)] += 1; });
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter(r => {
      if (filter !== 'all' && presenceStatus(r) !== filter) return false;
      if (!q) return true;
      return [r.nama, r.email, r.divisi, pageLabelFromPath(r.page)].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [sorted, search, filter]);
  const serverNow = (rows && rows[0]?.server_now) || new Date().toISOString();

  const pill = (k: 'all' | PresenceStatus, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
      className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${filter === k ? 'bg-[#5A305A] border-[#5A305A] text-white' : 'bg-white/80 border-[#5A305A]/20 text-[#5A305A] hover:bg-white'}`}>
      {label} <span className={filter === k ? 'text-white/80' : 'text-[#5A305A]/55'}>{n}</span>
    </button>
  );

  return (
    <div className="relative bg-white/40 backdrop-blur-xl rounded-2xl border border-[#5A305A]/25 shadow-[0_4px_24px_rgba(90,48,90,0.08)] p-6 overflow-hidden" data-user-activity-panel>
      <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-gradient-to-tr from-[#5A305A]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity size={17} className="text-[#5A305A]" />
          <h2 className="font-bold text-[#5A305A]">User Activity</h2>
          <span className="text-[11px] font-medium text-[#5A305A]/50">{counts.online} online · {counts.idle} idle · {rows ? rows.length : 0} users</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5A305A]/50" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / email / division / page..."
              className="border border-[#5A305A]/25 bg-white/70 backdrop-blur-sm rounded-xl pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] w-64" />
          </div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} title="Refresh now"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#5A305A]/20 bg-white/80 text-[#5A305A] text-[11px] font-semibold hover:bg-white transition-colors disabled:opacity-60">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="relative flex items-center gap-2 flex-wrap mb-3">
        {pill('all', 'All', rows ? rows.length : 0)}
        {pill('online', 'Online', counts.online)}
        {pill('idle', 'Idle', counts.idle)}
        {pill('offline', 'Offline', counts.offline)}
        <span className="text-[10.5px] text-[#5A305A]/55 ml-auto">Updates automatically every 30 s · Online = active within 5 min · Idle = app open, no activity</span>
      </div>

      {missing && (
        <div className="relative mb-3 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-medium">
          User activity is not active yet — run <code className="font-mono">sql/051_user_presence.sql</code> in the Supabase SQL Editor, then refresh this page.
        </div>
      )}
      {error && !missing && (
        <div className="relative mb-3 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-medium">Failed to load user activity: {error}</div>
      )}

      <div className="relative rounded-xl border border-[#5A305A]/12 bg-white/85 backdrop-blur-md shadow-inner overflow-hidden">
        {rows === null ? (
          <LoadingState fullHeight={false} />
        ) : shown.length === 0 ? (
          <p className="text-xs text-[#5A305A] italic text-center py-6">{rows.length === 0 ? 'No data.' : 'No users found.'}</p>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse min-w-[760px]" data-user-activity-table>
              <thead>
                <tr className="text-[10px] text-[#5A305A]/80 uppercase tracking-wider">
                  {['User', 'Division', 'Status', 'Last login', 'Last seen', 'Current page'].map(h => (
                    <th key={h} className="text-left font-bold px-4 py-3 sticky top-0 z-10 bg-[#FAF7F5] border-b border-[#5A305A]/12 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const st = presenceStatus(r);
                  const meta = STATUS_META[st];
                  return (
                    <tr key={r.user_id} className="hover:bg-[#F5EDF3]/60 transition-colors" data-activity-row={r.email || r.user_id} data-status={st}>
                      <td className="px-4 py-2.5 border-b border-slate-100">
                        <div className="font-semibold text-[#3B1B3D]">{r.nama || '—'}</div>
                        <div className="text-[10.5px] text-[#5A305A]/60 [overflow-wrap:anywhere]">{r.email || '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-slate-100 text-[#3B1B3D] whitespace-nowrap">{r.divisi ? titleCase(r.divisi) : <span className="text-slate-400 italic">No division</span>}</td>
                      <td className="px-4 py-2.5 border-b border-slate-100">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10.5px] font-bold ${meta.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${st === 'online' ? 'animate-pulse' : ''}`} />{meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 border-b border-slate-100 whitespace-nowrap" title={r.last_sign_in_at ? fmtDateTime(r.last_sign_in_at) : undefined}>
                        {r.last_sign_in_at
                          ? <><div className="text-[#3B1B3D]">{fmtDateTime(r.last_sign_in_at)}</div><div className="text-[10.5px] text-[#5A305A]/55">{timeAgo(r.last_sign_in_at, serverNow)}</div></>
                          : <span className="text-slate-400 italic">Never signed in</span>}
                      </td>
                      <td className="px-4 py-2.5 border-b border-slate-100 whitespace-nowrap" title={r.last_seen ? fmtDateTime(r.last_seen) : undefined}>
                        {r.last_seen ? <span className="text-[#3B1B3D]">{st === 'offline' ? timeAgo(r.last_seen, serverNow) : 'now'}</span> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 border-b border-slate-100 ${st === 'offline' ? 'text-slate-400' : 'text-[#3B1B3D]'}`}>
                        {r.page ? <span title={r.page}>{pageLabelFromPath(r.page)}{st === 'offline' ? <span className="text-[10px] ml-1">(last)</span> : null}</span> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
