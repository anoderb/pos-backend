import { supabaseAdmin } from '../../config/database.js';
import { sanitizeOptionalText } from '../../utils/sanitize.js';

function isValidUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const blocked = ['127.0.0.1', 'localhost', '0.0.0.0', '10.', '172.16.', '192.168.', '169.254.'];
    if (blocked.some(p => parsed.hostname.startsWith(p))) return false;
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    const configuredHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
    return Boolean(configuredHost && (parsed.hostname === configuredHost || parsed.hostname.endsWith('.supabase.co')));
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
    if (clean.nama !== undefined) updateData.nama = sanitizeOptionalText(clean.nama, { max: 200 });
    if (clean.alamat !== undefined) updateData.alamat = sanitizeOptionalText(clean.alamat, { max: 500 });
    if (clean.no_telp !== undefined) updateData.no_telp = sanitizeOptionalText(clean.no_telp, { max: 30 });
    if (clean.tema !== undefined) updateData.tema = sanitizeOptionalText(clean.tema, { max: 50 });
    if (clean.warna_utama !== undefined) updateData.warna_utama = sanitizeOptionalText(clean.warna_utama, { max: 30 });
    if (clean.info_rekening !== undefined) updateData.info_rekening = sanitizeOptionalText(clean.info_rekening, { max: 500 });

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
