import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import Greeting from '../components/Greeting';

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [nama, setNama] = useState('');
  const [savingNama, setSavingNama] = useState(false);
  const [namaMsg, setNamaMsg] = useState<{ type: 'sukses' | 'gagal', text: string } | null>(null);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'sukses' | 'gagal', text: string } | null>(null);

  useEffect(() => {
    setNama(profile?.nama || '');
  }, [profile]);

  const handleSaveNama = async () => {
    if (!user) return;
    setSavingNama(true);
    setNamaMsg(null);
    const { error } = await supabase.from('profiles').update({ nama: nama.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
    setSavingNama(false);
    if (error) {
      setNamaMsg({ type: 'gagal', text: 'Failed to save name: ' + error.message });
    } else {
      setNamaMsg({ type: 'sukses', text: 'Name saved successfully.' });
      await refreshProfile();
      setTimeout(() => setNamaMsg(null), 3000);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 6) {
      setPwMsg({ type: 'gagal', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ type: 'gagal', text: 'Password confirmation does not match.' });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) {
      setPwMsg({ type: 'gagal', text: 'Failed to change password: ' + error.message });
    } else {
      setPwMsg({ type: 'sukses', text: 'Password changed successfully.' });
      setPw1('');
      setPw2('');
      setTimeout(() => setPwMsg(null), 3000);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto min-w-0 pb-10">
      <header className="px-6 pt-1 pb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-bold text-2xl text-[#5A305A] leading-tight">My Account</h1>
            <p className="text-[#5A305A] font-light text-sm mt-1">Manage your profile info and login password.</p>
          </div>
          <Greeting />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-[#5A305A] mb-1">Email</label>
              <input type="text" value={user?.email || ''} disabled className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-[#5A305A]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#5A305A] mb-1">Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nama}
                  onChange={e => setNama(e.target.value)}
                  placeholder="Full name"
                  className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] transition-all"
                />
                <button
                  onClick={handleSaveNama}
                  disabled={savingNama}
                  className="bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold px-5 rounded-xl transition-all disabled:opacity-50 shrink-0"
                >
                  {savingNama ? 'Saving...' : 'Save'}
                </button>
              </div>
              {namaMsg && (
                <p className={`text-xs mt-1.5 ${namaMsg.type === 'sukses' ? 'text-emerald-600' : 'text-rose-600'}`}>{namaMsg.text}</p>
              )}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100">
            <h3 className="text-sm font-bold text-[#5A305A] mb-3">Change Password</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">New Password</label>
                <input
                  type="password"
                  value={pw1}
                  onChange={e => setPw1(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5A305A] mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pw2}
                  onChange={e => setPw2(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A305A]/20 focus:border-[#5A305A] transition-all"
                />
              </div>
            </div>
            {pwMsg && (
              <p className={`text-xs mt-2 ${pwMsg.type === 'sukses' ? 'text-emerald-600' : 'text-rose-600'}`}>{pwMsg.text}</p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={savingPw || !pw1 || !pw2}
              className="mt-3 bg-slate-100 hover:bg-slate-200 text-[#5A305A] font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
            >
              {savingPw ? 'Processing...' : 'Change Password'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
