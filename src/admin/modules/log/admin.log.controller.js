import { supabaseAdmin } from '../../../config/database.js';

export const adminLogController = {
  // GET /api/admin/log/aktivitas
  async listAktivitas(request, reply) {
    try {
      const { limit = 50 } = request.query || {};

      const { data: logs, error } = await supabaseAdmin
        .from('admin_log')
        .select('*, pengguna_admin(nama, email, role)')
        .order('created_at', { ascending: false })
        .limit(Number(limit));

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Audit Log Admin',
        data: logs || [],
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil audit log: ' + err.message,
      });
    }
  },
};
