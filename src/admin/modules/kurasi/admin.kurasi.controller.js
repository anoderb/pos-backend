import { supabaseAdmin } from '../../../config/database.js';

export const adminKurasiController = {
  // GET /api/admin/kurasi (List pending cashier corrections & user photos)
  async listPendingKurasi(request, reply) {
    try {
      const { data: koreksi, error } = await supabaseAdmin
        .from('koreksi_ai')
        .select(`
          *,
          toko(nama),
          pengguna!koreksi_ai_kasir_id_fkey(nama),
          produk_dipilih:produk!koreksi_ai_produk_dipilih_id_fkey(nama, barcode)
        `)
        .eq('status', 'menunggu')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Antrean Kurasi Koreksi Kasir',
        data: koreksi || [],
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil data kurasi: ' + err.message,
      });
    }
  },

  // PUT /api/admin/kurasi/:id/setujui
  async setujuiKoreksi(request, reply) {
    try {
      const { id } = request.params;
      const adminId = request.admin?.id;

      // 1. Get koreksi detail with target product class
      const { data: item } = await supabaseAdmin
        .from('koreksi_ai')
        .select('*, produk_dipilih:produk_dipilih_id(id, class_produk_id)')
        .eq('id', id)
        .single();

      if (!item) {
        return reply.code(404).send({ berhasil: false, pesan: 'Data koreksi tidak ditemukan' });
      }

      // 2. Update status in koreksi_ai
      await supabaseAdmin
        .from('koreksi_ai')
        .update({ status: 'disetujui', reviewed_by: adminId, reviewed_at: new Date() })
        .eq('id', id);

      const targetClassId = item.produk_dipilih?.class_produk_id || null;

      // 3. Add to dataset_foto table with class_id linked
      await supabaseAdmin.from('dataset_foto').insert([{
        class_id: targetClassId,
        foto_url: item.foto_url,
        sumber: 'koreksi_kasir',
        referensi_id: item.id,
        toko_id: item.toko_id,
        status: 'disetujui',
        lokasi: 'supabase',
        reviewed_by: adminId,
        reviewed_at: new Date(),
      }]);

      return reply.send({
        berhasil: true,
        pesan: 'Koreksi kasir berhasil disetujui & dimasukkan ke dataset latihan AI',
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal menyetujui koreksi: ' + err.message,
      });
    }
  },

  // PUT /api/admin/kurasi/:id/tolak
  async tolakKoreksi(request, reply) {
    try {
      const { id } = request.params;
      const { catatan } = request.body || {};
      const adminId = request.admin?.id;

      await supabaseAdmin
        .from('koreksi_ai')
        .update({
          status: 'ditolak',
          reviewed_by: adminId,
          reviewed_at: new Date(),
        })
        .eq('id', id);

      return reply.send({
        berhasil: true,
        pesan: 'Koreksi kasir berhasil ditolak',
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal menolak koreksi: ' + err.message,
      });
    }
  },
};
