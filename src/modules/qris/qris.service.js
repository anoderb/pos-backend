import { supabaseAdmin } from '../../config/database.js';
import { validateQRIS, parseQRIS, convertQRIS } from '../../utils/qris-utils.mjs';

export const qrisService = {
  // Set/Update QRIS toko — validasi dulu, simpan hanya kalau valid
  async setQrisToko(toko_id, owner_id, { qris_string }) {
    const clean = String(qris_string || '').trim();

    // Verifikasi ownership toko
    const { data: toko } = await supabaseAdmin
      .from('toko')
      .select('id, owner_id')
      .eq('id', toko_id)
      .maybeSingle();
    if (!toko) throw new Error('Data toko tidak ditemukan');
    if (toko.owner_id !== owner_id) throw new Error('Anda tidak memiliki akses untuk mengubah toko ini');

    if (!clean) {
      // Kalau string kosong → hapus QRIS (tidak aktif)
      await supabaseAdmin
        .from('toko')
        .update({ qris_string: null, qris_status: 'empty', qris_info: null })
        .eq('id', toko_id);
      return { qris_status: 'empty', pesan: 'QRIS dihapus' };
    }

    // Validasi struktur + CRC
    const result = validateQRIS(clean);
    if (!result.valid) {
      // Simpan status invalid biar FE bisa tampilkan error jelas
      await supabaseAdmin
        .from('toko')
        .update({ qris_string: clean, qris_status: 'invalid', qris_info: null })
        .eq('id', toko_id);
      throw new Error(`QRIS tidak valid: ${result.errors.join('; ')}`);
    }

    const info = parseQRIS(clean);
    const infoRingkas = {
      merchant_name: info.merchantName || '',
      merchant_city: info.merchantCity || '',
      merchant_id: info.merchantAccountInfo?.[0]?.merchantId || '',
      method: info.method,
      country: info.countryCode,
    };

    await supabaseAdmin
      .from('toko')
      .update({ qris_string: clean, qris_status: 'valid', qris_info: infoRingkas })
      .eq('id', toko_id);

    return { qris_status: 'valid', qris_info: infoRingkas, pesan: 'QRIS berhasil disimpan dan diaktifkan' };
  },

  // Generate QRIS dinamis untuk transaksi tertentu (pure function, tidak pakai DB)
  generateDinamis(qris_string, amount) {
    if (!qris_string) throw new Error('QRIS belum diatur untuk toko ini');
    return convertQRIS(qris_string, { amount: Math.round(amount) });
  },
};
