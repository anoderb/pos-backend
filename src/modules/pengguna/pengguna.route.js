import { penggunaController } from './pengguna.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function penggunaRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner); // Semua pengelolaan kasir khusus Owner

  fastify.get('/', penggunaController.list);
  fastify.post('/', penggunaController.tambah);
  fastify.get('/:id', penggunaController.detail);
  fastify.put('/:id', penggunaController.update);
  fastify.delete('/:id', penggunaController.nonaktifkan);
  fastify.delete('/:id/permanen', penggunaController.hapusPermanen);
  fastify.get('/:id/shift', penggunaController.historiShift);
}
