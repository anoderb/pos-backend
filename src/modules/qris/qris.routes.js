import { authenticate, requireOwner } from '../../middleware/auth.js';
import { qrisController } from './qris.controller.js';

export async function qrisRoutes(fastify, options) {
  // Owner: set/validasi QRIS toko + lihat status
  fastify.register(async (ownerRoutes) => {
    ownerRoutes.addHook('preHandler', authenticate);
    ownerRoutes.addHook('preHandler', requireOwner);
    ownerRoutes.get('/toko/qris/status', qrisController.getStatus);
    ownerRoutes.put('/toko/qris', qrisController.setQris);
  });

  // Kasir & Owner: approve/cancel transaksi QRIS (disambungkan di transaksi controller)
}
