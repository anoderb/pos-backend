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

    // Shift ditentukan dan divalidasi server-side. Client tidak boleh memilih
    // shift milik sesi/kasir lain atau memakai shift yang sudah ditutup.
    const { data: activeShift, error: shiftError } = await supabaseAdmin
      .from('shift')
      .select('id')
      .eq('toko_id', request.toko_id)
      .eq('kasir_id', request.pengguna.id)
      .eq('status', 'buka')
      .order('waktu_buka', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (shiftError || !activeShift?.id) {
      return reply.code(400).send({
        berhasil: false,
        pesan: 'Tidak ada shift aktif. Silakan buka atau lanjutkan shift terlebih dahulu.',
      });
    }

    const requestedShiftId = request.body.shift_id;
    if (requestedShiftId && requestedShiftId !== activeShift.id) {
      return reply.code(409).send({
        berhasil: false,
        pesan: 'Shift transaksi sudah berubah. Silakan muat ulang halaman POS.',
      });
    }

    const finalShiftId = activeShift.id;

    const calculatedSubtotal = subtotal || items.reduce((s, i) => s + (Number(i.subtotal) || Number(i.harga_satuan) * Number(i.qty) || 0), 0);
    const calculatedTotal = total || Math.max(0, calculatedSubtotal - (Number(request.body.diskon_total) || 0));

    if (calculatedTotal < 0) {
      return reply.code(400).send({
        berhasil: false,
        pesan: 'Total transaksi tidak boleh negatif',
      });
    }

    const nominal = nominal_bayar || calculatedTotal;
    if (metode_bayar === 'cash' && Number(nominal) < calculatedTotal) {
      return reply.code(400).send({
        berhasil: false,
        pesan: `Uang pembayaran tidak mencukupi. Total: ${calculatedTotal}, Dibayar: ${nominal}`,
      });
    }

    const kembalianValue = metode_bayar === 'cash'
      ? Math.max(0, Number(nominal) - calculatedTotal)
      : 0;

    const payload = {
      ...request.body,
      shift_id: finalShiftId,
      subtotal: calculatedSubtotal,
      total: calculatedTotal,
      nominal_bayar: nominal,
      kembalian: kembalianValue,
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
    const list = await transaksiService.list(request.toko_id, { tanggal, kasir_id, metode_bayar, pagination: request.pagination });
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
