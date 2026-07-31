import { supabaseAdmin } from '../../../config/database.js';

export const adminUsersController = {
  // GET /api/admin/users (List all tenants & owners)
  async listTenants(request, reply) {
    try {
      const { search, status } = request.query || {};

      let query = supabaseAdmin
        .from('toko')
        .select(`
          *,
          pengguna!fk_toko_owner(id, nama, email, role, aktif, created_at)
        `)
        .order('created_at', { ascending: false });

      if (search) {
        query = query.ilike('nama', `%${search}%`);
      }

      const { data: tokos, error } = await query;

      if (error) throw error;

      return reply.send({
        berhasil: true,
        pesan: 'Daftar Tenant Toko',
        data: tokos || [],
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengambil data tenant: ' + err.message,
      });
    }
  },

  // PUT /api/admin/users/:id/suspend
  async suspendTenant(request, reply) {
    try {
      const { id } = request.params;

      // Update toko & status pengguna
      await supabaseAdmin.from('pengguna').update({ aktif: false }).eq('toko_id', id);

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: request.admin?.id,
        aksi: 'SUSPEND_TENANT',
        referensi_id: id,
        referensi_tipe: 'toko',
      }]).catch(() => {});

      return reply.send({
        berhasil: true,
        pesan: 'Toko dan seluruh staf berhasil dinonaktifkan (suspend)',
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal suspend tenant: ' + err.message,
      });
    }
  },

  // PUT /api/admin/users/:id/aktifkan
  async aktifkanTenant(request, reply) {
    try {
      const { id } = request.params;

      await supabaseAdmin.from('pengguna').update({ aktif: true }).eq('toko_id', id);

      await supabaseAdmin.from('admin_log').insert([{
        admin_id: request.admin?.id,
        aksi: 'AKTIFKAN_TENANT',
        referensi_id: id,
        referensi_tipe: 'toko',
      }]).catch(() => {});

      return reply.send({
        berhasil: true,
        pesan: 'Toko berhasil diaktifkan kembali',
      });
    } catch (err) {
      return reply.code(500).send({
        berhasil: false,
        pesan: 'Gagal mengaktifkan tenant: ' + err.message,
      });
    }
  },
};
