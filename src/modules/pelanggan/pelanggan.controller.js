import { pelangganService } from './pelanggan.service.js';
import { responseSukses } from '../../utils/response.js';

export const pelangganController = {
  async list(request, reply) {
    const { search } = request.query || {};
    const data = await pelangganService.list(request.toko_id, search);
    return reply.send(responseSukses(data, 'Daftar pelanggan toko'));
  },

  async tambah(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama pelanggan wajib diisi' });

    const data = await pelangganService.tambah(request.toko_id, request.body || {});
    return reply.code(201).send(responseSukses(data, 'Pelanggan berhasil ditambahkan'));
  },

  async detail(request, reply) {
    const data = await pelangganService.detail(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Detail pelanggan'));
  },

  async update(request, reply) {
    const data = await pelangganService.update(request.toko_id, request.params.id, request.body || {});
    return reply.send(responseSukses(data, 'Pelanggan berhasil diperbarui'));
  },

  async delete(request, reply) {
    const data = await pelangganService.delete(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Pelanggan berhasil dihapus'));
  },
};
