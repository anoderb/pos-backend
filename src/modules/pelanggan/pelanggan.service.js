import { supabaseAdmin } from '../../config/database.js';

function sanitize(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/<[^>]*>/g, '').replace(/[{}<>$%]/g, '').trim();
}

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
    const clean = { ...payload };
    delete clean.id;
    delete clean.toko_id;
    delete clean.created_at;
    delete clean.updated_at;

    if (!clean.nama || !clean.nama.trim()) {
      throw new Error('Nama pelanggan wajib diisi');
    }
    clean.nama = sanitize(clean.nama);

    // Cek duplikat nama
    const { data: existing } = await supabaseAdmin
      .from('pelanggan')
      .select('id')
      .eq('toko_id', toko_id)
      .eq('nama', clean.nama)
      .maybeSingle();
    if (existing) {
      throw new Error('Nama pelanggan sudah terdaftar');
    }

    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .insert({ toko_id, ...clean })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan pelanggan: ' + error.message);
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
    const clean = { ...payload };
    delete clean.id;
    delete clean.toko_id;
    delete clean.created_at;
    delete clean.updated_at;

    const { data, error } = await supabaseAdmin
      .from('pelanggan')
      .update(clean)
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit pelanggan: ' + error.message);
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
