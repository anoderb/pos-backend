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

  async stok(request, reply) {
    const data = await laporanService.getLaporanStok(request.toko_id);
    return reply.send(responseSukses(data, 'Laporan stok produk'));
  },

  async pembelian(request, reply) {
    const { tanggal_mulai, tanggal_selesai, supplier_id } = request.query || {};
    const data = await laporanService.getLaporanPembelian(request.toko_id, {
      tanggal_mulai,
      tanggal_selesai,
      supplier_id,
    });
    return reply.send(responseSukses(data, 'Laporan pembelian toko'));
  },

  async shift(request, reply) {
    const { kasir_id } = request.query || {};
    const data = await laporanService.getLaporanShift(request.toko_id, { kasir_id });
    return reply.send(responseSukses(data, 'Laporan histori shift kasir'));
  },

  async labaRugi(request, reply) {
    const { tanggal_mulai, tanggal_selesai } = request.query || {};
    const data = await laporanService.getLaporanLabaRugi(request.toko_id, {
      tanggal_mulai,
      tanggal_selesai,
    });
    return reply.send(responseSukses(data, 'Estimasi laporan laba rugi'));
  },

  // Export CSV/Excel/PDF Format Data JSON
  async exportPenjualan(request, reply) {
    const data = await laporanService.getLaporanPenjualan(request.toko_id, request.query || {});
    return reply.send(responseSukses(data, 'Export data penjualan'));
  },

  async exportStok(request, reply) {
    const data = await laporanService.getLaporanStok(request.toko_id);
    return reply.send(responseSukses(data, 'Export data stok'));
  },

  async exportPembelian(request, reply) {
    const data = await laporanService.getLaporanPembelian(request.toko_id, request.query || {});
    return reply.send(responseSukses(data, 'Export data pembelian'));
  },

  async exportShift(request, reply) {
    const data = await laporanService.getLaporanShift(request.toko_id, request.query || {});
    return reply.send(responseSukses(data, 'Export data shift'));
  },
};
