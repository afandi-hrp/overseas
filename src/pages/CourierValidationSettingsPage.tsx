import React, { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Greeting from '../components/Greeting';
import { LoadingState } from '../components/LoadingState';
import { COURIER_DOC_TOLERANCE_DEFAULT, setCourierDocTolerance } from '../utils/BtVendorCombined';

// Toleransi validasi dokumen Courier (2026-10-21, sql/072): selisih <= toleransi dianggap Match "rounding" (BT Vendor gabungan, dalam mata uang BT).
export default function CourierValidationSettingsPage() {
  const { canEdit, profile, user } = useAuth();
  const editable = canEdit('settings_courier_validation');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ at: string | null; by: string | null }>({ at: null, by: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('courier_doc_settings').select('value, updated_at, updated_by').eq('key', 'bt_tolerance').maybeSingle();
    if (error) setMsg({ type: 'err', text: 'Failed to load: ' + error.message });
    const v = data ? Number(data.value) : COURIER_DOC_TOLERANCE_DEFAULT;
    setSaved(v); setValue(String(v)); setMeta({ at: data?.updated_at ?? null, by: data?.updated_by ?? null });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(String(value).replace(',', '.'));
    if (!isFinite(n) || n < 0 || n > 1000) { setMsg({ type: 'err', text: 'Enter a number between 0 and 1000.' }); return; }
    setSaving(true); setMsg(null);
    const { error } = await supabase.from('courier_doc_settings').upsert({ key: 'bt_tolerance', value: n, updated_at: new Date().toISOString(), updated_by: profile?.nama || user?.email || null }, { onConflict: 'key' });
    setSaving(false);
    if (error) { setMsg({ type: 'err', text: 'Failed to save: ' + error.message }); return; }
    setCourierDocTolerance(n);
    setMsg({ type: 'ok', text: 'Saved. Open Doc Validation records are recalculated the next time they are opened (use Recompute for saved ones).' });
    await load();
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-3 pt-0 pb-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A305A] text-white flex items-center justify-center shrink-0"><Scale size={17} /></div>
            <div>
              <h1 className="font-bold text-2xl text-[#5A305A] leading-none">Courier Validation Tolerance</h1>
              <p className="font-light text-sm text-[#5A305A]/70 mt-0.5">Differences up to this value are treated as a rounding Match in Courier Doc Validation</p>
            </div>
          </div>
          <Greeting />
        </div>
      </header>
      <main className="px-3 pt-2 pb-4">
        <div className="bg-white/70 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/60 max-w-xl">
          {loading ? <LoadingState fullHeight={false} /> : (
            <form onSubmit={save} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#5A305A]">BT Vendor tolerance (in the BT currency, not IDR)</span>
                <input type="text" inputMode="decimal" value={value} disabled={!editable || saving} onChange={e => setValue(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-2 w-40 bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A]/15 focus:border-[#5A305A] disabled:bg-slate-50" />
              </label>
              <p className="text-xs text-[#5A305A]/70 leading-relaxed">
                Used by the combined BT Vendor check (one transfer proof paying several shipments): when the AWB portion differs from the reference value by at most this
                amount, the field is a Match (rounding). Bank service charges are ignored. Default {COURIER_DOC_TOLERANCE_DEFAULT}.
              </p>
              {meta.at && <p className="text-[11px] text-[#5A305A]/60">Current: {saved} · last changed {new Date(meta.at).toLocaleString('en-GB')}{meta.by ? ` by ${meta.by}` : ''}</p>}
              {msg && <div className={`text-xs px-3 py-2 rounded-lg border ${msg.type === 'ok' ? 'bg-[#EAF6EF] border-[#BFE3CD] text-[#17663D]' : 'bg-[#FDE7E4] border-[#F4C3BC] text-[#A8231A]'}`}>{msg.text}</div>}
              {editable && <button type="submit" disabled={saving} className="self-start px-4 py-2 rounded-lg bg-[#5A305A] hover:bg-[#73507B] text-white text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
