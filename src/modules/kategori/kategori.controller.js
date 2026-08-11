import { kategoriService } from './kategori.service.js';
import { responseSukses } from '../../utils/response.js';

export const kategoriController = {
  async list(request, reply) {
    const data = await kategoriService.list(request.toko_id);
    return reply.send(responseSukses(data, 'Daftar kategori toko'));
  },

  async tambah(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama kategori wajib diisi' });

    const data = await kategoriService.tambah(request.toko_id, { nama });
    return reply.code(201).send(responseSukses(data, 'Kategori berhasil ditambahkan'));
  },

  async update(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama kategori wajib diisi' });

    const data = await kategoriService.update(request.toko_id, request.params.id, { nama });
    return reply.send(responseSukses(data, 'Kategori berhasil diperbarui'));
  },

  async hapus(request, reply) {
    const data = await kategoriService.hapus(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Kategori berhasil dihapus'));
  },
};
