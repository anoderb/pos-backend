import { satuanService } from './satuan.service.js';
import { responseSukses } from '../../utils/response.js';

export const satuanController = {
  async list(request, reply) {
    const data = await satuanService.list(request.toko_id, request.pagination);
    return reply.send(responseSukses(data, 'Daftar satuan toko'));
  },

  async tambah(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama satuan wajib diisi' });

    const data = await satuanService.tambah(request.toko_id, { nama });
    return reply.code(201).send(responseSukses(data, 'Satuan berhasil ditambahkan'));
  },

  async update(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama satuan wajib diisi' });

    const data = await satuanService.update(request.toko_id, request.params.id, { nama });
    return reply.send(responseSukses(data, 'Satuan berhasil diperbarui'));
  },

  async hapus(request, reply) {
    const data = await satuanService.hapus(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Satuan berhasil dihapus'));
  },
};
