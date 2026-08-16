import { supabaseAdmin } from '../../config/database.js';
import { sanitizePlainText } from '../../utils/sanitize.js';

export const satuanService = {
  async list(toko_id, pagination) {
    let query = supabaseAdmin
      .from('satuan')
      .select('*')
      .eq('toko_id', toko_id)
      .order('nama', { ascending: true });

    if (pagination) query = query.range(pagination.offset, pagination.end);

    const { data, error } = await query;

    if (error) throw new Error('Gagal mengambil daftar satuan');
    return data;
  },

  async tambah(toko_id, { nama }) {
    nama = sanitizePlainText(nama, { field: 'Nama satuan', max: 100 });
    const { data, error } = await supabaseAdmin
      .from('satuan')
      .insert({ toko_id, nama })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan satuan');
    return data;
  },

  async update(toko_id, id, { nama }) {
    nama = sanitizePlainText(nama, { field: 'Nama satuan', max: 100 });
    const { data, error } = await supabaseAdmin
      .from('satuan')
      .update({ nama })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit satuan');
    return data;
  },

  async hapus(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('satuan')
      .delete()
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menghapus satuan');
    return data;
  },
};
