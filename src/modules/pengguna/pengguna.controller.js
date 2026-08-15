import { penggunaService } from './pengguna.service.js';
import { responseSukses } from '../../utils/response.js';

export const penggunaController = {
  // GET /api/pengguna
  async list(request, reply) {
    const list = await penggunaService.listKasir(request.toko_id, request.pagination);
    return reply.send(responseSukses(list, 'Daftar kasir toko'));
  },

  // POST /api/pengguna
  async tambah(request, reply) {
    const { nama, email, password } = request.body || {};
    if (!nama || !email || !password) {
      return reply.code(400).send({ berhasil: false, pesan: 'Nama, email, dan password wajib diisi' });
    }

    const kasir = await penggunaService.tambahKasir(request.toko_id, { nama, email, password });
    return reply.code(201).send(responseSukses(kasir, 'Akun kasir berhasil ditambahkan'));
  },

  // GET /api/pengguna/:id
  async detail(request, reply) {
    const kasir = await penggunaService.getKasirById(request.toko_id, request.params.id);
    return reply.send(responseSukses(kasir, 'Detail kasir'));
  },

  // PUT /api/pengguna/:id
  async update(request, reply) {
    const kasir = await penggunaService.updateKasir(request.toko_id, request.params.id, request.body || {});
    return reply.send(responseSukses(kasir, 'Data kasir berhasil diperbarui'));
  },

  // DELETE /api/pengguna/:id (Soft Delete)
  async nonaktifkan(request, reply) {
    const kasir = await penggunaService.deleteKasir(request.toko_id, request.params.id);
    return reply.send(responseSukses(kasir, 'Akun kasir telah dinonaktifkan'));
  },

  // DELETE /api/pengguna/:id/permanen (Hard Delete)
  async hapusPermanen(request, reply) {
    const kasir = await penggunaService.hapusKasirPermanen(request.toko_id, request.params.id);
    return reply.send(responseSukses(kasir, 'Akun kasir telah dihapus permanen'));
  },

  // GET /api/pengguna/:id/shift
  async historiShift(request, reply) {
    const shiftList = await penggunaService.getHistoriShiftKasir(request.toko_id, request.params.id);
    return reply.send(responseSukses(shiftList, 'Histori shift kasir'));
  },
};
