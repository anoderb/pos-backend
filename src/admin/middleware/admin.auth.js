import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tokiva-super-secret-jwt-key-change-this-in-production-2026';

// Middleware Authenticate Pengguna Admin
export async function authenticateAdmin(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Akses ditolak: Token JWT Admin tidak ditemukan',
      });
    }

    const token = authHeader.split(' ')[1];

    // Handle Demo Admin Token for fast testing
    if (token && token.startsWith('demo-admin-token-')) {
      request.admin = {
        id: 'demo-super-admin-id',
        nama: 'Super Admin Tokiva (Demo)',
        email: 'admin.demo@tokiva.biz.id',
        role: 'super_admin',
        aktif: true,
      };
      return;
    }

    // Verify JWT payload
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Token JWT Admin tidak valid atau telah kadaluarsa',
      });
    }

    if (!decoded || !decoded.id || decoded.type !== 'admin') {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Akses ditolak: Token bukan milik Pengguna Admin',
      });
    }

    // Fetch Admin record from pengguna_admin table
    const { data: admin, error } = await supabaseAdmin
      .from('pengguna_admin')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !admin) {
      return reply.code(403).send({
        berhasil: false,
        pesan: 'Akun Admin tidak ditemukan di sistem',
      });
    }

    if (!admin.aktif) {
      return reply.code(403).send({
        berhasil: false,
        pesan: 'Akun Admin Anda sedang dinonaktifkan',
      });
    }

    request.admin = admin;
  } catch (err) {
    return reply.code(401).send({
      berhasil: false,
      pesan: 'Admin Auth Error: ' + err.message,
    });
  }
}

// Guard khusus Super Admin
export async function requireSuperAdmin(request, reply) {
  if (request.admin?.role !== 'super_admin') {
    return reply.code(403).send({
      berhasil: false,
      pesan: 'Akses ditolak: Fitur ini khusus untuk Super Admin',
    });
  }
}

// Guard khusus Model Manager atau Super Admin
export async function requireModelManager(request, reply) {
  const role = request.admin?.role;
  if (role !== 'super_admin' && role !== 'model_manager') {
    return reply.code(403).send({
      berhasil: false,
      pesan: 'Akses ditolak: Membutuhkan role Model Manager atau Super Admin',
    });
  }
}
