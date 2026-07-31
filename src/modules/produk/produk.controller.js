import { produkService } from './produk.service.js';
import { responseSukses } from '../../utils/response.js';

export const produkController = {
  // Produk CRUD
  async list(request, reply) {
    const { kategori_id, stok_kritis, aktif_ai, search } = request.query || {};
    const data = await produkService.listProduk(request.toko_id, { kategori_id, stok_kritis, aktif_ai, search });
    return reply.send(responseSukses(data, 'Daftar produk toko'));
  },

  async tambah(request, reply) {
    const { nama } = request.body || {};
    if (!nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama produk wajib diisi' });

    const data = await produkService.tambahProduk(request.toko_id, request.body || {});
    return reply.code(201).send(responseSukses(data, 'Produk baru berhasil ditambahkan'));
  },

  async detail(request, reply) {
    const data = await produkService.getProdukById(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Detail produk'));
  },

  async update(request, reply) {
    const data = await produkService.updateProduk(request.toko_id, request.params.id, request.body || {});
    return reply.send(responseSukses(data, 'Produk berhasil diperbarui'));
  },

  async nonaktifkan(request, reply) {
    const data = await produkService.deleteProduk(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Produk berhasil dinonaktifkan'));
  },

  async getByBarcode(request, reply) {
    const data = await produkService.getProdukByBarcode(request.toko_id, request.params.kode);
    return reply.send(responseSukses(data, 'Produk ditemukan'));
  },

  async getMovement(request, reply) {
    const data = await produkService.getStockMovement(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Histori stok produk'));
  },

  // Satuan Jual
  async listSatuanJual(request, reply) {
    const data = await produkService.listSatuanJual(request.params.id);
    return reply.send(responseSukses(data, 'Daftar satuan jual produk'));
  },

  async tambahSatuanJual(request, reply) {
    const data = await produkService.tambahSatuanJual(request.params.id, request.body || {});
    return reply.code(201).send(responseSukses(data, 'Satuan jual berhasil ditambahkan'));
  },

  async updateSatuanJual(request, reply) {
    const data = await produkService.updateSatuanJual(request.params.id, request.params.sid, request.body || {});
    return reply.send(responseSukses(data, 'Satuan jual berhasil diperbarui'));
  },

  async hapusSatuanJual(request, reply) {
    const data = await produkService.hapusSatuanJual(request.params.id, request.params.sid);
    return reply.send(responseSukses(data, 'Satuan jual berhasil dihapus'));
  },

  // Satuan Beli
  async listSatuanBeli(request, reply) {
    const data = await produkService.listSatuanBeli(request.params.id);
    return reply.send(responseSukses(data, 'Daftar satuan beli produk'));
  },

  async tambahSatuanBeli(request, reply) {
    const data = await produkService.tambahSatuanBeli(request.params.id, request.body || {});
    return reply.code(201).send(responseSukses(data, 'Satuan beli berhasil ditambahkan'));
  },

  async updateSatuanBeli(request, reply) {
    const data = await produkService.updateSatuanBeli(request.params.id, request.params.sid, request.body || {});
    return reply.send(responseSukses(data, 'Satuan beli berhasil diperbarui'));
  },

  async hapusSatuanBeli(request, reply) {
    const data = await produkService.hapusSatuanBeli(request.params.id, request.params.sid);
    return reply.send(responseSukses(data, 'Satuan beli berhasil dihapus'));
  },
};
