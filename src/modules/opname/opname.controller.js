import { opnameService } from './opname.service.js';
import { responseSukses } from '../../utils/response.js';

export const opnameController = {
  async buat(request, reply) {
    const { tanggal, catatan } = request.body || {};
    const op = await opnameService.buatOpname(request.toko_id, request.pengguna.id, { tanggal, catatan });
    return reply.code(201).send(responseSukses(op, 'Periode stock opname berhasil dibuat (Draft)'));
  },

  async updateItem(request, reply) {
    const { stok_fisik, catatan } = request.body || {};
    if (stok_fisik === undefined) {
      return reply.code(400).send({ berhasil: false, pesan: 'stok_fisik wajib diisi' });
    }

    const item = await opnameService.updateItemStokFisik(
      request.toko_id,
      request.params.id,
      request.params.pid,
      { stok_fisik, catatan }
    );
    return reply.send(responseSukses(item, 'Stok fisik produk berhasil disimpan'));
  },

  async review(request, reply) {
    const op = await opnameService.submitReview(request.toko_id, request.params.id);
    return reply.send(responseSukses(op, 'Status opname diubah ke Review'));
  },

  async finalize(request, reply) {
    const op = await opnameService.finalizeOpname(request.toko_id, request.params.id, request.pengguna.id);
    return reply.send(responseSukses(op, 'Stock opname berhasil difinalisasi & stok massal diperbarui'));
  },

  async list(request, reply) {
    const list = await opnameService.listOpname(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar stock opname'));
  },

  async detail(request, reply) {
    const detail = await opnameService.detailOpname(request.toko_id, request.params.id);
    return reply.send(responseSukses(detail, 'Detail stock opname & items'));
  },
};
