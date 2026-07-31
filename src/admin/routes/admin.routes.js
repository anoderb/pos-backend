import { adminAuthController } from '../modules/auth/admin.auth.controller.js';
import { adminDashboardController } from '../modules/dashboard/admin.dashboard.controller.js';
import { adminUsersController } from '../modules/users/admin.users.controller.js';
import { adminDatasetController } from '../modules/dataset/admin.dataset.controller.js';
import { adminKurasiController } from '../modules/kurasi/admin.kurasi.controller.js';
import { adminModelController } from '../modules/model/admin.model.controller.js';
import { adminLogController } from '../modules/log/admin.log.controller.js';
import { authenticateAdmin } from '../middleware/admin.auth.js';

export async function adminRoutes(fastify, options) {
  const adminTag = (summary) => ({
    schema: {
      tags: ['Master Admin SaaS & MLOps Engine'],
      summary,
    },
  });

  // Public Admin Routes (Prefix '/api/admin' is injected by index.js)
  fastify.post('/auth/login', adminTag('Login Super Admin Panel'), adminAuthController.login);
  fastify.get('/dataset/image-proxy', adminTag('Proxy Stream Foto Private HuggingFace Hub'), adminDatasetController.proxyImage);

  // Protected Admin Routes (Requires tokiva_admin_token JWT)
  fastify.register(async (protectedAdmin) => {
    protectedAdmin.addHook('onRequest', authenticateAdmin);

    // Profile & Password
    protectedAdmin.get('/auth/me', adminTag('Get Current Admin Profile'), adminAuthController.profil);
    protectedAdmin.get('/auth/profil', adminTag('Get Current Admin Profile (Alias)'), adminAuthController.profil);
    protectedAdmin.post('/auth/ganti-password', adminTag('Ganti Password Admin'), adminAuthController.gantiPassword);

    // Dashboard SaaS Metrics
    protectedAdmin.get('/dashboard', adminTag('Metrics & Widget Dashboard Admin'), adminDashboardController.getMetrics);

    // Tenant / Owner Control (Super Admin)
    protectedAdmin.get('/users', adminTag('Daftar Tenant & Toko'), adminUsersController.listTenants);
    protectedAdmin.put('/users/:id/suspend', adminTag('Suspend / Nonaktifkan Tenant Toko'), adminUsersController.suspendTenant);
    protectedAdmin.put('/users/:id/aktifkan', adminTag('Aktifkan Tenant Toko'), adminUsersController.aktifkanTenant);

    // Data Collector & Class Produk
    protectedAdmin.get('/dataset/class', adminTag('List Class Produk AI'), adminDatasetController.listClass);
    protectedAdmin.post('/dataset/class', adminTag('Tambah Class Produk AI Baru'), adminDatasetController.tambahClass);
    protectedAdmin.get('/dataset/foto', adminTag('Daftar Foto Dataset AI (HuggingFace)'), adminDatasetController.listFoto);
    protectedAdmin.get('/dataset/unmapped', adminTag('Daftar Produk Belum Ter-mapping'), adminDatasetController.listUnmapped);
    protectedAdmin.post('/dataset/map-class', adminTag('Assign Produk ke Class AI Existing'), adminDatasetController.mapClass);
    protectedAdmin.post('/dataset/create-class-and-map', adminTag('Buat Class AI Baru & Map Produk'), adminDatasetController.createClassAndMap);
    protectedAdmin.post('/dataset/sync-huggingface', adminTag('Trigger Manual Batch Sync ke HuggingFace'), adminDatasetController.triggerSync);
    protectedAdmin.get('/dataset/sync-status', adminTag('Get HuggingFace Sync Status & Stats'), adminDatasetController.getSyncStatus);
    protectedAdmin.put('/dataset/sync-config', adminTag('Update HuggingFace Auto-Sync Config'), adminDatasetController.updateSyncConfig);

    // Kurasi Koreksi Kasir & Unknown Products
    protectedAdmin.get('/kurasi', adminTag('Antrean Kurasi Koreksi Kasir'), adminKurasiController.listPendingKurasi);
    protectedAdmin.put('/kurasi/:id/setujui', adminTag('Approve Koreksi Kasir'), adminKurasiController.setujuiKoreksi);
    protectedAdmin.put('/kurasi/:id/tolak', adminTag('Reject Koreksi Kasir'), adminKurasiController.tolakKoreksi);

    // Model Management, Testing & Activation
    protectedAdmin.get('/model', adminTag('Daftar Versi Model AI'), adminModelController.listModel);
    protectedAdmin.post('/model', adminTag('Register Versi Model AI Baru'), adminModelController.uploadModel);
    protectedAdmin.post('/model/upload-tfjs', adminTag('Upload File / ZIP TFJS & Auto Extract'), adminModelController.uploadTfjsBundle);
    protectedAdmin.put('/model/:id/aktifkan', adminTag('Set Active Live Deployment Model AI'), adminModelController.aktifkanModel);
    protectedAdmin.put('/model/:id/threshold', adminTag('Update Confidence Threshold Model'), adminModelController.updateThreshold);
    protectedAdmin.delete('/model/:id', adminTag('Hapus Versi Model AI'), adminModelController.deleteModel);

    // Audit Logs
    protectedAdmin.get('/log/aktivitas', adminTag('Audit Trail Log Aktivitas Admin'), adminLogController.listAktivitas);
  });
}
