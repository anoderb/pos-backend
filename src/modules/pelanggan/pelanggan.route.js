import { pelangganController } from './pelanggan.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function pelangganRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Read/Create/Update: Owner & Kasir
  fastify.get('/', pelangganController.list);
  fastify.post('/', pelangganController.tambah);
  fastify.get('/:id', pelangganController.detail);
  fastify.put('/:id', pelangganController.update);

  // Delete: Owner Only
  fastify.delete('/:id', { preHandler: [requireOwner] }, pelangganController.delete);
}
