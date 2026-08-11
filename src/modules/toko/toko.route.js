import { tokoController } from './toko.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function tokoRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Read: Owner & Kasir
  fastify.get('/', tokoController.getToko);

  // Update: Owner Only
  fastify.put('/', { preHandler: [requireOwner] }, tokoController.updateToko);
  fastify.post('/logo', { preHandler: [requireOwner] }, tokoController.uploadLogo);
  fastify.post('/qris', { preHandler: [requireOwner] }, tokoController.uploadQris);
}
