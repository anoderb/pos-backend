import { authService } from './auth.service.js';
import { responseSukses } from '../../utils/response.js';

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
      return reply.send(responseSukses(hasil, 'Login berhasil'));
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
    const { email } = request.body || {};
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

  async refresh(request, reply) {
    const { refresh_token } = request.body || {};
    if (!refresh_token) {
      return reply.code(400).send({ berhasil: false, pesan: 'refresh_token wajib diisi' });
    }

    try {
      const session = await authService.refreshToken(refresh_token);
      return reply.send(responseSukses(session, 'Token berhasil diperbarui'));
    } catch (err) {
      return reply.code(401).send({ berhasil: false, pesan: err.message });
    }
  },

  async profil(request, reply) {
    try {
      const profil = await authService.getProfil(request.pengguna.email);
      return reply.send(responseSukses(profil, 'Data profil pengguna'));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
  },

  async logout(request, reply) {
    try {
      await supabaseAuth.auth.signOut();
    } catch (e) {
      console.error('Supabase signOut error:', e.message);
    }
    reply.clearCookie?.('tokiva_token');
    return reply.send(responseSukses(null, 'Logout berhasil'));
  },
};
