import { authenticate, requireOwner } from '../../middleware/auth.js';
import { laporanController } from '../../modules/laporan/laporan.controller.js';
import { penggunaController } from '../../modules/pengguna/pengguna.controller.js';
import { produkController } from '../../modules/produk/produk.controller.js';
import { kategoriController } from '../../modules/kategori/kategori.controller.js';
import { satuanController } from '../../modules/satuan/satuan.controller.js';
import { supplierController } from '../../modules/supplier/supplier.controller.js';
import { hutangController } from '../../modules/hutang/hutang.controller.js';
import { returnSupplierController } from '../../modules/return-supplier/return-supplier.controller.js';
import { konsinyasiController } from '../../modules/konsinyasi/konsinyasi.controller.js';
import { stockAdjustmentController } from '../../modules/stock-adjustment/stock-adjustment.controller.js';
import { opnameController } from '../../modules/opname/opname.controller.js';
import { tokoController } from '../../modules/toko/toko.controller.js';
import { shiftController } from '../../modules/shift/shift.controller.js';

export async function ownerRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  const ownerTag = (summary) => ({ schema: { tags: ['Owner Operations (/api/owner)'], summary } });

  // --- Dashboard & Analytics ---
  fastify.get('/dashboard', ownerTag('Widget Dashboard Owner & Stok Kritis'), laporanController.dashboard);
  fastify.get('/laporan/penjualan', ownerTag('Laporan Penjualan Toko'), laporanController.penjualan);
  fastify.get('/laporan/penjualan/export', ownerTag('Export Data Penjualan (Excel/PDF)'), laporanController.exportPenjualan);
  fastify.get('/laporan/stok', ownerTag('Laporan Inventori & Nilai Stok'), laporanController.stok);
  fastify.get('/laporan/stok/export', ownerTag('Export Data Stok (Excel/PDF)'), laporanController.exportStok);
  fastify.get('/laporan/pembelian', ownerTag('Laporan Pembelian Nota Masuk'), laporanController.pembelian);
  fastify.get('/laporan/pembelian/export', ownerTag('Export Data Pembelian (Excel/PDF)'), laporanController.exportPembelian);
  fastify.get('/laporan/shift', ownerTag('Laporan Rekap Seluruh Shift Kasir'), laporanController.shift);
  fastify.get('/laporan/shift/export', ownerTag('Export Data Shift Kasir (Excel/PDF)'), laporanController.exportShift);
  fastify.get('/laporan/laba-rugi', ownerTag('Estimasi Laporan Laba Rugi'), laporanController.labaRugi);

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

  fastify.get('/produk/:id/satuan-beli', ownerTag('List Satuan Beli Supplier'), produkController.listSatuanBeli);
  fastify.post('/produk/:id/satuan-beli', ownerTag('Tambah Satuan Beli Supplier'), produkController.tambahSatuanBeli);
  fastify.put('/produk/:id/satuan-beli/:sid', ownerTag('Edit Satuan Beli'), produkController.updateSatuanBeli);
  fastify.delete('/produk/:id/satuan-beli/:sid', ownerTag('Hapus Satuan Beli'), produkController.hapusSatuanBeli);

  // Kategori & Satuan CRUD
  fastify.get('/kategori', ownerTag('List Kategori Toko'), kategoriController.list);
  fastify.post('/kategori', ownerTag('Tambah Kategori Baru'), kategoriController.tambah);
  fastify.put('/kategori/:id', ownerTag('Edit Kategori'), kategoriController.update);
  fastify.delete('/kategori/:id', ownerTag('Hapus Kategori'), kategoriController.hapus);

  fastify.get('/satuan', ownerTag('List Satuan Custom'), satuanController.list);
  fastify.post('/satuan', ownerTag('Tambah Satuan Custom'), satuanController.tambah);
  fastify.put('/satuan/:id', ownerTag('Edit Satuan Custom'), satuanController.update);
  fastify.delete('/satuan/:id', ownerTag('Hapus Satuan Custom'), satuanController.hapus);

  // --- Master Supplier & Hutang ---
  fastify.get('/supplier', ownerTag('List Supplier Toko'), supplierController.list);
  fastify.post('/supplier', ownerTag('Tambah Supplier Baru'), supplierController.tambah);
  fastify.get('/supplier/:id', ownerTag('Detail Supplier'), supplierController.detail);
  fastify.get('/supplier/:id/hutang', ownerTag('Rekap Hutang Supplier Ini'), supplierController.getHutang);
  fastify.put('/supplier/:id', ownerTag('Edit Data Supplier'), supplierController.update);
  fastify.delete('/supplier/:id', ownerTag('Soft Delete Supplier'), supplierController.delete);

  fastify.get('/hutang', ownerTag('List Semua Hutang Supplier Aktif'), hutangController.list);
  fastify.post('/hutang/:nota_id/bayar', ownerTag('Catat Pembayaran Hutang Supplier'), hutangController.bayar);
  fastify.get('/hutang/:nota_id/histori', ownerTag('Histori Pembayaran Hutang Nota Ini'), hutangController.histori);

  // --- Return Supplier ---
  fastify.get('/return-supplier', ownerTag('List Return Supplier'), returnSupplierController.list);
  fastify.post('/return-supplier', ownerTag('Buat Return Supplier Baru'), returnSupplierController.buat);
  fastify.get('/return-supplier/:id', ownerTag('Detail Return Supplier'), returnSupplierController.detail);

  // --- Konsinyasi ---
  fastify.get('/konsinyasi', ownerTag('List Konsinyasi Titip Jual'), konsinyasiController.list);
  fastify.post('/konsinyasi', ownerTag('Terima Barang Konsinyasi Baru'), konsinyasiController.terima);
  fastify.get('/konsinyasi/:id', ownerTag('Detail Barang Konsinyasi'), konsinyasiController.detail);
  fastify.post('/konsinyasi/:id/kembali', ownerTag('Kembalikan Barang Konsinyasi Tak Terjual'), konsinyasiController.kembali);
  fastify.post('/konsinyasi/:id/bayar', ownerTag('Settlement Pembayaran Konsinyasi'), konsinyasiController.bayar);

  // --- Stock Adjustment ---
  fastify.get('/stock-adjustment', ownerTag('List Stock Adjustment Manual'), stockAdjustmentController.list);
  fastify.post('/stock-adjustment', ownerTag('Buat Stock Adjustment Manual (+/-)'), stockAdjustmentController.buat);

  // --- Stock Opname Workflow 3 Tahap ---
  fastify.get('/opname', ownerTag('List Stock Opname Audit'), opnameController.list);
  fastify.post('/opname', ownerTag('1. Buat Opname Baru (Draft)'), opnameController.buat);
  fastify.get('/opname/:id', ownerTag('Detail Opname Audit'), opnameController.detail);
  fastify.put('/opname/:id/item/:pid', ownerTag('2. Update Stok Fisik Per Produk'), opnameController.updateItem);
  fastify.post('/opname/:id/review', ownerTag('3. Ubah Status Ke Review Selisih'), opnameController.review);
  fastify.post('/opname/:id/final', ownerTag('4. Finalize Opname (Update Stok Massal)'), opnameController.finalize);

  // --- Shift Logs Owner ---
  fastify.get('/shift', ownerTag('List Log Seluruh Shift Toko'), shiftController.list);

  // --- Toko Settings ---
  fastify.get('/toko', ownerTag('Get Detail Data Toko'), tokoController.getToko);
  fastify.put('/toko', ownerTag('Update Pengaturan Toko'), tokoController.updateToko);
  fastify.post('/toko/logo', ownerTag('Upload Logo Toko'), tokoController.uploadLogo);
  fastify.post('/toko/qris', ownerTag('Upload Gambar QRIS Toko'), tokoController.uploadQris);
}
