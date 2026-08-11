import { notaMasukController } from './nota-masuk.controller.js';
import { authenticate } from '../../middleware/auth.js';

export async function notaMasukRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/', notaMasukController.buat);
  fastify.get('/', notaMasukController.list);
  fastify.get('/:id', notaMasukController.detail);
}
