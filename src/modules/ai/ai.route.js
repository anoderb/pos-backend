import { aiController } from './ai.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function aiRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Kasir & Owner: Ambil Model AI Aktif & Mapping Barcode
  fastify.get('/active-model', aiController.getActiveModel);

  // Kasir & Owner: Simpan Koreksi
  fastify.post('/koreksi', aiController.simpan);

  // Owner Only: List & Review Koreksi
  fastify.get('/koreksi', { preHandler: [requireOwner] }, aiController.list);
  fastify.put('/koreksi/:id', { preHandler: [requireOwner] }, aiController.review);
}
