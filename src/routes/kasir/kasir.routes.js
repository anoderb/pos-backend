import { authenticate, rejectTenantOverride, attachPagination, validateUuidParams } from '../../middleware/auth.js';
import { transaksiController } from '../../modules/transaksi/transaksi.controller.js';
import { shiftController } from '../../modules/shift/shift.controller.js';
import { produkController } from '../../modules/produk/produk.controller.js';
import { pelangganController } from '../../modules/pelanggan/pelanggan.controller.js';
import { aiController } from '../../modules/ai/ai.controller.js';
import { kategoriController } from '../../modules/kategori/kategori.controller.js';
import { satuanController } from '../../modules/satuan/satuan.controller.js';

export async function kasirRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', rejectTenantOverride);
  fastify.addHook('preHandler', attachPagination);
  fastify.addHook('preHandler', validateUuidParams);

  const kasirTag = { schema: { tags: ['Kasir Operations (/api/kasir)'] } };

  // --- Kasir POS Transaksi ---
  fastify.post('/transaksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Checkout Transaksi Kasir (Online)' } }, transaksiController.buat);
  fastify.post('/transaksi/sync-offline', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Batch Sync Transaksi Offline Dexie.js' } }, transaksiController.syncOffline);
  fastify.get('/transaksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Transaksi Kasir' } }, transaksiController.list);
  fastify.get('/transaksi/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Transaksi' } }, transaksiController.detail);
  fastify.post('/transaksi/:id/void', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Void Transaksi Penjualan' } }, transaksiController.voidTx);
  fastify.post('/transaksi/:id/qris/approve', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Approve Pembayaran QRIS Pending' } }, transaksiController.approveQris);
  fastify.post('/transaksi/:id/qris/cancel', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Batalkan Pembayaran QRIS Pending' } }, transaksiController.cancelQris);

  // --- Shift Management ---
  fastify.post('/shift/buka', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Buka Shift Baru' } }, shiftController.buka);
  fastify.get('/shift/aktif', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Get Shift Aktif Kasir Ini' } }, shiftController.shiftAktif);
  fastify.post('/shift/jeda', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Jeda Shift Aktif' } }, shiftController.jeda);
  fastify.post('/shift/lanjut', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Lanjutkan Shift dari Jeda' } }, shiftController.lanjut);
  fastify.post('/shift/tutup', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Tutup Shift + Rekap Kas' } }, shiftController.tutup);
  fastify.get('/shift/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Rekap Shift' } }, shiftController.detail);

  // --- Katalog Produk & Barcode ---
  fastify.get('/produk', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Katalog Produk Toko' } }, produkController.list);
  fastify.get('/produk/barcode/:kode', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Cari Produk by Barcode' } }, produkController.getByBarcode);
  fastify.get('/produk/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Produk' } }, produkController.detail);
  fastify.get('/kategori', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Kategori Produk' } }, kategoriController.list);
  fastify.get('/satuan', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Satuan Custom' } }, satuanController.list);

  // --- Pelanggan ---
  fastify.get('/pelanggan', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Pelanggan Toko' } }, pelangganController.list);
  fastify.post('/pelanggan', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Tambah Pelanggan Baru' } }, pelangganController.tambah);
  fastify.get('/pelanggan/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Pelanggan' } }, pelangganController.detail);
  fastify.put('/pelanggan/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Edit Data Pelanggan' } }, pelangganController.update);

  // --- Koreksi AI Scanner ---
  fastify.get('/ai/active-model', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Get Model AI Aktif & Barcode Mapping' } }, aiController.getActiveModel);
  fastify.post('/ai/koreksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Simpan Koreksi Visual Scanner AI' } }, aiController.simpan);
}
