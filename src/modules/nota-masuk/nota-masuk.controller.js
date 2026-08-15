import { notaMasukService } from './nota-masuk.service.js';
import { responseSukses } from '../../utils/response.js';

export const notaMasukController = {
  async buat(request, reply) {
    const { supplier_id, total, items } = request.body || {};
    if (!supplier_id || !total || !items || items.length === 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'supplier_id, total, dan items wajib diisi' });
    }

    const nota = await notaMasukService.buatNotaMasuk(request.toko_id, request.pengguna.id, request.body);
    return reply.code(201).send(responseSukses(nota, 'Nota masuk berhasil disimpan'));
  },

  async list(request, reply) {
    const list = await notaMasukService.listNotaMasuk(request.toko_id, request.pagination);
    return reply.send(responseSukses(list, 'Daftar nota masuk'));
  },

  async detail(request, reply) {
    const detail = await notaMasukService.detailNotaMasuk(request.toko_id, request.params.id);
    return reply.send(responseSukses(detail, 'Detail nota masuk'));
  },
};
