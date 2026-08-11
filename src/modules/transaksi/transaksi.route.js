import { transaksiController } from './transaksi.controller.js';
import { authenticate } from '../../middleware/auth.js';

export async function transaksiRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/', transaksiController.buat);
  fastify.post('/sync-offline', transaksiController.syncOffline);
  fastify.get('/', transaksiController.list);
  fastify.get('/:id', transaksiController.detail);
  fastify.post('/:id/void', transaksiController.voidTx);
}
