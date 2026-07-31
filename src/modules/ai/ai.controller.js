import { aiService } from './ai.service.js';
import { responseSukses } from '../../utils/response.js';

export const aiController = {
  async getActiveModel(request, reply) {
    const data = await aiService.getActiveModel();
    if (!data) {
      return reply.code(404).send({ berhasil: false, pesan: 'Tidak ada model AI yang aktif saat ini' });
    }
    return reply.send(responseSukses(data, 'Model AI aktif berhasil diambil'));
  },

  async simpan(request, reply) {
    const { foto_url, foto_base64, produk_dipilih_id } = request.body || {};
    if (!foto_url && !foto_base64) {
      return reply.code(400).send({ berhasil: false, pesan: 'foto_url atau foto_base64 wajib diisi' });
    }
    if (!produk_dipilih_id) {
      return reply.code(400).send({ berhasil: false, pesan: 'produk_dipilih_id wajib diisi' });
    }

    const data = await aiService.simpanKoreksi(request.toko_id, request.pengguna.id, request.body);
    return reply.code(201).send(responseSukses(data, 'Koreksi AI berhasil disimpan'));
  },

  async list(request, reply) {
    const list = await aiService.listKoreksi(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar koreksi AI menunggu review'));
  },

  async review(request, reply) {
    const { status } = request.body || {};
    if (!status) return reply.code(400).send({ berhasil: false, pesan: 'Status wajib diisi' });

    const data = await aiService.reviewKoreksi(request.toko_id, request.params.id, request.pengguna.id, { status });
    return reply.send(responseSukses(data, `Koreksi AI berhasil di-update ke ${status}`));
  },
};
