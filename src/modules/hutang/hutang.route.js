import { hutangController } from './hutang.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function hutangRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.get('/', hutangController.list);
  fastify.post('/:nota_id/bayar', hutangController.bayar);
  fastify.get('/:nota_id/histori', hutangController.histori);
}
