import { supabaseAdmin } from '../../config/database.js';
import { qrisService } from './qris.service.js';
import { responseSukses } from '../../utils/response.js';

export const qrisController = {
  // PUT /owner/toko/qris — set/validasi QRIS toko
  async setQris(request, reply) {
    const { qris_string } = request.body || {};
    const hasil = await qrisService.setQrisToko(request.toko_id, request.pengguna.id, { qris_string });
    return reply.send(responseSukses(hasil, hasil.pesan || 'QRIS disimpan'));
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
