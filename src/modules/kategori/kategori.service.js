import { supabaseAdmin } from '../../config/database.js';
import { sanitizePlainText } from '../../utils/sanitize.js';

export const kategoriService = {
  async list(toko_id, pagination) {
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .select('*')
      .eq('toko_id', toko_id)
      .order('nama', { ascending: true });

    if (pagination) query = query.range(pagination.offset, pagination.end);

    if (error) throw new Error('Gagal mengambil daftar kategori');
    return data;
  },

  async tambah(toko_id, { nama }) {
    nama = sanitizePlainText(nama, { field: 'Nama kategori', max: 200 });
    if (!nama || !nama.trim()) {
      throw new Error('Nama kategori wajib diisi');
    }
    if (nama.length > 200) {
      throw new Error('Nama kategori maksimal 200 karakter');
    }
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .insert({ toko_id, nama: nama.trim() })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan kategori');
    return data;
  },

  async update(toko_id, id, { nama }) {
    nama = sanitizePlainText(nama, { field: 'Nama kategori', max: 200 });
    if (!nama || !nama.trim()) {
      throw new Error('Nama kategori wajib diisi');
    }
    if (nama.length > 200) {
      throw new Error('Nama kategori maksimal 200 karakter');
    }
    const { data, error } = await supabaseAdmin
      .from('kategori')
      .update({ nama: nama.trim() })
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
