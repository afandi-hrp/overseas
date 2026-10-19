// Aturan password baru (dipakai layar wajib ganti password ForceChangePasswordScreen.tsx & halaman My Account).
// Validasi di browser saja -- GoTrue sendiri hanya mewajibkan minimal 6 karakter (GOTRUE_PASSWORD_MIN_LENGTH).
export const PASSWORD_MIN_LENGTH = 8;

// Password default yang pernah dibagikan ke user baru (docs/sql-templates/add-users.sql) -- tidak boleh dipakai lagi.
// Disamakan dgn daftar backfill sql/066 (huruf besar/kecil diabaikan).
const KNOWN_DEFAULT_PASSWORDS = ['waruna123'];

export const PASSWORD_RULES_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters, containing letters and numbers.`;

// null = valid; selain itu = pesan error (Bahasa Inggris, teks UI).
export function validateNewPassword(pw: string, opts: { current?: string; email?: string | null } = {}): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  if (opts.current && pw === opts.current) return 'New password must be different from the current password.';
  if (KNOWN_DEFAULT_PASSWORDS.includes(pw.toLowerCase())) return 'This is a default password. Please choose your own password.';
  const local = (opts.email || '').split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) return 'Password must not contain your email name.';
  return null;
}
