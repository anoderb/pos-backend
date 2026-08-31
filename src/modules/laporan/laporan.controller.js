import { laporanService } from './laporan.service.js';
import { responseSukses } from '../../utils/response.js';

export const laporanController = {
  async dashboard(request, reply) {
    const { periode, tanggal_mulai, tanggal_selesai } = request.query || {};
    const data = await laporanService.getDashboardWidget(request.toko_id, periode, tanggal_mulai, tanggal_selesai);
    return reply.send(responseSukses(data, 'Widget dashboard owner'));
  },

  async ringkasan(request, reply) {
    const { rentang } = request.query || {};
    const data = await laporanService.getRingkasanLaporan(request.toko_id, rentang);
    return reply.send(responseSukses(data, 'Ringkasan laporan keuangan'));
  },

  async penjualan(request, reply) {
    const { tanggal_mulai, tanggal_selesai, kasir_id } = request.query || {};
    const data = await laporanService.getLaporanPenjualan(request.toko_id, {
      tanggal_mulai,
      tanggal_selesai,
      kasir_id,
    });
    return reply.send(responseSukses(data, 'Laporan penjualan'));
  },

  async riwayat(request, reply) {
    const { rentang, page, pageSize, page_size } = request.query || {};
    // Anggota keluarga lama (rentang) diabaikan: riwayat kini semua transaksi + pagination.
    const data = await laporanService.getRiwayatTransaksi(request.toko_id, {
      page: page || 1,
      pageSize: pageSize || page_size || 10,
    });
    return reply.send(responseSukses(data, 'Riwayat transaksi'));
  },

  async pendingQris(request, reply) {
    const { page, pageSize } = request.query || {};
    const data = await laporanService.getTransaksiPending(request.toko_id, {
      page: page || 1,
      pageSize: pageSize || 20,
    });
    return reply.send(responseSukses(data, 'Daftar transaksi QRIS pending'));
  },

  async stok(request, reply) {
    const data = await laporanService.getLaporanStok(request.toko_id);
    return reply.send(responseSukses(data, 'Laporan stok produk'));
  },
};
