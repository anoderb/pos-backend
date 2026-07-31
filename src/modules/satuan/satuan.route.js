import { satuanController } from './satuan.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function satuanRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET: Owner & Kasir
  fastify.get('/', satuanController.list);

  // Write: Owner Only
  fastify.post('/', { preHandler: [requireOwner] }, satuanController.tambah);
  fastify.put('/:id', { preHandler: [requireOwner] }, satuanController.update);
  fastify.delete('/:id', { preHandler: [requireOwner] }, satuanController.hapus);
}
