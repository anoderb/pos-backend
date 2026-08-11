import { hutangService } from './hutang.service.js';
import { responseSukses } from '../../utils/response.js';

export const hutangController = {
  async list(request, reply) {
    const list = await hutangService.listHutangAktif(request.toko_id);
    return reply.send(responseSukses(list, 'Daftar hutang supplier aktif'));
  },

  async bayar(request, reply) {
    const { jumlah, metode, bukti_url, catatan } = request.body || {};
    if (!jumlah || jumlah <= 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'Jumlah pembayaran wajib diisi dan > 0' });
    }

    const bayar = await hutangService.bayarHutang(
      request.toko_id,
      request.params.nota_id,
      request.pengguna.id,
      { jumlah, metode, bukti_url, catatan }
    );

    return reply.code(201).send(responseSukses(bayar, 'Pembayaran hutang berhasil dicatat'));
  },

  async histori(request, reply) {
    const data = await hutangService.getHistoriPembayaran(request.toko_id, request.params.nota_id);
    return reply.send(responseSukses(data, 'Histori pembayaran hutang nota ini'));
  },
};
