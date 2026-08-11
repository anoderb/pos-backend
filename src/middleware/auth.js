import { supabaseAdmin } from '../config/database.js';

// Middleware verifikasi JWT Bearer Token
export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Akses ditolak: Token JWT tidak ditemukan',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verifikasi token via Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return reply.code(401).send({
        berhasil: false,
        pesan: 'Sesi login telah kadaluarsa. Silakan login kembali.',
      });
    }

    // Ambil data detail dari tabel `pengguna`
    const { data: profil, error: profilErr } = await supabaseAdmin
      .from('pengguna')
      .select('*')
      .eq('email', user.email)
      .single();

    if (profilErr || !profil) {
      return reply.code(403).send({
        berhasil: false,
        pesan: 'Profil pengguna tidak ditemukan atau belum terdaftar di toko',
      });
    }

    if (!profil.aktif) {
      return reply.code(403).send({
        berhasil: false,
        pesan: 'Akun Anda telah dinonaktifkan oleh Owner toko',
      });
    }

    // Inject data pengguna & toko ke objek request
    request.user = user;
    request.pengguna = profil;
    request.toko_id = profil.toko_id;
  } catch (err) {
    return reply.code(401).send({
      berhasil: false,
      pesan: 'Authentication Error: ' + err.message,
    });
  }
}

// Middleware otorisasi khusus role Owner
export async function requireOwner(request, reply) {
  if (request.pengguna?.role !== 'owner') {
    return reply.code(403).send({
      berhasil: false,
      pesan: 'Akses ditolak: Fitur ini hanya dapat diakses oleh Owner Toko',
    });
  }
}
