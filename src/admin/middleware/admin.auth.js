import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET wajib di .env');

const ADMIN_COOKIE = 'tokiva_admin_token';

// Middleware Authenticate Pengguna Admin
export async function authenticateAdmin(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    const cookieToken = request.cookies?.[ADMIN_COOKIE];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : cookieToken;

    if (!token) {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Akses ditolak: Token JWT Admin tidak ditemukan',
      });
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

    // Fetch Admin — whitelist kolom aman, tanpa password_hash
    const { data: admin, error } = await supabaseAdmin
      .from('pengguna_admin')
      .select('id, nama, email, role, aktif')
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
      pesan: 'Authentication Error',
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
