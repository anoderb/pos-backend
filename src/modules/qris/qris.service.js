import { supabaseAdmin } from '../../config/database.js';
import { validateQRIS, parseQRIS, convertQRIS } from '../../utils/qris-utils.mjs';
import { httpError } from '../../utils/errors.js';

function qrisUserError() {
  return new Error('Barcode QRIS tidak valid atau tidak lengkap. Silakan upload ulang foto QRIS statis asli dari penyedia pembayaran.');
}

export const qrisService = {
  // Simpan QRIS statis milik toko setelah validasi penuh.
  async setQrisToko(toko_id, owner_id, { qris_string }) {
    const clean = String(qris_string || '').trim();

    const { data: toko, error: tokoError } = await supabaseAdmin
      .from('toko')
      .select('id, owner_id')
      .eq('id', toko_id)
      .maybeSingle();
    if (tokoError) throw new Error('Gagal memeriksa data toko');
    if (!toko) throw httpError(404, 'Data toko tidak ditemukan');
    if (toko.owner_id !== owner_id) throw httpError(403, 'Anda tidak memiliki akses untuk mengubah toko ini');

    if (!clean) {
      const { error } = await supabaseAdmin
        .from('toko')
        .update({ qris_string: null, qris_status: 'empty', qris_info: null, qris_aktif: false })
        .eq('id', toko_id);
      if (error) throw new Error('Gagal menghapus QRIS toko');
      return { qris_status: 'empty', qris_aktif: false, pesan: 'QRIS toko berhasil dihapus' };
    }

    const result = validateQRIS(clean, {
      requireStatic: true,
      requireIdr: true,
      requireMerchantDetails: true,
    });
    if (!result.valid) {
      // Payload invalid tidak disimpan dan tidak boleh mengaktifkan QRIS.
      throw qrisUserError();
    }

    let info;
    try {
      info = parseQRIS(clean);
    } catch {
      throw qrisUserError();
    }

    const infoRingkas = {
      merchant_name: info.merchantName,
      merchant_city: info.merchantCity,
      merchant_id: info.merchantAccountInfo?.[0]?.merchantId || '',
      method: info.method,
      country: info.countryCode,
      currency: info.currency,
    };

    const { error } = await supabaseAdmin
      .from('toko')
      .update({
        qris_string: clean,
        qris_status: 'valid',
        qris_info: infoRingkas,
        qris_aktif: true,
      })
      .eq('id', toko_id);
    if (error) throw new Error('Gagal menyimpan QRIS toko');

    return {
      qris_status: 'valid',
      qris_info: infoRingkas,
      qris_aktif: true,
      pesan: 'QRIS berhasil dibaca, diverifikasi, dan diaktifkan',
    };
  },

  // Generate payload QRIS dinamis dari QRIS statis yang sudah valid.
  generateDinamis(qris_string, amount) {
    if (!qris_string) throw new Error('QRIS belum diatur untuk toko ini');
    try {
      return convertQRIS(qris_string, { amount: Math.round(amount) });
    } catch {
      throw new Error('QRIS toko tidak dapat diubah menjadi QR pembayaran. Silakan upload ulang QRIS asli.');
    }
  },
};
