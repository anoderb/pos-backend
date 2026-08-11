import { shiftController } from './shift.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function shiftRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Kasir & Owner
  fastify.post('/buka', shiftController.buka);
  fastify.get('/aktif', shiftController.shiftAktif);
  fastify.post('/tutup', shiftController.tutup);
  fastify.get('/:id', shiftController.detail);

  // Owner Only
  fastify.get('/', { preHandler: [requireOwner] }, shiftController.list);
}
