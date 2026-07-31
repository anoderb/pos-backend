import { laporanController } from './laporan.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function laporanRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.get('/dashboard', laporanController.dashboard);
  fastify.get('/penjualan', laporanController.penjualan);
  fastify.get('/penjualan/export', laporanController.exportPenjualan);
  fastify.get('/stok', laporanController.stok);
  fastify.get('/stok/export', laporanController.exportStok);
  fastify.get('/pembelian', laporanController.pembelian);
  fastify.get('/pembelian/export', laporanController.exportPembelian);
  fastify.get('/shift', laporanController.shift);
  fastify.get('/shift/export', laporanController.exportShift);
  fastify.get('/laba-rugi', laporanController.labaRugi);
}
