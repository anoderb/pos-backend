import { konsinyasiService } from './konsinyasi.service.js';
import { responseSukses } from '../../utils/response.js';

export const konsinyasiController = {
  async terima(request, reply) {
    const { supplier_id, items } = request.body || {};
    if (!supplier_id || !items || items.length === 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'supplier_id dan items wajib diisi' });
    }

    const ksn = await konsinyasiService.terimaBarangKonsinyasi(request.toko_id, request.pengguna.id, request.body);
    return reply.code(201).send(responseSukses(ksn, 'Barang konsinyasi berhasil diterima'));
  },

  async kembali(request, reply) {
    const { item_id, qty_kembali } = request.body || {};
    if (!item_id || !qty_kembali) {
      return reply.code(400).send({ berhasil: false, pesan: 'item_id dan qty_kembali wajib diisi' });
    }

    const item = await konsinyasiService.kembalikanBarang(request.toko_id, request.params.id, { item_id, qty_kembali });
    return reply.send(responseSukses(item, 'Pengembalian barang konsinyasi berhasil dicatat'));
  },

  async bayar(request, reply) {
    const { jumlah_bayar } = request.body || {};
    if (!jumlah_bayar) {
      return reply.code(400).send({ berhasil: false, pesan: 'jumlah_bayar wajib diisi' });
    }

    const ksn = await konsinyasiService.settlementBayar(request.toko_id, request.params.id, { jumlah_bayar });
    return reply.send(responseSukses(ksn, 'Settlement konsinyasi berhasil diproses'));
  },

  async list(request, reply) {
    const list = await konsinyasiService.listKonsinyasi(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar konsinyasi'));
  },

  async detail(request, reply) {
    const detail = await konsinyasiService.detailKonsinyasi(request.toko_id, request.params.id);
    return reply.send(responseSukses(detail, 'Detail konsinyasi'));
  },
};
