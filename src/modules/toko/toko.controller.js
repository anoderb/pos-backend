import { tokoService } from './toko.service.js';
import { responseSukses } from '../../utils/response.js';

export const tokoController = {
  // GET /api/toko
  async getToko(request, reply) {
    const toko = await tokoService.getToko(request.toko_id);
    return reply.send(responseSukses(toko, 'Detail data toko'));
  },

  // PUT /api/toko
  async updateToko(request, reply) {
    const toko = await tokoService.updateToko(request.toko_id, request.body || {});
    return reply.send(responseSukses(toko, 'Pengaturan toko berhasil diperbarui'));
  },

  // POST /api/toko/logo
  async uploadLogo(request, reply) {
    const { logo_url } = request.body || {};
    if (!logo_url) {
      return reply.code(400).send({ berhasil: false, pesan: 'logo_url wajib diisi' });
    }
    const toko = await tokoService.updateMediaToko(request.toko_id, 'logo_url', logo_url);
    return reply.send(responseSukses(toko, 'Logo toko berhasil diperbarui'));
  },

  // POST /api/toko/qris
  async uploadQris(request, reply) {
    const { qris_url } = request.body || {};
    if (!qris_url) {
      return reply.code(400).send({ berhasil: false, pesan: 'qris_url wajib diisi' });
    }
    const toko = await tokoService.updateMediaToko(request.toko_id, 'qris_url', qris_url);
    return reply.send(responseSukses(toko, 'Gambar QRIS berhasil diperbarui'));
  },
};
