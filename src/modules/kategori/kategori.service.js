import { supabaseAdmin } from '../../config/database.js';

export const kategoriService = {
  async list(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .select('*')
      .eq('toko_id', toko_id)
      .order('nama', { ascending: true });

    if (error) throw new Error('Gagal mengambil daftar kategori');
    return data;
  },

  async tambah(toko_id, { nama }) {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .insert({ toko_id, nama })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan kategori');
    return data;
  },

  async update(toko_id, id, { nama }) {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .update({ nama })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit kategori');
    return data;
  },

  async hapus(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .delete()
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menghapus kategori');
    return data;
  },
};
