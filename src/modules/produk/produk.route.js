import { produkController } from './produk.controller.js';
import { authenticate, requireOwner } from '../../middleware/auth.js';

export async function produkRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // Read: Owner & Kasir
  fastify.get('/', produkController.list);
  fastify.get('/barcode/:kode', produkController.getByBarcode);
  fastify.get('/:id', produkController.detail);
  fastify.get('/:id/satuan-jual', produkController.listSatuanJual);
  fastify.get('/:id/satuan-beli', produkController.listSatuanBeli);

  // Write: Owner Only
  fastify.post('/', { preHandler: [requireOwner] }, produkController.tambah);
  fastify.put('/:id', { preHandler: [requireOwner] }, produkController.update);
  fastify.delete('/:id', { preHandler: [requireOwner] }, produkController.nonaktifkan);
  fastify.get('/:id/movement', { preHandler: [requireOwner] }, produkController.getMovement);

  // Satuan Jual & Beli Sub-routes
  fastify.post('/:id/satuan-jual', { preHandler: [requireOwner] }, produkController.tambahSatuanJual);
  fastify.put('/:id/satuan-jual/:sid', { preHandler: [requireOwner] }, produkController.updateSatuanJual);
  fastify.delete('/:id/satuan-jual/:sid', { preHandler: [requireOwner] }, produkController.hapusSatuanJual);

  fastify.post('/:id/satuan-beli', { preHandler: [requireOwner] }, produkController.tambahSatuanBeli);
  fastify.put('/:id/satuan-beli/:sid', { preHandler: [requireOwner] }, produkController.updateSatuanBeli);
  fastify.delete('/:id/satuan-beli/:sid', { preHandler: [requireOwner] }, produkController.hapusSatuanBeli);
}
