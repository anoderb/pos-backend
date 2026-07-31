import { transaksiService } from './transaksi.service.js';
import { responseSukses } from '../../utils/response.js';
import { supabaseAdmin } from '../../config/database.js';

export const transaksiController = {
  // POST /api/transaksi
  async buat(request, reply) {
    const { subtotal, total, metode_bayar, nominal_bayar, items } = request.body || {};
    if ((!total && !subtotal) || !metode_bayar || !items || items.length === 0) {
      return reply.code(400).send({
        berhasil: false,
        pesan: 'total / subtotal, metode_bayar, dan items wajib diisi',
      });
    }

    let finalShiftId = request.body.shift_id;
    if (!finalShiftId) {
      const { data: activeShift } = await supabaseAdmin
        .from('shift_kasir')
        .select('id')
        .eq('toko_id', request.toko_id)
        .eq('status', 'buka')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeShift?.id) {
        finalShiftId = activeShift.id;
      } else {
        const { data: newShift } = await supabaseAdmin
          .from('shift_kasir')
          .insert({
            toko_id: request.toko_id,
            kasir_id: request.pengguna.id,
            saldo_awal: 0,
            status: 'buka',
          })
          .select()
          .single();
        finalShiftId = newShift?.id;
      }
    }

    const calculatedSubtotal = subtotal || items.reduce((s, i) => s + (Number(i.subtotal) || Number(i.harga_satuan) * Number(i.qty) || 0), 0);
    const calculatedTotal = total || Math.max(0, calculatedSubtotal - (Number(request.body.diskon_total) || 0));

    const payload = {
      ...request.body,
      shift_id: finalShiftId,
      subtotal: calculatedSubtotal,
      total: calculatedTotal,
      nominal_bayar: nominal_bayar || calculatedTotal,
    };

    const tx = await transaksiService.buatTransaksi(request.toko_id, request.pengguna.id, payload);
    return reply.code(201).send(responseSukses(tx, 'Transaksi berhasil disimpan'));
  },

  // POST /api/transaksi/sync-offline
  async syncOffline(request, reply) {
    const { transaksi } = request.body || {};
    if (!transaksi || !Array.isArray(transaksi) || transaksi.length === 0) {
      return reply.code(400).send({ berhasil: false, pesan: 'Payload transaksi offline tidak valid' });
    }

    const hasil = await transaksiService.syncOffline(request.toko_id, request.pengguna.id, transaksi);
    return reply.send(responseSukses(hasil, 'Proses sinkronisasi transaksi offline selesai'));
  },

  // GET /api/transaksi
  async list(request, reply) {
    const { tanggal, kasir_id, metode_bayar } = request.query || {};
    const list = await transaksiService.list(request.toko_id, { tanggal, kasir_id, metode_bayar });
    return reply.send(responseSukses(list, 'Daftar transaksi'));
  },

  // GET /api/transaksi/:id
  async detail(request, reply) {
    const detail = await transaksiService.detail(request.toko_id, request.params.id);
    return reply.send(responseSukses(detail, 'Detail transaksi'));
  },

  // POST /api/transaksi/:id/void
  async voidTx(request, reply) {
    const { alasan_void } = request.body || {};
    if (!alasan_void) {
      return reply.code(400).send({ berhasil: false, pesan: 'Alasan void wajib diisi' });
    }

    const tx = await transaksiService.voidTransaksi(
      request.toko_id,
      request.params.id,
      request.pengguna.id,
      { alasan_void }
    );
    return reply.send(responseSukses(tx, 'Transaksi berhasil divoid'));
  },
};
