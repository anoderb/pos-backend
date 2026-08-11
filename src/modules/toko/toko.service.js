import { supabaseAdmin } from '../../config/database.js';

export const tokoService = {
  // Ambil detail toko sendiri
  async getToko(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('toko')
      .select('*')
      .eq('id', toko_id)
      .single();

    if (error) throw new Error('Data toko tidak ditemukan');
    return data;
  },

  // Update setting toko (Nama, Alamat, No Telp, Tema, Warna, Info Rekening)
  async updateToko(toko_id, payload) {
    const { nama, alamat, no_telp, tema, warna_utama, info_rekening } = payload;

    const updateData = {};
    if (nama !== undefined) updateData.nama = nama;
    if (alamat !== undefined) updateData.alamat = alamat;
    if (no_telp !== undefined) updateData.no_telp = no_telp;
    if (tema !== undefined) updateData.tema = tema;
    if (warna_utama !== undefined) updateData.warna_utama = warna_utama;
    if (info_rekening !== undefined) updateData.info_rekening = info_rekening;

    const { data, error } = await supabaseAdmin
      .from('toko')
      .update(updateData)
      .eq('id', toko_id)
      .select()
      .single();

    if (error) throw new Error('Gagal memperbarui data toko: ' + error.message);
    return data;
  },

  // Update URL logo / QRIS toko
  async updateMediaToko(toko_id, field, media_url) {
    const { data, error } = await supabaseAdmin
      .from('toko')
      .update({ [field]: media_url })
      .eq('id', toko_id)
      .select()
      .single();

    if (error) throw new Error('Gagal memperbarui foto toko');
    return data;
  },
};
