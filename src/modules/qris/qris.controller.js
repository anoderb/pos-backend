import { supabaseAdmin } from '../../config/database.js';
import { qrisService } from './qris.service.js';
import { responseSukses } from '../../utils/response.js';

export const qrisController = {
  // PUT /owner/toko/qris — set/validasi QRIS toko
  async setQris(request, reply) {
    const { qris_string } = request.body || {};
    try {
      const hasil = await qrisService.setQrisToko(request.toko_id, request.pengguna.id, { qris_string });
      return reply.send(responseSukses(hasil, hasil.pesan || 'QRIS disimpan'));
    } catch (err) {
      const code = String(err.message || '').startsWith('QRIS tidak valid') ? 400 : 403;
      return reply.code(code).send({ berhasil: false, pesan: err.message });
    }
  },

  // GET /owner/toko/qris/status — info status QRIS toko (buat FE)
  async getStatus(request, reply) {
    const { data: toko } = await supabaseAdmin
      .from('toko')
      .select('qris_status, qris_info, qris_string')
      .eq('id', request.toko_id)
      .maybeSingle();
    if (!toko) return reply.code(404).send({ berhasil: false, pesan: 'Toko tidak ditemukan' });
    return reply.send(responseSukses({
      status: toko.qris_status || 'empty',
      info: toko.qris_info,
      qris_string: toko.qris_string || null,
    }, 'Status QRIS toko'));
  },
};
