import { returnSupplierService } from './return-supplier.service.js';
import { responseSukses } from '../../utils/response.js';

export const returnSupplierController = {
  async buat(request, reply) {
    const { supplier_id, items } = request.body || {};
    if (!supplier_id || !items || items.length === 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'supplier_id dan items wajib diisi' });
    }

    const body = { ...request.body };
    if (!body.total) {
      body.total = items.reduce((s, i) => s + (Number(i.subtotal) || Number(i.harga_beli) * Number(i.qty) || 0), 0);
    }

    const ret = await returnSupplierService.buatReturn(request.toko_id, request.pengguna.id, body);
    return reply.code(201).send(responseSukses(ret, 'Return supplier berhasil disimpan'));
  },

  async list(request, reply) {
    const list = await returnSupplierService.listReturn(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar return supplier'));
  },

  async detail(request, reply) {
    const detail = await returnSupplierService.detailReturn(request.toko_id, request.params.id);
    return reply.send(responseSukses(detail, 'Detail return supplier'));
  },
};
