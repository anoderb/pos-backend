import { returnSupplierController } from './return-supplier.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function returnSupplierRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.post('/', returnSupplierController.buat);
  fastify.get('/', returnSupplierController.list);
  fastify.get('/:id', returnSupplierController.detail);
}
