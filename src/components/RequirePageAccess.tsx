import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { getDefaultLandingPath, pageLabel } from '../lib/permissions';

// Guard per-halaman -- dipasang di src/App.tsx membungkus tiap <Route> yang mau dibatasi role.
// Beda dari ProtectedRoute (yang cuma cek "sudah login atau belum"): ini cek APAKAH user (lewat
// role yang di-assign PIC) punya akses ke page_key tertentu. Kalau tidak, TIDAK redirect diam-
// diam (bisa bikin loop membingungkan) -- tampilkan layar "tidak ada akses" + link ke halaman
// pertama yang memang diizinkan.
//
// pageKey: cek lewat allowedPageKeys (atau otomatis lolos kalau isAdmin).
// adminOnly: cek isAdmin langsung, TIDAK lewat allowedPageKeys -- dipakai khusus halaman Kelola
// Role & Akses supaya tidak ada role non-admin yang bisa diberi akses ke halaman yang bisa
// menaikkan role dirinya sendiri jadi Admin (lihat sql/001_rbac_and_bunker_rls.sql).
export default function RequirePageAccess({ pageKey, adminOnly, children }: {
  pageKey?: string;
  adminOnly?: boolean;
  children: React.ReactNode;
}) {
  const { loading, allowedPageKeys, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#FFF5C5] to-[#F58C77]">
        <div className="w-8 h-8 border-4 border-[#5A305A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = adminOnly ? isAdmin : (isAdmin || (pageKey ? allowedPageKeys.has(pageKey) : false));

  if (!hasAccess) {
    const fallbackPath = getDefaultLandingPath(allowedPageKeys, isAdmin);
    return (
      <div className="flex-1 h-full flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={22} />
          </div>
          <h2 className="font-bold text-[#5A305A] mb-1.5">Tidak Ada Akses</h2>
          <p className="text-sm font-light text-[#5A305A]/80 mb-5">
            Anda tidak memiliki akses ke halaman{pageKey ? ` "${pageLabel(pageKey)}"` : ' ini'}. Hubungi PIC/admin kalau merasa ini seharusnya diizinkan.
          </p>
          <Link
            to={fallbackPath}
            className="inline-block px-4 py-2.5 rounded-xl bg-[#5A305A] hover:bg-[#73507B] text-white font-semibold text-sm transition-all"
          >
            Kembali ke Halaman Saya
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
