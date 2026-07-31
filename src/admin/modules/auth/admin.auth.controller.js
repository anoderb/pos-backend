import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../../../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tokiva-super-secret-jwt-key-change-this-in-production-2026';

export const adminAuthController = {
  // POST /api/admin/auth/login
  async login(request, reply) {
    try {
      const { email, password } = request.body || {};

      if (!email || !password) {
        return reply.code(400).send({
          berhasil: false,
          pesan: 'Email dan password wajib diisi',
        });
      }

      // 1. Fetch admin from pengguna_admin table
      const { data: admin, error } = await supabaseAdmin
        .from('pengguna_admin')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (error || !admin) {
        return reply.code(401).send({
          berhasil: false,
          pesan: 'Email atau password Admin salah',
        });
      }

      if (!admin.aktif) {
        return reply.code(403).send({
          berhasil: false,
          pesan: 'Akun Admin Anda telah dinonaktifkan',
        });
      }

      // 2. Compare password
      let isValidPassword = false;
      if (admin.password_hash) {
        isValidPassword = await bcrypt.compare(password, admin.password_hash);
      }

      if (!isValidPassword) {
        return reply.code(401).send({
          berhasil: false,
          pesan: 'Email atau password Admin salah',
        });
      }

      // 3. Generate Admin JWT Token
      const token = jwt.sign(
        {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          type: 'admin',
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Log activity
      await supabaseAdmin.from('admin_log').insert([{
        admin_id: admin.id,
        aksi: 'LOGIN_ADMIN',
        detail: { ip: request.ip, user_agent: request.headers['user-agent'] },
      }]).catch(() => {});

      return reply.send({
        berhasil: true,
        pesan: 'Login Admin Berhasil',
        data: {
          token,
          admin: {
            id: admin.id,
            nama: admin.nama,
            email: admin.email,
            role: admin.role,
          },
        },
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal Login Admin: ' + err.message,
      });
    }
  },

  // GET /api/admin/auth/profil
  async profil(request, reply) {
    return reply.send({
      berhasil: true,
      pesan: 'Data Profil Admin',
      data: request.admin,
    });
  },

  // POST /api/admin/auth/ganti-password
  async gantiPassword(request, reply) {
    try {
      const { password_lama, password_baru } = request.body || {};
      const adminId = request.admin.id;

      if (!password_lama || !password_baru) {
        return reply.code(400).send({
          berhasil: false,
          pesan: 'Password lama dan password baru wajib diisi',
        });
      }

      const { data: admin } = await supabaseAdmin
        .from('pengguna_admin')
        .select('password_hash')
        .eq('id', adminId)
        .single();

      if (!admin || !(await bcrypt.compare(password_lama, admin.password_hash))) {
        return reply.code(400).send({
          berhasil: false,
          pesan: 'Password lama Anda tidak sesuai',
        });
      }

      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(password_baru, salt);

      await supabaseAdmin
        .from('pengguna_admin')
        .update({ password_hash: newHash, updated_at: new Date() })
        .eq('id', adminId);

      return reply.send({
        berhasil: true,
        pesan: 'Password Admin berhasil diperbarui',
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal ganti password: ' + err.message,
      });
    }
  },
};
