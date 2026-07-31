import { stockAdjustmentController } from './stock-adjustment.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function stockAdjustmentRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.post('/', stockAdjustmentController.buat);
  fastify.get('/', stockAdjustmentController.list);
}
