import { authService } from './auth.service.js';
import { responseSukses } from '../../utils/response.js';
import { supabaseAdmin } from '../../config/database.js';
import { revokeAccessToken } from '../../utils/revoked-tokens.js';
import { serializeUser, serializeToko, serializeSession } from '../../utils/serializers.js';

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

// Token tidak pernah dikirim di JSON body. Hanya lewat HttpOnly cookie.
// (serializer dipakai untuk bentuk response aman)

export const authController = {
  async register(request, reply) {
    const { nama, email, password, nama_toko, alamat_toko, no_telp_toko } = request.body || {};
    if (!nama || !email || !password || !nama_toko) {
      return reply.code(400).send({ berhasil: false, pesan: 'Nama, email, password, dan nama toko wajib diisi' });
    }

    try {
      const hasil = await authService.registerOwner({ nama, email, password, nama_toko, alamat_toko, no_telp_toko });
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

    try {
      const hasil = await authService.login({ email, password });
      reply.setCookie(REFRESH_COOKIE, hasil.session?.refresh_token, refreshCookieOptions);
      reply.setCookie(ACCESS_COOKIE, hasil.session?.access_token, accessCookieOptions);
      // Response tidak mengirim token — hanya profil + toko yang di-serialize
      return reply.send(responseSukses({
        session: serializeSession(hasil.session),
        pengguna: serializeUser(hasil.pengguna),
        toko: serializeToko(hasil.toko),
      }, 'Login berhasil'));
    } catch (err) {
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

  async oauthSync(request, reply) {
    const { user } = request.body || {};
    if (!user || !user.email) {
      return reply.code(400).send({ berhasil: false, pesan: 'Data user OAuth tidak valid' });
    }

    try {
      const hasil = await authService.handleOAuthCallback({ user });
      return reply.send(responseSukses(hasil, 'OAuth Sync berhasil'));
    } catch (err) {
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
