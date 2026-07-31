import { authenticate } from '../../middleware/auth.js';
import { transaksiController } from '../../modules/transaksi/transaksi.controller.js';
import { shiftController } from '../../modules/shift/shift.controller.js';
import { produkController } from '../../modules/produk/produk.controller.js';
import { pelangganController } from '../../modules/pelanggan/pelanggan.controller.js';
import { notaMasukController } from '../../modules/nota-masuk/nota-masuk.controller.js';
import { aiController } from '../../modules/ai/ai.controller.js';
import { kategoriController } from '../../modules/kategori/kategori.controller.js';
import { satuanController } from '../../modules/satuan/satuan.controller.js';

export async function kasirRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  const kasirTag = { schema: { tags: ['Kasir Operations (/api/kasir)'] } };

  // --- Kasir POS Transaksi ---
  fastify.post('/transaksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Checkout Transaksi Kasir (Online)' } }, transaksiController.buat);
  fastify.post('/transaksi/sync-offline', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Batch Sync Transaksi Offline Dexie.js' } }, transaksiController.syncOffline);
  fastify.get('/transaksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Transaksi Kasir' } }, transaksiController.list);
  fastify.get('/transaksi/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Transaksi' } }, transaksiController.detail);
  fastify.post('/transaksi/:id/void', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Void Transaksi Penjualan' } }, transaksiController.voidTx);

  // --- Shift Management ---
  fastify.post('/shift/buka', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Buka Shift Baru' } }, shiftController.buka);
  fastify.get('/shift/aktif', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Get Shift Aktif Kasir Ini' } }, shiftController.shiftAktif);
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

  // --- Nota Masuk Pembelian & Upload Foto ---
  fastify.get('/nota-masuk', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'List Nota Masuk Pembelian' } }, notaMasukController.list);
  fastify.post('/nota-masuk', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Buat Nota Masuk Baru' } }, notaMasukController.buat);
  fastify.get('/nota-masuk/:id', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Detail Nota Masuk' } }, notaMasukController.detail);

  // --- Koreksi AI Scanner ---
  fastify.post('/ai/koreksi', { schema: { tags: ['Kasir Operations (/api/kasir)'], summary: 'Simpan Koreksi Visual Scanner AI' } }, aiController.simpan);
}
