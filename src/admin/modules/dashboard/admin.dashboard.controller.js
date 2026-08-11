import { supabaseAdmin } from '../../../config/database.js';

export const adminDashboardController = {
  // GET /api/admin/dashboard
  async getMetrics(request, reply) {
    try {
      // 1. Total Toko & User
      const { count: totalToko } = await supabaseAdmin.from('toko').select('id', { count: 'exact', head: true });
      const { count: totalUser } = await supabaseAdmin.from('pengguna').select('id', { count: 'exact', head: true });
      const { count: totalProduk } = await supabaseAdmin.from('produk').select('id', { count: 'exact', head: true });

      // 2. AI Metrics
      const { count: totalClass } = await supabaseAdmin.from('class_produk').select('id', { count: 'exact', head: true });
      const { count: totalFotoDataset } = await supabaseAdmin.from('dataset_foto').select('id', { count: 'exact', head: true });
      const { count: totalKoreksiPending } = await supabaseAdmin.from('koreksi_ai').select('id', { count: 'exact', head: true }).eq('status', 'menunggu');

      // 3. Active Model
      const { data: activeModel } = await supabaseAdmin
        .from('model_versi')
        .select('*')
        .eq('status', 'aktif')
        .maybeSingle();

      // 4. Recent Logs
      const { data: recentLogs } = await supabaseAdmin
        .from('admin_log')
        .select('*, pengguna_admin(nama)')
        .order('created_at', { ascending: false })
        .limit(5);

      return reply.send({
        berhasil: true,
        pesan: 'Data Dashboard Admin',
        data: {
          toko: {
            total: totalToko || 0,
            total_pengguna: totalUser || 0,
            total_produk: totalProduk || 0,
          },
          ai: {
            total_class: totalClass || 0,
            total_foto_dataset: totalFotoDataset || 0,
            total_koreksi_pending: totalKoreksiPending || 0,
            model_aktif: activeModel || { versi: 'v1.0', akurasi: 0.9500, status: 'aktif' },
          },
          recent_logs: recentLogs || [],
        },
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil data dashboard: ' + err.message,
      });
    }
  },
};
