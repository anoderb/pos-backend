import { kategoriController } from './kategori.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function kategoriRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET: Owner & Kasir
  fastify.get('/', kategoriController.list);

  // Write: Owner Only
  fastify.post('/', { preHandler: [requireOwner] }, kategoriController.tambah);
  fastify.put('/:id', { preHandler: [requireOwner] }, kategoriController.update);
  fastify.delete('/:id', { preHandler: [requireOwner] }, kategoriController.hapus);
}
