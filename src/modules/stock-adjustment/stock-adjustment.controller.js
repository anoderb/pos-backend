import { stockAdjustmentService } from './stock-adjustment.service.js';
import { responseSukses } from '../../utils/response.js';

export const stockAdjustmentController = {
  async buat(request, reply) {
    const { produk_id, tipe, qty, alasan } = request.body || {};
    if (!produk_id || !tipe || !qty || !alasan) {
      return reply.code(400).send({
        berhasil: false,
        pesan: 'produk_id, tipe (tambah/kurang), qty, dan alasan wajib diisi',
      });
    }

    const adj = await stockAdjustmentService.buatAdjustment(
      request.toko_id,
      request.pengguna.id,
      { produk_id, tipe, qty, alasan }
    );
    return reply.code(201).send(responseSukses(adj, 'Stock adjustment berhasil disimpan'));
  },

  async list(request, reply) {
    const list = await stockAdjustmentService.listAdjustment(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar histori stock adjustment'));
  },
};
