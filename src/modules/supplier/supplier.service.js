import { supabaseAdmin } from '../../config/database.js';

export const supplierService = {
  async list(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('supplier')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('aktif', true)
      .order('nama', { ascending: true });

    if (error) throw new Error('Gagal mengambil daftar supplier');
    return data;
  },

  async tambah(toko_id, payload) {
    const { data, error } = await supabaseAdmin
      .from('supplier')
      .insert({ toko_id, ...payload, aktif: true })
      .select()
      .single();

    if (error) throw new Error('Gagal menambahkan supplier');
    return data;
  },

  async detail(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('supplier')
      .select('*, nota_masuk(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Supplier tidak ditemukan');
    return data;
  },

  async update(toko_id, id, payload) {
    const { data, error } = await supabaseAdmin
      .from('supplier')
      .update(payload)
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit supplier');
    return data;
  },

  async delete(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('supplier')
      .update({ aktif: false })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menonaktifkan supplier');
    return data;
  },

  // Rekap Hutang Khusus Supplier Ini
  async getHutangSupplier(toko_id, supplier_id) {
    const { data, error } = await supabaseAdmin
      .from('nota_masuk')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('supplier_id', supplier_id)
      .gt('sisa_hutang', 0);

    if (error) throw new Error('Gagal mengambil hutang supplier');

    const totalHutang = (data || []).reduce((sum, n) => sum + Number(n.sisa_hutang), 0);

    return {
      supplier_id,
      total_hutang: totalHutang,
      nota_hutang: data,
    };
  },
};
