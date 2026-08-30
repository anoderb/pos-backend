import { authService } from './auth.service.js';
import { responseSukses } from '../../utils/response.js';
import { supabaseAdmin } from '../../config/database.js';
import { revokeAccessToken } from '../../utils/revoked-tokens.js';
import { serializeUser, serializeToko, serializeSession } from '../../utils/serializers.js';
import { isLocked, recordAttempt, resetKey, LOGIN_TIERS, REGISTER_TIERS } from '../../utils/brute-lock.js';

const REFRESH_COOKIE = 'tokiva_refresh_token';
const ACCESS_COOKIE = 'tokiva_access_token';
const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};
const refreshCookieOptions = {
  ...cookieBase,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60,
};
const accessCookieOptions = {
  ...cookieBase,
  maxAge: 3600,
};

function lockKeyLogin(ip, email) {
  return `login:${ip}:${String(email || '').trim().toLowerCase()}`;
}

function lockKeyRegister(ip) {
  return `register:${ip}`;
}

function sisaWaktuLock(ms) {
  if (ms <= 0) return '';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} menit`;
  return `${Math.round(m / 60)} jam`;
}

// Token tidak pernah dikirim di JSON body. Hanya lewat HttpOnly cookie.
// (serializer dipakai untuk bentuk response aman)

export const authController = {
  async register(request, reply) {
    const { nama, email, password, nama_toko, alamat_toko, no_telp_toko } = request.body || {};
    if (!nama || !email || !password || !nama_toko) {
      return reply.code(400).send({ berhasil: false, pesan: 'Nama, email, password, dan nama toko wajib diisi' });
    }

    const rKey = lockKeyRegister(request.ip);
    const remain = isLocked(rKey);
    if (remain > 0) {
      return reply.code(429).send({ berhasil: false, pesan: `Terlalu banyak pendaftaran. Coba lagi dalam ${sisaWaktuLock(remain)}.` });
    }

    try {
      const hasil = await authService.registerOwner({ nama, email, password, nama_toko, alamat_toko, no_telp_toko });
      recordAttempt(rKey, REGISTER_TIERS);
      return reply.code(201).send(responseSukses(hasil, 'Registrasi Owner berhasil disimpan'));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async login(request, reply) {
    const { email, password } = request.body || {};
    if (!email || !password) {
      return reply.code(400).send({ berhasil: false, pesan: 'Email dan password wajib diisi' });
    }

    const lKey = lockKeyLogin(request.ip, email);
    const remain = isLocked(lKey);
    if (remain > 0) {
      return reply.code(429).send({ berhasil: false, pesan: `Terlalu banyak percobaan login. Coba lagi dalam ${sisaWaktuLock(remain)}.` });
    }

    try {
      const hasil = await authService.login({ email, password });
      resetKey(lKey);
      reply.setCookie(REFRESH_COOKIE, hasil.session?.refresh_token, refreshCookieOptions);
      reply.setCookie(ACCESS_COOKIE, hasil.session?.access_token, accessCookieOptions);
      return reply.send(responseSukses({
        session: serializeSession(hasil.session),
        pengguna: serializeUser(hasil.pengguna),
        toko: serializeToko(hasil.toko),
      }, 'Login berhasil'));
    } catch (err) {
      recordAttempt(lKey);
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async verifikasiEmail(request, reply) {
    try {
      const { email } = request.body || {};
      const hasil = await authService.kirimVerifikasiEmail(email);
      return reply.send(responseSukses(hasil, 'Email verifikasi dikirim'));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  // Konfirmasi verifikasi email (Model B) — POST /auth/verif {email, code}
  // Link dari email memanggil endpoint ini; setelah sukses arahkan ke halaman login.
  async verif(request, reply) {
    try {
      const { email, code } = request.query || request.body || {};
      const hasil = await authService.verifKode({ email, code });
      // Jika dibuka via GET di browser (link email), redirect ke login + tanda sukses.
      if (request.method === 'GET') {
        const fe = (process.env.PUBLIC_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
        return reply.redirect(`${fe}/login?verified=1`);
      }
      return reply.send(responseSukses(hasil, 'Email berhasil diverifikasi'));
    } catch (err) {
      const fe = (process.env.PUBLIC_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
      if (request.method === 'GET') {
        return reply.redirect(`${fe}/verifikasi?email=${encodeURIComponent(request.query?.email || '')}&error=${encodeURIComponent(err.message)}`);
      }
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async lupaPassword(request, reply) {
    const { email } = request.body || {};
    if (!email) return reply.code(400).send({ berhasil: false, pesan: 'Email wajib diisi' });

    try {
      const hasil = await authService.lupaPassword(email);
      return reply.send(responseSukses(hasil, hasil.pesan));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async resetPassword(request, reply) {
    const { email, old_password, new_password } = request.body || {};

    // Mode 1: Ganti password langsung (user sudah login JWT)
    if (new_password) {
      if (!request.pengguna?.email) {
        return reply.code(401).send({ berhasil: false, pesan: 'Anda harus login untuk mengubah password' });
      }
      if (!old_password) {
        return reply.code(400).send({ berhasil: false, pesan: 'Password lama wajib diisi' });
      }
      const hasil = await authService.gantiPassword(request.pengguna.email, old_password, new_password);
      return reply.send(responseSukses(hasil, hasil.pesan));
    }

    // Mode 2: Kirim email reset link
    if (!email) {
      return reply.code(400).send({ berhasil: false, pesan: 'Email wajib diisi' });
    }

    try {
      const hasil = await authService.resetPassword({ email });
      return reply.send(responseSukses(hasil, hasil.pesan));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async gantiPassword(request, reply) {
    const { old_password, new_password } = request.body || {};
    if (!old_password) {
      return reply.code(400).send({ berhasil: false, pesan: 'Password lama wajib diisi' });
    }
    if (!new_password) {
      return reply.code(400).send({ berhasil: false, pesan: 'Password baru wajib diisi' });
    }

    try {
      const hasil = await authService.gantiPassword(request.pengguna.email, old_password, new_password);
      return reply.send(responseSukses(hasil, hasil.pesan));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async refresh(request, reply) {
    const refresh_token = request.cookies?.[REFRESH_COOKIE];
    if (!refresh_token) {
      return reply.code(401).send({ berhasil: false, pesan: 'Sesi refresh tidak ditemukan' });
    }

    try {
      const session = await authService.refreshToken(refresh_token);
      reply.setCookie(REFRESH_COOKIE, session.refresh_token, refreshCookieOptions);
      reply.setCookie(ACCESS_COOKIE, session.access_token, accessCookieOptions);
      return reply.send(responseSukses(serializeSession(session), 'Token berhasil diperbarui'));
    } catch (err) {
      return reply.code(401).send({ berhasil: false, pesan: 'Sesi tidak valid' });
    }
  },

  // Endpoint status login — SELALU 200, tidak pernah 401.
  // Dipakai halaman publik (login/register) buat cek sesi tanpa bikin console error.
  async status(request, reply) {
    const token = request.cookies?.tokiva_access_token;
    if (!token) {
      return reply.send(responseSukses({ loggedIn: false }, 'Belum login'));
    }

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return reply.send(responseSukses({ loggedIn: false }, 'Sesi tidak valid'));
      }

      const { data: profil } = await supabaseAdmin
        .from('pengguna')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (!profil || !profil.aktif) {
        return reply.send(responseSukses({ loggedIn: false }, 'Akun tidak aktif'));
      }

      return reply.send(responseSukses({
        loggedIn: true,
        pengguna: serializeUser(profil),
        toko: serializeToko(profil?.toko),
      }, 'Sudah login'));
    } catch {
      return reply.send(responseSukses({ loggedIn: false }, 'Sesi tidak valid'));
    }
  },

  async profil(request, reply) {
    try {
      const profil = await authService.getProfil(request.pengguna.email);
      return reply.send(responseSukses({
        pengguna: serializeUser(profil),
        toko: serializeToko(profil?.toko),
      }, 'Data profil pengguna'));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: 'Gagal mengambil profil' });
    }
  },

  async logout(request, reply) {
    const authHeader = request.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (accessToken) {
      // Deny the current JWT immediately, then revoke its refresh session upstream.
      revokeAccessToken(accessToken);
      const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);
      if (error && ![401, 404].includes(error.status)) {
        return reply.code(502).send({ berhasil: false, pesan: 'Sesi belum dapat dicabut. Silakan coba lagi.' });
      }
    }
    reply.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    reply.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions, maxAge: 0 });
    return reply.send(responseSukses(null, 'Logout berhasil'));
  },
};
