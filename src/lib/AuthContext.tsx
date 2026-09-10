import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Profile = {
  id: string;
  email: string | null;
  nama: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // Role & akses halaman (lihat src/lib/permissions.ts) -- diisi dari RPC get_my_access() sekali
  // per login. Perubahan role oleh PIC baru berlaku efektif setelah user refresh/login ulang,
  // bukan real-time push ke sesi yang sedang aktif (konsisten dengan pola refreshProfile()).
  allowedPageKeys: Set<string>;
  // page_key yang boleh DIEDIT (bukan cuma dilihat) -- subset dari allowedPageKeys. Role bisa
  // punya akses lihat suatu halaman (ada di allowedPageKeys) tapi tidak boleh edit (tidak ada di
  // editPageKeys) -- lihat kolom can_edit di tabel role_page_access & function has_edit_access()
  // di Supabase. BELUM semua halaman/tabel menegakkan ini lewat RLS -- baru pilot di Courier Audit
  // & Rekapan (2026-09), lihat catatan RBAC di CLAUDE.md.
  editPageKeys: Set<string>;
  canEdit: (pageKey: string) => boolean;
  // "Jabatan approval" NEMPEL LANGSUNG di user ini, PER HALAMAN (tabel `user_approval_tiers`:
  // user_id, page_key, tier -- diatur di RoleManagementPage.tsx panel "Role per User"), TERPISAH
  // TOTAL dari role RBAC. 1 user BISA punya jabatan beda di halaman beda (mis. SPV di Direct
  // Loading, Manager di Bunker) -- makanya map-nya di-key per `page_key`, BUKAN Set datar seperti
  // versi sebelumnya (yang cuma menganggap FAR Overseas Air satu-satunya modul approval).
  // Dipakai gating tombol approval berjenjang (lihat FarOverseasAirDetailModal.tsx & modul
  // approval lain di masa depan) BARENGAN `canEdit(pageKey)` -- jabatan approval baru "berfungsi"
  // kalau user itu JUGA punya role apa saja yang kasih akses edit ke halaman itu (2 syarat
  // independen, keduanya harus terpenuhi). Diisi dari RPC TERPISAH `get_my_approval_tiers()`
  // (BUKAN bagian dari get_my_access()) supaya tidak perlu sentuh function get_my_access() yang
  // sudah kritikal & battle-tested. Fail-closed sama seperti allowedPageKeys/editPageKeys --
  // kalau RPC-nya belum ada di Supabase (migration belum dijalankan), map ini kosong & TIDAK ADA
  // yang bisa approve (termasuk Admin -- lihat catatan `canApproveTier` di bawah, SENGAJA tidak
  // ada bypass isAdmin). Daftar tier yang VALID per halaman ada di `PAGE_REGISTRY[].approvalTiers`
  // (src/lib/permissions.ts), bukan di sini -- di sini cuma nyimpen jabatan user apa adanya.
  approvalTiersByPage: Record<string, string>;
  canApproveTier: (pageKey: string, tier: string) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Layar kunci (lock screen) -- true saat sesi berakhir SENDIRI di tab ini (idle-timeout /
  // logout-paksa-tutup-tab) SELAGI tab tetap terbuka -- BUKAN saat user sengaja klik "Logout",
  // dan BUKAN saat tab ini baru dibuka lagi setelah sesi sudah benar-benar habis (skenario itu
  // tetap tampilkan LoginPage penuh seperti biasa). Lihat komentar panjang di deklarasi state-nya.
  lockScreenActive: boolean;
  // Nama/email user yang terkunci -- diambil dari snapshot SEBELUM sesi berakhir, dipakai
  // LockScreen menampilkan "siapa" tanpa perlu user ketik ulang email.
  lockedProfile: Profile | null;
  // Coba re-autentikasi user yang sama tanpa keluar dari halaman/state yang sedang dibuka.
  unlock: (password: string) => Promise<{ error: string | null }>;
};


const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Auto logout setelah tidak ada aktivitas -- timestamp disimpan di localStorage
// supaya sinkron antar-tab (aktivitas di tab manapun menunda logout di semua tab).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const LAST_ACTIVITY_KEY = 'shipment_last_activity_ts';
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

// Logout paksa kalau tab BENERAN ditutup (bukan cuma di-refresh/F5) -- lihat komentar panjang
// di effect pemakainya. Browser TIDAK punya event "tab ditutup" yang beda dari "halaman
// di-refresh" (keduanya sama-sama memicu pagehide/beforeunload), jadi dibedakan pakai trik:
// tab yang lagi unload tulis "kemungkinan menutup" ke localStorage lalu tunggu jendela waktu
// singkat (CLOSE_CONFIRM_MS) -- kalau tab yang SAMA (id dari sessionStorage, ikut hilang kalau
// tab beneran ditutup, TAPI bertahan kalau cuma di-refresh) muncul lagi dalam jendela itu,
// berarti cuma refresh (dibatalkan, TIDAK logout). Kalau lewat jendela waktu tanpa
// "konfirmasi refresh" itu, dianggap tab beneran tertutup -- SEMUA tab (yang masih terbuka DAN
// tab baru yang dibuka belakangan, termasuk besoknya) logout, sesuai permintaan user (2026-09):
// "tutup 1 tab = logout semua", refresh (F5) harus tetap aman/tidak ikut logout.
// id DOM node portal LockScreen (lihat LockScreen.tsx, createPortal ke document.body) -- HARUS
// dipakai APA ADANYA di kedua file (di sini utk MENGECUALIKAN dari blur+inert seluruh <body>,
// di LockScreen.tsx utk MEMBERI id itu ke elemen portal-nya) -- kalau tidak sinkron, LockScreen
// sendiri akan ikut ke-blur+inert-kan, mengunci diri sendiri sampai tidak bisa dipakai.
export const LOCKSCREEN_PORTAL_ID = 'beehive-lockscreen-portal';

const TAB_ID_KEY = 'shipment_tab_id';
const PENDING_CLOSE_KEY = 'shipment_pending_close';
const CLOSE_CONFIRM_MS = 1500;

function getOrCreateTabId(): string {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

// true kalau ada jejak "kemungkinan menutup" dari tab LAIN yang TERKONFIRMASI beneran tertutup
// (bukan cuma refresh) -- dipanggil PALING AWAL saat AuthProvider mount, SEBELUM `getSession()`
// dipanggil sama sekali. Kalau true, sesi lama HARUS dimatikan duluan SEBELUM `getSession()`
// sempat mengembalikannya sbg "masih valid" -- kalau tidak, sesi basi itu akan sempat kelihatan
// "authed" sesaat (session truthy), `hadSessionRef` keburu jadi true, dan aplikasi salah
// menampilkan LockScreen (blur + minta password) padahal seharusnya LoginPage PENUH (tab ini
// sebenarnya baru dibuka setelah beneran tertutup, bukan sekadar idle di tab yg masih sama) --
// lihat juga komentar `hadSessionRef` di bawah.
//
// ASYNC & MENUNGGU (bukan cuma cek sesaat) -- kalau jejaknya dari tab lain TAPI jendela
// konfirmasi refresh-nya (CLOSE_CONFIRM_MS) belum lewat, fungsi ini menunggu SISA waktunya dulu
// sebelum memutuskan (bukan langsung anggap "belum pasti, lanjut saja") -- supaya tab yang BARU
// mount PAS DI TENGAH jendela konfirmasi tab lain (skenario: tab B mulai menutup, lalu SESAAT
// itu juga user buka tab C yang baru) tidak salah lolos begitu saja tanpa pernah dikonfirmasi
// ulang -- constraint ini yang bikin fungsi versi sebelumnya (sinkron, sekali cek) bisa
// meninggalkan jejak "menggantung" yang baru terdeteksi keliru di mount BERIKUTNYA (kapan pun,
// bisa lama sekali), bukan di jendela waktu yang seharusnya.
async function resolveStaleCloseTrace(tabId: string): Promise<boolean> {
  const evaluate = (raw: string | null): 'own' | 'none' | { pending: any; age: number } => {
    if (!raw) return 'none';
    let pending: any;
    try { pending = JSON.parse(raw); } catch { return 'none'; }
    if (pending?.tabId === tabId) return 'own';
    return { pending, age: Date.now() - (pending?.ts || 0) };
  };

  try {
    const raw = localStorage.getItem(PENDING_CLOSE_KEY);
    const first = evaluate(raw);
    if (first === 'own') {
      localStorage.removeItem(PENDING_CLOSE_KEY);
      return false;
    }
    if (first === 'none') return false;

    if (first.age >= CLOSE_CONFIRM_MS) {
      localStorage.removeItem(PENDING_CLOSE_KEY);
      return true;
    }

    // Belum lewat jendela konfirmasi -- tunggu sisanya, lalu cek ulang APAKAH jejaknya MASIH
    // SAMA PERSIS (belum dibatalkan oleh tab asalnya yang ternyata cuma refresh).
    await new Promise(resolve => setTimeout(resolve, CLOSE_CONFIRM_MS - first.age));
    const stillRaw = localStorage.getItem(PENDING_CLOSE_KEY);
    if (stillRaw !== raw) return false; // dibatalkan (refresh) atau sudah ditangani tab lain
    localStorage.removeItem(PENDING_CLOSE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<Set<string>>(new Set());
  const [editPageKeys, setEditPageKeys] = useState<Set<string>>(new Set());
  const [approvalTiersByPage, setApprovalTiersByPage] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Loading akses (get_my_access) DIPISAH dari loading sesi -- kalau digabung jadi satu flag
  // yang selesai begitu sesi ke-cek, ProtectedRoute/DefaultLandingRedirect sempat render
  // duluan dengan allowedPageKeys masih kosong (default state), lalu getDefaultLandingPath()
  // salah kesimpulan "user ini belum punya akses" dan redirect ke /account -- padahal RPC
  // get_my_access() aslinya baru mau selesai sepersekian detik kemudian. Loading gabungan di
  // bawah (`loading`) baru false setelah KEDUANYA beres.
  const [accessLoading, setAccessLoading] = useState(true);
  // `unlockInFlight`: true SELAGI proses re-autentikasi via LockScreen (unlock()) berjalan --
  // karena unlock() memakai email yang SAMA dgn user yang sebelumnya login, onAuthStateChange
  // menganggapnya "isRealUserChange" (user id sebelum & sesudah sama, TAPI sempat null di
  // antaranya saat lock aktif) dan sempat menyalakan `accessLoading` lagi. Tanpa suppression ini,
  // `loading` global ikut ke-set true sesaat, ProtectedRoute akan sempat MENGGANTI SELURUH
  // Outlet dgn spinner penuh layar (bukan Outlet yg di-blur+LockScreen) -- balik meng-unmount
  // halaman yang justru ingin "dibekukan" tampilannya. Reset otomatis begitu accessLoading
  // selesai (lihat effect di bawah), TIDAK mempengaruhi jalur loading normal (cold-load/login
  // beda user) krn `unlockInFlight` cuma di-set true dari fungsi `unlock()` itu sendiri.
  const [unlockInFlight, setUnlockInFlight] = useState(false);
  const loading = (sessionLoading || accessLoading) && !unlockInFlight;
  const isAuthed = !!session;

  // Reset HANYA saat accessLoading beneran transisi true->false SETELAH unlockInFlight dinyalakan
  // (bukan cuma "accessLoading kebetulan sedang false") -- accessLoading baru menyala ASINKRON
  // sesaat setelah signInWithPassword() di unlock() selesai (via onAuthStateChange), jadi kalau
  // pengecekan cuma "accessLoading===false", race condition bisa langsung mereset flag ini balik
  // ke false SEBELUM accessLoading sempat menyala sama sekali (accessLoading masih false dari
  // render sebelum unlock dipanggil), balik membuka celah flash spinner yang ingin dihindari.
  const accessLoadingSeenRef = useRef(false);
  useEffect(() => {
    if (accessLoading) accessLoadingSeenRef.current = true;
    else if (unlockInFlight && accessLoadingSeenRef.current) {
      setUnlockInFlight(false);
      accessLoadingSeenRef.current = false;
    }
  }, [accessLoading, unlockInFlight]);

  // --- Lock screen (2026-09) --------------------------------------------------------------
  // Tujuan: kalau sesi berakhir SENDIRI (idle-timeout / logout-paksa-tutup-tab lain) SELAGI tab
  // ini masih terbuka, jangan lempar ke LoginPage penuh -- tampilkan halaman terakhir apa
  // adanya (di-blur, non-interaktif) + panel kecil minta password saja (tanpa isi ulang email),
  // supaya user tidak kehilangan konteks halaman yang lagi dikerjakan. TAPI kalau user SENGAJA
  // klik "Logout", atau tab ini baru dimuat ulang setelah sesi memang sudah habis (mis. tab
  // ditutup lalu dibuka lagi besok -- React tree-nya fresh, tidak pernah "authed" di tab ini),
  // tetap tampilkan LoginPage penuh seperti biasa.
  //
  // `hadSessionRef`: jadi true begitu SEKALI SAJA session pernah terisi di tab ini (React state,
  // BUKAN localStorage -- sengaja, supaya reset sendiri tiap tab baru/reload, tidak nyangkut).
  // `manualSignOutRef`: true HANYA saat proses lewat signOut() (dipanggil tombol "Logout" UI),
  // supaya lock screen tidak muncul utk logout yang memang disengaja.
  // `frozenRef`: snapshot session/profile/dkk TERAKHIR sebelum sesi hilang -- dipakai supaya
  // context yang di-expose ke seluruh halaman TIDAK berubah (tetap keliatan "authed" dgn data
  // lama) selama lock screen aktif, supaya effect-effect di halaman lain (mis. yang bergantung
  // ke `user?.id`) TIDAK ikut ter-trigger ulang oleh transisi session->null yang sifatnya
  // sementara ini -- begitu unlock berhasil (session asli terisi lagi), context otomatis balik
  // ke nilai LIVE lagi (frozen snapshot cuma dipakai selama lockScreenActive true).
  const hadSessionRef = useRef(false);
  const manualSignOutRef = useRef(false);
  const frozenRef = useRef<{
    session: Session;
    profile: Profile | null;
    allowedPageKeys: Set<string>;
    editPageKeys: Set<string>;
    approvalTiersByPage: Record<string, string>;
    isAdmin: boolean;
  } | null>(null);

  if (session) {
    hadSessionRef.current = true;
    manualSignOutRef.current = false;
    // Keamanan (2026-09): JANGAN simpan `session` mentah di snapshot beku ini -- object `Session`
    // dari supabase-js bawa `access_token`/`refresh_token` (JWT valid & refresh token sekali
    // pakai) SEKALIGUS. Snapshot ini sengaja disimpan TERUS-MENERUS di memori JS (React ref)
    // selama lock screen aktif, yg BISA berlangsung lama (sampai user unlock atau logout manual)
    // -- kalau token mentahnya ikut disimpan apa adanya, siapa pun yg py akses DevTools ke tab
    // yang sedang terkunci ini (mis. React DevTools, inspect komponen AuthProvider) bisa
    // membaca token itu & memakainya LANGSUNG lewat request API terpisah (curl/Postman),
    // BYPASS UI aplikasi ini sepenuhnya, sampai token itu kedaluwarsa sendiri (JWT access_token
    // TIDAK otomatis batal walau `signOut()` sukses -- itu cuma me-revoke refresh_token-nya,
    // access_token tetap valid scr kriptografis sampai masa berlakunya lewat, umumnya ~1 jam).
    // TIDAK ADA kode di app ini yang baca `session.access_token`/`refresh_token`/
    // `provider_token`/`provider_refresh_token` dari context manapun (dicek via grep) -- yang
    // benar2 dipakai cuma `session.user` (via `unlock()`/`user` context value). Jadi field2
    // token itu di-redact SEBELUM dibekukan, TIDAK PERNAH disimpan sbg string asli di sini.
    frozenRef.current = {
      session: {
        ...session,
        access_token: '[redacted-while-locked]',
        refresh_token: '[redacted-while-locked]',
        provider_token: session.provider_token ? '[redacted-while-locked]' : session.provider_token,
        provider_refresh_token: session.provider_refresh_token ? '[redacted-while-locked]' : session.provider_refresh_token,
      },
      profile, allowedPageKeys, editPageKeys, approvalTiersByPage, isAdmin,
    };
  }

  const lockScreenActive = !session && hadSessionRef.current && !manualSignOutRef.current;
  const exposedSession = lockScreenActive ? frozenRef.current!.session : session;
  const exposedProfile = lockScreenActive ? frozenRef.current!.profile : profile;
  const exposedAllowedPageKeys = lockScreenActive ? frozenRef.current!.allowedPageKeys : allowedPageKeys;
  const exposedEditPageKeys = lockScreenActive ? frozenRef.current!.editPageKeys : editPageKeys;
  const exposedApprovalTiersByPage = lockScreenActive ? frozenRef.current!.approvalTiersByPage : approvalTiersByPage;
  const exposedIsAdmin = lockScreenActive ? frozenRef.current!.isAdmin : isAdmin;

  // DIAGNOSTIK SEMENTARA (2026-09) -- dipasang setelah user lapor lock screen "seperti tidak
  // jalan". Log ini WAJIB muncul di Console browser TEPAT SAAT sesi berakhir SELAGI tab masih
  // terbuka (idle-timeout/tutup-tab-lain) -- kalau log ini TIDAK PERNAH muncul sama sekali,
  // berarti `lockScreenActive` memang tidak pernah jadi true (kemungkinan besar krn
  // `supabase.auth.signOut()` di source pemicunya gagal diam-diam, lihat log
  // "[Auto-logout] signOut() gagal" di effect idle-timeout/tab-tertutup) -- BUKAN bug di
  // LockScreen/unlock() itu sendiri.
  useEffect(() => {
    if (lockScreenActive) console.info('[Auto-logout] Lock screen aktif -- sesi berakhir selagi tab ini masih terbuka.');
  }, [lockScreenActive]);

  // --- Keamanan: blur+kunci HARUS menutupi SELURUH <body>, bukan cuma <Outlet/> (2026-09) ------
  // TEMUAN (via code review, permintaan user "cek celah keamanan"): `App.tsx` `ProtectedRoute`
  // sebelumnya cuma memblur+`inert`-kan React tree di DALAM `<Outlet/>` -- TAPI setidaknya 2
  // modal di app ini (`FarOverseasAirDetailModal.tsx`/`BunkerCompareDocModal.tsx`, print preview
  // memo/dokumen) di-render lewat `ReactDOM.createPortal(..., document.body)` — DOM node-nya
  // jadi SIBLING dari `#root` (BUKAN di dalam `<Outlet/>` sama sekali), sehingga TIDAK IKUT
  // ke-blur/ke-`inert`-kan sama sekali. Kalau modal semacam ini kebetulan sedang terbuka PAS
  // idle-timeout/logout-paksa-tutup-tab memicu lock screen, isinya (bisa data finansial/memo
  // approval) tetap tampil UTUH & BISA DIKLIK, PERSIS SEPERTI TIDAK ADA LOCK SCREEN SAMA SEKALI
  // — celah keamanan nyata.
  //
  // Fix: blur/`inert` diterapkan via DOM API LANGSUNG (di luar kendali React reconciliation) ke
  // SEMUA child langsung `<body>` KECUALI node portal LockScreen sendiri (`LOCKSCREEN_PORTAL_ID`,
  // lihat `LockScreen.tsx` yang SEKARANG portal ke `document.body` juga) — otomatis menutupi
  // `#root` (jadi `<Outlet/>` normal ikut tercakup, wrapper blur manual di `ProtectedRoute` yang
  // lama SUDAH TIDAK PERLU lagi) DAN modal manapun yang portal ke `document.body`, TERMASUK yang
  // ditambahkan nanti di masa depan (generik, tidak perlu didaftarkan satu-satu).
  useEffect(() => {
    if (!lockScreenActive) return;
    const affected: HTMLElement[] = [];
    Array.from(document.body.children).forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      if (child.id === LOCKSCREEN_PORTAL_ID) return;
      child.setAttribute('inert', '');
      child.style.filter = 'blur(6px) brightness(0.95)';
      child.style.transition = 'filter 200ms ease-out';
      child.style.userSelect = 'none';
      affected.push(child);
    });
    return () => {
      affected.forEach(el => {
        el.removeAttribute('inert');
        el.style.filter = '';
        el.style.transition = '';
        el.style.userSelect = '';
      });
    };
  }, [lockScreenActive]);

  // --- Keamanan: paksa reload kalau halaman dipulihkan browser dari bfcache (2026-09) -----------
  // TEMUAN: kalau user navigasi KELUAR dari app ini ke situs lain (bukan pindah route di dalam
  // app -- itu tetap di realm JS yang sama, tidak relevan di sini), lalu tekan tombol Back
  // browser utk KEMBALI ke tab ini, sebagian browser bisa memulihkan halaman dari "back/forward
  // cache" (bfcache) -- yaitu SNAPSHOT PERSIS DOM & state JS dari SESAAT SEBELUM ditinggalkan,
  // tanpa menjalankan ulang kode inisialisasi apa pun. Kalau snapshot itu diambil SEBELUM lock
  // screen aktif (mis. user tinggalkan tab ini dalam keadaan masih login normal, lalu keburu
  // idle-timeout selagi di situs lain, browser TIDAK TAHU soal itu krn JS di tab ini sempat
  // "dibekukan" bfcache-nya), begitu dipulihkan lewat Back, yang muncul adalah tampilan LAMA yang
  // MASIH UTUH TIDAK TERBLUR -- lock screen kita OTOMATIS TIDAK PERNAH SEMPAT AKTIF di snapshot
  // itu. Event `pageshow` dgn `event.persisted === true` adalah SATU-SATUNYA sinyal browser utk
  // kasus ini -- fix paling aman & sederhana: paksa `location.reload()` supaya SELURUH state
  // (termasuk auth) dihitung ulang dari nol, bukan percaya begitu saja ke snapshot beku itu.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, email, nama').eq('id', userId).maybeSingle();
    setProfile(data || null);
  };

  const fetchAccess = async () => {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error || !data) {
      // RPC belum ada / gagal -- jangan diam-diam anggap admin, cuma kosongkan akses supaya
      // route guard menutup semua halaman gated (fail-closed, bukan fail-open).
      setAllowedPageKeys(new Set());
      setEditPageKeys(new Set());
      setIsAdmin(false);
    } else {
      setAllowedPageKeys(new Set(Array.isArray(data.page_keys) ? data.page_keys : []));
      // edit_page_keys baru ada di get_my_access() sejak migration can_edit (2026-09) -- kalau RPC
      // di Supabase belum di-update (belum re-run migration-nya), field ini undefined, treat sbg
      // kosong (fail-closed: dianggap belum boleh edit, bukan diam-diam boleh semua).
      setEditPageKeys(new Set(Array.isArray(data.edit_page_keys) ? data.edit_page_keys : []));
      setIsAdmin(!!data.is_admin);
    }

    // RPC TERPISAH (bukan bagian get_my_access()) -- lihat komentar approvalTiersByPage di atas.
    // Balikin objek {page_key: tier}. Gagal/belum ada = fail-closed (objek kosong), TIDAK
    // menggagalkan fetchAccess keseluruhan.
    const { data: tierData, error: tierError } = await supabase.rpc('get_my_approval_tiers');
    setApprovalTiersByPage(!tierError && tierData && typeof tierData === 'object' && !Array.isArray(tierData) ? tierData : {});
  };

  // Lacak user id terakhir yang diketahui -- dipakai buat bedakan "login/ganti user
  // sungguhan" vs "sesi cuma di-reaffirm Supabase" (lihat komentar di bawah). TIDAK bisa
  // mengandalkan nama event ('SIGNED_IN'/'TOKEN_REFRESHED') karena supabase-js ternyata
  // memancarkan ULANG event 'SIGNED_IN' (bukan cuma 'TOKEN_REFRESHED') setiap kali tab
  // browser kembali fokus dan sesi belum mendekati kedaluwarsa -- lihat
  // node_modules/@supabase/auth-js GoTrueClient#_recoverAndRefresh(), cabang terakhirnya
  // manggil _notifyAllSubscribers('SIGNED_IN', currentSession) tiap _onVisibilityChanged.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const init = async () => {
      // WAJIB dicek & dieksekusi SEBELUM getSession() di bawah -- lihat komentar panjang di
      // resolveStaleCloseTrace(). Kalau tab SEBELUMNYA beneran tertutup (bukan refresh), sesi
      // lama itu dimatikan DULU di sini supaya getSession() konsisten mengembalikan null,
      // bukan sempat mengembalikan sesi basi yang bikin hadSessionRef keliru jadi true.
      if (await resolveStaleCloseTrace(getOrCreateTabId())) {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('[Auto-logout] signOut() gagal (stale-close-trace):', error);
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setSessionLoading(false);
      lastUserIdRef.current = data.session?.user?.id ?? null;
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
        fetchAccess().finally(() => setAccessLoading(false));
      } else {
        setAccessLoading(false);
      }
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      const newUserId = newSession?.user?.id ?? null;
      const isRealUserChange = newUserId !== lastUserIdRef.current;
      lastUserIdRef.current = newUserId;

      if (newSession?.user) {
        fetchProfile(newSession.user.id);
        if (isRealUserChange) {
          setAccessLoading(true);
          fetchAccess().finally(() => setAccessLoading(false));
        } else {
          // User yang sama seperti sebelumnya -- sesi cuma di-reaffirm/refresh otomatis
          // (mis. Supabase mengulang event ini tiap tab browser kembali fokus). Refresh data
          // akses di BACKGROUND saja, JANGAN nyalakan accessLoading/loading global -- kalau
          // tidak, RequirePageAccess/ProtectedRoute me-render ulang jadi spinner, meng-unmount
          // SELURUH halaman (termasuk modal yang lagi terbuka) cuma gara-gara pindah tab.
          fetchAccess();
        }
      } else {
        setProfile(null);
        setAllowedPageKeys(new Set());
        setEditPageKeys(new Set());
        setApprovalTiersByPage({});
        setIsAdmin(false);
        setAccessLoading(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    let lastMark = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastMark < ACTIVITY_THROTTLE_MS) return;
      lastMark = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    };

    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));

    const interval = setInterval(() => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
      const elapsedMs = Date.now() - last;
      if (elapsedMs >= IDLE_TIMEOUT_MS) {
        // DIAGNOSTIK SEMENTARA (2026-09) -- dipasang setelah user lapor "sudah tunggu 30 menit
        // tapi tidak auto-logout". `supabase.auth.signOut()` DIAM-DIAM tidak melakukan apa pun
        // kalau panggilan revoke ke server Supabase gagal karena alasan selain 404/401/403/sesi
        // sudah hilang (lihat GoTrueClient#_signOut di node_modules/@supabase/auth-js --
        // `_removeSession()` di-skip total kalau error itu terjadi) -- sebelumnya panggilan ini
        // "fire and forget" tanpa cek hasil sama sekali, jadi kegagalan ini TIDAK PERNAH
        // kelihatan di mana pun. Console log ini WAJIB dicek user kalau lapor lagi "tidak logout
        // padahal sudah nunggu 30 menit" -- kalau muncul "signOut() gagal", itu bukti network/API
        // Supabase-nya yang bermasalah saat itu (bukan logic idle-timer-nya). Interval ini tetap
        // jalan tiap 15 detik jadi SEHARUSNYA otomatis retry sendiri sesaat kemudian.
        console.info('[Auto-logout] Idle timeout tercapai (%s menit), memanggil signOut()...', Math.round(elapsedMs / 60000));
        supabase.auth.signOut().then(({ error }) => {
          if (error) console.error('[Auto-logout] signOut() gagal (idle-timeout):', error);
        });
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, markActivity));
      clearInterval(interval);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    };
  }, [isAuthed]);

  // Logout paksa saat tab BENERAN ditutup -- lihat komentar TAB_ID_KEY/PENDING_CLOSE_KEY di atas.
  // Pengecekan jejak "kemungkinan menutup" dari SEBELUM tab ini mount (skenario "ditutup lalu
  // dibuka lagi besoknya") SUDAH dilakukan lebih awal di effect inisialisasi sesi di atas (lewat
  // resolveStaleCloseTrace(), SEBELUM getSession() dipanggil) -- effect ini HANYA menangani jejak
  // yang muncul SELAGI tab ini sudah authed & berjalan (tab LAIN yang ditutup belakangan).
  useEffect(() => {
    if (!isAuthed) return;

    const tabId = getOrCreateTabId();
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;

    // Tab LAIN yang masih hidup mendengarkan perubahan PENDING_CLOSE_KEY secara real-time --
    // event 'storage' TIDAK pernah terpicu di tab yang melakukan perubahan itu sendiri, cuma di
    // tab lainnya, jadi ini pas dipakai buat "mendengar" tab lain mulai/batal menutup.
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PENDING_CLOSE_KEY) return;
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
      if (!e.newValue) return; // dibatalkan (tab asalnya cuma refresh) -- tidak perlu apa-apa
      const newValueSnapshot = e.newValue;
      let pending: any;
      try { pending = JSON.parse(newValueSnapshot); } catch { return; }
      if (pending?.tabId === tabId) return; // seharusnya tidak mungkin, tab ini tidak sedang unload
      confirmTimer = setTimeout(() => {
        // Setelah jendela waktu berlalu, kalau jejaknya MASIH SAMA (belum dibatalkan oleh
        // refresh tab asalnya), berarti tab itu beneran tertutup -- logout paksa di sini juga.
        if (localStorage.getItem(PENDING_CLOSE_KEY) === newValueSnapshot) {
          localStorage.removeItem(PENDING_CLOSE_KEY);
          supabase.auth.signOut().then(({ error }) => {
            if (error) console.error('[Auto-logout] signOut() gagal (tab-lain-tertutup):', error);
          });
        }
      }, CLOSE_CONFIRM_MS);
    };
    window.addEventListener('storage', handleStorage);

    // pagehide (fallback beforeunload utk browser yang tidak dukung pagehide) -- fire pada
    // refresh MAUPUN penutupan tab beneran, makanya cuma menulis "kemungkinan", bukan langsung
    // memastikan logout dari sini.
    const markPossibleClose = () => {
      try {
        localStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify({ tabId, ts: Date.now() }));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', markPossibleClose);
    window.addEventListener('beforeunload', markPossibleClose);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pagehide', markPossibleClose);
      window.removeEventListener('beforeunload', markPossibleClose);
      if (confirmTimer) clearTimeout(confirmTimer);
    };
  }, [isAuthed]);

  const signOut = async () => {
    // Ditandai SEBELUM signOut() beneran jalan -- supaya ProtectedRoute tau ini logout yang
    // DISENGAJA (tombol "Logout" UI), bukan idle-timeout/tutup-tab, jadi lock screen TIDAK
    // muncul, langsung ke LoginPage penuh seperti biasa.
    manualSignOutRef.current = true;
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
      await fetchAccess();
    }
  };

  // Re-autentikasi user yang SAMA (email dari snapshot terkunci) tanpa navigasi apa pun --
  // begitu berhasil, onAuthStateChange di atas otomatis mengisi `session` lagi & lockScreenActive
  // balik jadi false (halaman yang sempat di-blur otomatis "hidup" lagi, state React-nya tidak
  // pernah hilang krn tidak pernah unmount).
  const unlock = async (password: string): Promise<{ error: string | null }> => {
    const email = frozenRef.current?.session.user.email;
    if (!email) {
      console.error('[Auto-logout] unlock() gagal -- frozenRef kosong, tidak ada email tersimpan.');
      return { error: 'Sesi tidak ditemukan, silakan login ulang.' };
    }
    setUnlockInFlight(true);
    // Jaring pengaman -- kalau ternyata `accessLoading` tidak pernah menyala sama sekali setelah
    // ini (mis. RPC get_my_access() dipanggil sangat cepat sebelum effect di atas sempat
    // mendeteksinya "pernah true"), flag ini tidak boleh nyangkut true selamanya.
    setTimeout(() => setUnlockInFlight(false), 5000);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[Auto-logout] unlock() -- signInWithPassword gagal:', error);
      setUnlockInFlight(false);
      return { error: error.message === 'Invalid login credentials' ? 'Password salah.' : error.message };
    }
    console.info('[Auto-logout] unlock() berhasil.');
    return { error: null };
  };

  const canEdit = (pageKey: string) => exposedIsAdmin || exposedEditPageKeys.has(pageKey);
  // SENGAJA TIDAK ada bypass `isAdmin` di sini (beda dari canEdit di atas) -- atas permintaan
  // eksplisit user: Admin TIDAK otomatis boleh approve semua tahap, harus tetap di-assign jabatan
  // approval-nya sendiri (baris user_approval_tiers) sama seperti user lain, per halaman.
  const canApproveTier = (pageKey: string, tier: string) => exposedApprovalTiersByPage[pageKey] === tier;

  return (
    <AuthContext.Provider value={{
      session: exposedSession,
      user: exposedSession?.user ?? null,
      profile: exposedProfile,
      allowedPageKeys: exposedAllowedPageKeys,
      editPageKeys: exposedEditPageKeys,
      canEdit,
      approvalTiersByPage: exposedApprovalTiersByPage,
      canApproveTier,
      isAdmin: exposedIsAdmin,
      loading,
      signOut,
      refreshProfile,
      lockScreenActive,
      lockedProfile: lockScreenActive ? frozenRef.current!.profile : null,
      unlock,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}