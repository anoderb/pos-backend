import { supabaseAdmin } from '../../config/database.js';

export const aiService = {
  // 1. Simpan Koreksi Kasir saat AI confidence rendah
  async simpanKoreksi(toko_id, kasir_id, payload) {
    const {
      foto_url,
      prediksi_1_produk_id,
      prediksi_1_confidence,
      prediksi_2_produk_id,
      prediksi_2_confidence,
      prediksi_3_produk_id,
      prediksi_3_confidence,
      produk_dipilih_id,
    } = payload;

    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .insert({
        toko_id,
        kasir_id,
        foto_url,
        prediksi_1_produk_id,
        prediksi_1_confidence,
        prediksi_2_produk_id,
        prediksi_2_confidence,
        prediksi_3_produk_id,
        prediksi_3_confidence,
        produk_dipilih_id,
        status: 'menunggu',
      })
      .select()
      .single();

    if (error) throw new Error('Gagal menyimpan koreksi AI: ' + error.message);
    return data;
  },

  // 2. List Koreksi Menunggu Review
  async listKoreksi(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .select('*, kasir:kasir_id(nama), produk_dipilih:produk_dipilih_id(nama)')
      .eq('toko_id', toko_id)
      .eq('status', 'menunggu')
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar koreksi AI');
    return data;
  },

  // 3. Review Koreksi AI (Approve / Reject) oleh Owner
  async reviewKoreksi(toko_id, id, reviewed_by_id, { status }) {
    if (!['disetujui', 'ditolak'].includes(status)) {
      throw new Error('Status harus disetujui atau ditolak');
    }

    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .update({
        status,
        reviewed_by: reviewed_by_id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal merespons koreksi AI');
    return data;
  },
};
