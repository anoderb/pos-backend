import { supplierService } from './supplier.service.js';
import { responseSukses } from '../../utils/response.js';

export const supplierController = {
  async list(request, reply) {
    const data = await supplierService.list(request.toko_id, request.pagination);
    return reply.send(responseSukses(data, 'Daftar supplier'));
  },

  async tambah(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama supplier wajib diisi' });

    const data = await supplierService.tambah(request.toko_id, request.body || {});
    return reply.code(201).send(responseSukses(data, 'Supplier berhasil ditambahkan'));
  },

  async detail(request, reply) {
    const data = await supplierService.detail(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Detail supplier'));
  },

  async update(request, reply) {
    const data = await supplierService.update(request.toko_id, request.params.id, request.body || {});
    return reply.send(responseSukses(data, 'Supplier berhasil diperbarui'));
  },

  async delete(request, reply) {
    const data = await supplierService.delete(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Supplier berhasil dinonaktifkan'));
  },

  async getHutang(request, reply) {
    const data = await supplierService.getHutangSupplier(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Rekap hutang supplier'));
  },
};
