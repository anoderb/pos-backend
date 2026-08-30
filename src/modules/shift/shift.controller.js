import { shiftService } from './shift.service.js';
import { responseSukses } from '../../utils/response.js';

export const shiftController = {
  // POST /api/shift/buka
  async buka(request, reply) {
    const { modal_awal } = request.body || {};
    if (modal_awal === undefined) {
      return reply.code(400).send({ berhasil: false, pesan: 'Modal awal wajib diisi' });
    }

    const data = await shiftService.bukaShift(request.toko_id, request.pengguna.id, { modal_awal });
    return reply.code(201).send(responseSukses(data, 'Shift berhasil dibuka'));
  },

  // GET /api/shift/aktif
  async shiftAktif(request, reply) {
    const data = await shiftService.getShiftAktif(request.toko_id, request.pengguna.id);
    return reply.send(responseSukses(data, 'Status shift aktif'));
  },

  // POST /api/shift/jeda
  async jeda(request, reply) {
    const data = await shiftService.jedaShift(request.toko_id, request.pengguna.id);
    return reply.send(responseSukses(data, 'Shift dijeda'));
  },

  // POST /api/shift/lanjut
  async lanjut(request, reply) {
    const data = await shiftService.lanjutShift(request.toko_id, request.pengguna.id);
    return reply.send(responseSukses(data, 'Shift dilanjutkan'));
  },

  // POST /api/shift/tutup
  async tutup(request, reply) {
    const { shift_id, kas_aktual, catatan } = request.body || {};
    if (!shift_id || kas_aktual === undefined) {
      return reply.code(400).send({ berhasil: false, pesan: 'shift_id dan kas_aktual wajib diisi' });
    }
    if (kas_aktual < 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'Kas aktual tidak boleh negatif' });
    }

    const data = await shiftService.tutupShift(request.toko_id, request.pengguna.id, {
      shift_id,
      kas_aktual,
      catatan,
    });
    return reply.send(responseSukses(data, 'Shift berhasil ditutup'));
  },

  // GET /api/shift
  async list(request, reply) {
    const data = await shiftService.listShift(request.toko_id, request.pagination);
    return reply.send(responseSukses(data, 'Daftar semua shift toko'));
  },

  // GET /api/shift/:id
  async detail(request, reply) {
    const data = await shiftService.getShiftById(request.toko_id, request.params.id);
    return reply.send(responseSukses(data, 'Detail shift kasir'));
  },
};
