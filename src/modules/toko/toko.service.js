import { supabaseAdmin } from '../../config/database.js';

function sanitize(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/<[^>]*>/g, '').replace(/[{}<>$%]/g, '').trim();
}

function isValidUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const blocked = ['127.0.0.1', 'localhost', '0.0.0.0', '10.', '172.16.', '192.168.', '169.254.'];
    if (blocked.some(p => parsed.hostname.startsWith(p))) return false;
    return parsed.protocol === 'https:';
  } catch { return false; }
}

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
  async updateToko(toko_id, payload, owner_id) {
    const clean = { ...payload };
    delete clean.id;
    delete clean.toko_id;
    delete clean.created_at;
    delete clean.updated_at;
    delete clean.owner_id;

    // Verify ownership: toko_id belongs to owner
    const { data: existing } = await supabaseAdmin
      .from('toko')
      .select('id, owner_id')
      .eq('id', toko_id)
      .single();

    if (!existing) throw new Error('Data toko tidak ditemukan');
    if (existing.owner_id !== owner_id) {
      throw new Error('Anda tidak memiliki akses untuk mengubah data toko ini');
    }

    const updateData = {};
    if (clean.nama !== undefined) updateData.nama = clean.nama;
    if (clean.alamat !== undefined) updateData.alamat = clean.alamat;
    if (clean.no_telp !== undefined) updateData.no_telp = clean.no_telp;
    if (clean.tema !== undefined) updateData.tema = clean.tema;
    if (clean.warna_utama !== undefined) updateData.warna_utama = clean.warna_utama;
    if (clean.info_rekening !== undefined) updateData.info_rekening = sanitize(clean.info_rekening);

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
    if (!isValidUrl(media_url)) {
      throw new Error('URL tidak valid. Hanya URL HTTPS yang diizinkan.');
    }
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
