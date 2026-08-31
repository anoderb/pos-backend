import { authenticate, requireOwner, rejectTenantOverride, attachPagination, validateUuidParams } from '../../middleware/auth.js';
import { laporanController } from '../../modules/laporan/laporan.controller.js';
import { penggunaController } from '../../modules/pengguna/pengguna.controller.js';
import { produkController } from '../../modules/produk/produk.controller.js';
import { kategoriController } from '../../modules/kategori/kategori.controller.js';
import { satuanController } from '../../modules/satuan/satuan.controller.js';
import { stockAdjustmentController } from '../../modules/stock-adjustment/stock-adjustment.controller.js';
import { tokoController } from '../../modules/toko/toko.controller.js';
import { shiftController } from '../../modules/shift/shift.controller.js';
import { qrisController } from '../../modules/qris/qris.controller.js';

export async function ownerRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', rejectTenantOverride);
  fastify.addHook('preHandler', attachPagination);
  fastify.addHook('preHandler', validateUuidParams);
  fastify.addHook('preHandler', requireOwner);

  const ownerTag = (summary) => ({ schema: { tags: ['Owner Operations (/api/owner)'], summary } });

  // --- Dashboard & Analytics ---
  fastify.get('/dashboard', ownerTag('Widget Dashboard Owner & Stok Kritis'), laporanController.dashboard);
  fastify.get('/laporan/penjualan', ownerTag('Laporan Penjualan Toko'), laporanController.penjualan);
  fastify.get('/laporan/ringkasan', ownerTag('Ringkasan Laporan Keuangan'), laporanController.ringkasan);
  fastify.get('/laporan/riwayat', ownerTag('Riwayat Transaksi Terbaru'), laporanController.riwayat);
  fastify.get('/laporan/pending', ownerTag('Daftar Transaksi QRIS Pending'), laporanController.pendingQris);
  fastify.get('/laporan/stok', ownerTag('Laporan Inventori & Nilai Stok'), laporanController.stok);

  // --- Kelola Staf Kasir / Pengguna ---
  fastify.get('/pengguna', ownerTag('List Akun Kasir Toko'), penggunaController.list);
  fastify.post('/pengguna', ownerTag('Tambah Akun Kasir Baru'), penggunaController.tambah);
  fastify.get('/pengguna/:id', ownerTag('Detail Data Kasir'), penggunaController.detail);
  fastify.put('/pengguna/:id', ownerTag('Edit Data Kasir'), penggunaController.update);
  fastify.delete('/pengguna/:id', ownerTag('Nonaktifkan Akun Kasir'), penggunaController.nonaktifkan);
  fastify.delete('/pengguna/:id/permanen', ownerTag('Hapus Akun Kasir Permanen'), penggunaController.hapusPermanen);
  fastify.get('/pengguna/:id/shift', ownerTag('Histori Shift Staf Kasir'), penggunaController.historiShift);

  // --- Master Produk & Multi-Satuan ---
  fastify.get('/produk', ownerTag('List Master Produk'), produkController.list);
  fastify.post('/produk', ownerTag('Tambah Master Produk Baru'), produkController.tambah);
  fastify.get('/produk/:id', ownerTag('Detail Master Produk + Multi Satuan'), produkController.detail);
  fastify.put('/produk/:id', ownerTag('Edit Master Produk'), produkController.update);
  fastify.delete('/produk/:id', ownerTag('Soft Delete Produk'), produkController.nonaktifkan);
  fastify.get('/produk/:id/movement', ownerTag('Audit Log Pergerakan Stok'), produkController.getMovement);

  // Satuan Jual & Beli Sub-routes
  fastify.get('/produk/:id/satuan-jual', ownerTag('List Satuan Jual Ecer/Grosir'), produkController.listSatuanJual);
  fastify.post('/produk/:id/satuan-jual', ownerTag('Tambah Satuan Jual Ecer/Grosir'), produkController.tambahSatuanJual);
  fastify.put('/produk/:id/satuan-jual/:sid', ownerTag('Edit Satuan Jual'), produkController.updateSatuanJual);
  fastify.delete('/produk/:id/satuan-jual/:sid', ownerTag('Hapus Satuan Jual'), produkController.hapusSatuanJual);

  // Kategori & Satuan CRUD
  fastify.get('/kategori', ownerTag('List Kategori Toko'), kategoriController.list);
  fastify.post('/kategori', ownerTag('Tambah Kategori Baru'), kategoriController.tambah);
  fastify.put('/kategori/:id', ownerTag('Edit Kategori'), kategoriController.update);
  fastify.delete('/kategori/:id', ownerTag('Hapus Kategori'), kategoriController.hapus);

  fastify.get('/satuan', ownerTag('List Satuan Custom'), satuanController.list);
  fastify.post('/satuan', ownerTag('Tambah Satuan Custom'), satuanController.tambah);
  fastify.put('/satuan/:id', ownerTag('Edit Satuan Custom'), satuanController.update);
  fastify.delete('/satuan/:id', ownerTag('Hapus Satuan Custom'), satuanController.hapus);

  // --- Stock Adjustment ---
  fastify.get('/stock-adjustment', ownerTag('List Stock Adjustment Manual'), stockAdjustmentController.list);
  fastify.post('/stock-adjustment', ownerTag('Buat Stock Adjustment Manual (+/-)'), stockAdjustmentController.buat);

  // --- Shift Logs Owner ---
  fastify.get('/shift', ownerTag('List Log Seluruh Shift Toko'), shiftController.list);

  // --- Toko Settings ---
  fastify.get('/toko', ownerTag('Get Detail Data Toko'), tokoController.getToko);
  fastify.put('/toko', ownerTag('Update Pengaturan Toko'), tokoController.updateToko);
  fastify.post('/toko/logo', ownerTag('Upload Logo Toko'), tokoController.uploadLogo);
  fastify.post('/toko/qris', ownerTag('Upload Gambar QRIS Toko'), tokoController.uploadQris);
  // QRIS Dinamis: set/validasi string QRIS + lihat status
  fastify.put('/toko/qris', ownerTag('Set QRIS String (validasi)'), qrisController.setQris);
  fastify.get('/toko/qris/status', ownerTag('Status QRIS Toko'), qrisController.getStatus);
}
