import { supplierController } from './supplier.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function supplierRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.get('/', supplierController.list);
  fastify.post('/', supplierController.tambah);
  fastify.get('/:id', supplierController.detail);
  fastify.get('/:id/hutang', supplierController.getHutang);
  fastify.put('/:id', supplierController.update);
  fastify.delete('/:id', supplierController.delete);
}
