import { transaksiService } from './transaksi.service.js';
import { responseSukses } from '../../utils/response.js';
import { supabaseAdmin } from '../../config/database.js';

export const transaksiController = {
  // POST /api/transaksi
  async buat(request, reply) {
    const { subtotal, metode_bayar, items } = request.body || {};

    // #3 Idempotency: gunakan header Idempotency-Key (UUID wajib) untuk anti-replay
    const idempotencyKey = request.headers?.['idempotency-key'] || request.body?.idempotency_key || null;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (idempotencyKey && !UUID_REGEX.test(idempotencyKey)) {
      return reply.code(400).send({ berhasil: false, pesan: 'Idempotency-Key harus berupa UUID yang valid' });
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

    // #1 Recompute: harga/total TIDAK diambil dari client — dihitung di service
    // dari produk_satuan_jual di DB. subtotal disini hanya pembungkus agar FE lama
    // yang wajib kirim total/subtotal tidak error; nilai aslinya diabaikan.
    if (!metode_bayar || !items || items.length === 0) {
      return reply.code(400).send({
        berhasil: false,
        pesan: 'metode_bayar dan items wajib diisi',
      });
    }
    void subtotal;

    const payload = {
      ...request.body,
      shift_id: finalShiftId,
      idempotency_key: idempotencyKey || undefined,
    };

    try {
      const tx = await transaksiService.buatTransaksi(request.toko_id, request.pengguna.id, payload);
      return reply.code(201).send(responseSukses(tx, 'Transaksi berhasil disimpan'));
    } catch (err) {
      return reply.code(400).send({ berhasil: false, pesan: err.message });
    }
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
