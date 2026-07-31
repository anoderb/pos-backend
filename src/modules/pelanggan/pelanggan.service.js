import { supabaseAdmin } from '../../config/database.js';

export const pelangganService = {
  async list(toko_id, search) {
    let query = supabaseAdmin
      .from('pelanggan')
      .select('*')
      .eq('toko_id', toko_id)
      .order('nama', { ascending: true });

    if (search) {
      query = query.or(`nama.ilike.%${search}%,no_hp.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil daftar pelanggan');
    return data;
  },

  async tambah(toko_id, payload) {
    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .insert({ toko_id, ...payload })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan pelanggan');
    return data;
  },

  async detail(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .select('*, transaksi(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Pelanggan tidak ditemukan');
    return data;
  },

  async update(toko_id, id, payload) {
    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .update(payload)
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit pelanggan');
    return data;
  },

  async delete(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .delete()
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menghapus pelanggan');
    return data;
  },
};
