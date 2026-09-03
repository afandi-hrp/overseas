import React from 'react';
import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

// Sapaan + ikon waktu -- dipasang di header SEMUA halaman aplikasi (pojok kanan atas, sejajar
// dengan judul halaman). Satu sumber kebenaran dipakai di semua tempat, JANGAN duplikat logic
// ini per halaman lagi.
function getGreetingMeta(date: Date) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return { text: 'Good morning', Icon: Sunrise };
  if (hour >= 11 && hour < 15) return { text: 'Good afternoon', Icon: Sun };
  if (hour >= 15 && hour < 18) return { text: 'Good evening', Icon: Sunset };
  return { text: 'Good night', Icon: Moon };
}

export default function Greeting() {
  const { profile, user } = useAuth();
  const now = new Date();
  const { text, Icon } = getGreetingMeta(now);
  const displayName = profile?.nama || user?.email?.split('@')[0] || '';
  const dayDate = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="text-right shrink-0">
      <div className="flex items-center justify-end gap-2">
        <p className="font-bold text-lg text-[#5A305A] leading-tight">{text}{displayName ? `, ${displayName}` : ''}</p>
        <Icon size={19} className="text-amber-500 shrink-0" />
      </div>
      <p className="text-xs font-light text-[#5A305A]/70 mt-0.5">{dayDate}</p>
    </div>
  );
}
