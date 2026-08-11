import { produkService } from './produk.service.js';
import { responseSukses } from '../../utils/response.js';

function mapFrontendFields(payload) {
  const p = { ...payload };
  if (p.stok_awal !== undefined && p.stok === undefined) p.stok = p.stok_awal;
  if (p.batas_stok_minimum !== undefined && p.stok_minimum === undefined) p.stok_minimum = p.batas_stok_minimum;
  if (p.harga_eceran !== undefined && p.harga_jual_default === undefined) p.harga_jual_default = p.harga_eceran;
  if (p.kode_barcode !== undefined && p.barcode === undefined) p.barcode = p.kode_barcode;
  if (p.satuan_id !== undefined && p.satuan_dasar_id === undefined) p.satuan_dasar_id = p.satuan_id;
  return p;
}

export const produkController = {
  // Produk CRUD
  async list(request, reply) {
    const { kategori_id, stok_kritis, aktif_ai, search } = request.query || {};
    const data = await produkService.listProduk(request.toko_id, { kategori_id, stok_kritis, aktif_ai, search });
    return reply.send(responseSukses(data, 'Daftar produk toko'));
  },

  async tambah(request, reply) {
    const payload = mapFrontendFields(request.body || {});

    if (!payload.nama) return reply.code(400).send({ berhasil: false, pesan: 'Nama produk wajib diisi' });

    const data = await produkService.tambahProduk(request.toko_id, payload);
    return reply.code(201).send(responseSukses(data, 'Produk baru berhasil ditambahkan'));
  },

  async detail(request, reply) {
    const data = await produkService.getProdukById(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Detail produk'));
  },

  async update(request, reply) {
    const payload = mapFrontendFields(request.body || {});

    const data = await produkService.updateProduk(request.toko_id, request.params.id, payload);
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
