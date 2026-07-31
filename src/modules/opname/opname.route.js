import { opnameController } from './opname.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function opnameRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.get('/', opnameController.list);
  fastify.post('/', opnameController.buat);
  fastify.get('/:id', opnameController.detail);
  fastify.put('/:id/item/:pid', opnameController.updateItem);
  fastify.post('/:id/review', opnameController.review);
  fastify.post('/:id/final', opnameController.finalize);
}
