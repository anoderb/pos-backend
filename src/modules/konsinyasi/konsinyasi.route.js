import { konsinyasiController } from './konsinyasi.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function konsinyasiRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireOwner);

  fastify.get('/', konsinyasiController.list);
  fastify.post('/', konsinyasiController.terima);
  fastify.get('/:id', konsinyasiController.detail);
  fastify.post('/:id/kembali', konsinyasiController.kembali);
  fastify.post('/:id/bayar', konsinyasiController.bayar);
}
