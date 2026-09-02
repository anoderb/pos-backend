import { supabaseAdmin } from '../../config/database.js';
import { auditLog } from '../../utils/audit.js';
import { httpError } from '../../utils/errors.js';
import { qrisService } from '../qris/qris.service.js';
import { parseQRIS, validateQRIS } from '../../utils/qris-utils.mjs';

// Helper generator nomor transaksi anti-collision (cth: TRX-260730-1234567)
function generateNomorTransaksi() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  const ms = String(now.getTime() % 100000).padStart(5, '0');
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `TRX-${dateStr}-${ms}${rand}`;
}

export const transaksiService = {
  // Buat Transaksi Baru (Online + Offline sync)
  // KEAMANAN (#1,#2,#3): harga/total di-RE-COMPUTE dari DB (abaikan angka client),
  // stok decrement ATOMIC, dan idempotency-key mencegah transaksi ganda.
  async buatTransaksi(toko_id, kasir_id, payload) {
    const {
      shift_id,
      pelanggan_id,
      diskon_total,
      metode_bayar,
      nominal_bayar,
      items,
      is_offline,
      idempotency_key,
    } = payload;

    const nomor_transaksi = payload.nomor_transaksi || generateNomorTransaksi();

    // ── Validasi dasar ──
    // QRIS Dinamis: metode bayar hanya cash/qris (transfer dihapus)
    const VALID_METODE_BAYAR = ['cash', 'tunai', 'qris'];
    if (!metode_bayar || !VALID_METODE_BAYAR.includes(metode_bayar)) {
      throw new Error('Metode bayar tidak valid. Pilihan: tunai, qris.');
    }
    // Normalisasi ke nilai yang diterima DB constraint: cash/qris/transfer.
    // FE legacy pakai 'tunai' → map ke 'cash'.
    const metodeDb = metode_bayar === 'tunai' ? 'cash' : metode_bayar;
    if (!items || items.length === 0) throw new Error('Item transaksi wajib diisi');
    if (items.some((i) => !i.produk_id || Number(i.qty) <= 0)) {
      throw new Error('Setiap item wajib punya produk_id dan qty lebih dari 0');
    }
    if (diskon_total !== undefined && Number(diskon_total) < 0) {
      throw new Error('Diskon total tidak boleh negatif');
    }

    // ── Idempotency (#3): kalau sudah diproses, kembalikan transaksi existing ──
    if (idempotency_key) {
      try {
        const { data: dup } = await supabaseAdmin
          .from('transaksi')
          .select('*')
          .eq('toko_id', toko_id)
          .eq('idempotency_key', idempotency_key)
          .maybeSingle();
        if (dup) return dup;
      } catch (idemErr) {
        // Kolom belum ada (migrasi belum jalan) → abaikan, lanjut insert (di-handle di bawah)
        if (!String(idemErr?.message || '').toLowerCase().includes('idempotency')) throw idemErr;
      }
    }

    // ── Resolve harga & stok dari DB (#1, #4, tenant check) ──
    const prodIds = [...new Set(items.map((i) => i.produk_id))];
    const { data: sjs } = await supabaseAdmin
      .from('produk_satuan_jual')
      .select('*, produk:produk_id(id, toko_id, nama, stok)')
      .in('produk_id', prodIds);

    const resolvedItems = [];
    let totalSubtotal = 0;

    for (const item of items) {
      const qty = Number(item.qty);

      // Pilih satuan jual: spesifik (produk_satuan_jual_id) atau default produk
      let sj = null;
      if (item.produk_satuan_jual_id) {
        sj = sjs?.find((s) => s.id === item.produk_satuan_jual_id && s.produk_id === item.produk_id);
        if (!sj) throw new Error('Satuan jual produk tidak ditemukan atau tidak milik toko ini');
      } else {
        sj = sjs?.find((s) => s.produk_id === item.produk_id && s.is_default)
          || sjs?.find((s) => s.produk_id === item.produk_id);
        if (!sj) throw new Error(`Produk ${item.produk_id} belum punya satuan jual`);
      }

      // Tenant isolation: produk harus milik toko yang sama
      if (!sj.produk || sj.produk.toko_id !== toko_id) {
        throw new Error('Produk tidak ditemukan pada toko ini');
      }

      // Harga dari DB (bukan dari client) — strict: tolak kalau harga belum diatur
      const hargaSatuan = Number(sj.harga_ecer || 0);
      if (hargaSatuan <= 0) {
        throw new Error(`Harga jual produk "${sj.produk.nama || item.produk_id}" belum diatur`);
      }

      const subtotalItem = hargaSatuan * qty;
      totalSubtotal += subtotalItem;

      resolvedItems.push({
        transaksi_id: null, // diisi setelah header
        produk_id: item.produk_id,
        produk_satuan_jual_id: sj.id,
        nama_produk: String(sj.produk.nama || item.nama_produk || 'Produk').slice(0, 100),
        satuan: String(item.satuan || 'pcs').slice(0, 20),
        konversi: Number(sj.konversi) || 1,
        qty,
        harga_satuan: hargaSatuan,
        diskon: Math.min(Number(item.diskon) || 0, subtotalItem),
        subtotal: subtotalItem,
      });
    }

    // #E1b: tolak eksplisit diskon melebihi subtotal (cegah barang gratis / manipulasi).
    // Current code clamp diam-diam ke 0 → kasir bisa 'gratisin' barang; ini harus penolakan.
    const diskonRequest = Number(diskon_total) || 0;
    if (diskonRequest > totalSubtotal) {
      throw new Error(`Diskon tidak boleh melebihi total belanja. Maksimal diskon: Rp ${totalSubtotal.toLocaleString('id-ID')}`);
    }

    // Diskon total customer ≤ subtotal
    const diskon = Math.min(diskonRequest, totalSubtotal);
    const total = Math.max(0, totalSubtotal - diskon);
    const nominal = Number(nominal_bayar) || total;
    if (metodeDb === 'cash' && nominal < total) {
      throw new Error(`Uang pembayaran tidak mencukupi. Total: ${total}, Dibayar: ${nominal}`);
    }

    // ── QRIS Dinamis: metode qris → generate payload dinamis + status pending ──
    let qrisPayload = null;
    let transaksiStatus = 'selesai';
    let statusQris = null;
    if (metodeDb === 'qris') {
      // Ambil QRIS valid toko
      const { data: tokoQris } = await supabaseAdmin
        .from('toko')
        .select('qris_string, qris_status')
        .eq('id', toko_id)
        .maybeSingle();
      if (!tokoQris?.qris_string || tokoQris.qris_status !== 'valid') {
        throw new Error('QRIS belum diatur untuk toko ini. Silakan atur QRIS di Pengaturan.');
      }
      qrisPayload = qrisService.generateDinamis(tokoQris.qris_string, total);
      const hasilQris = parseQRIS(qrisPayload);
      const hasilValidasi = validateQRIS(qrisPayload, { requireIdr: true, requireMerchantDetails: true });
      if (!hasilValidasi.valid || hasilQris.method !== 'dynamic' || hasilQris.amount !== String(total)) {
        throw new Error('QRIS pembayaran gagal diverifikasi. Silakan upload ulang QRIS asli.');
      }
      transaksiStatus = 'pending';
      statusQris = 'pending';
    }
    const kembalian = metodeDb === 'cash' ? Math.max(0, nominal - total) : 0;

    // ── Atomic stock reserve (#2): decrement atomik dilakukan SETELAH header+items,
    // jadi kalau salah satu item gagal, transaksi dibatalkan (throw) dan client retry.
    // (Reserve di sini tidak dilakukan — decrementStokAtomik memakai RPC/guarded update)

    // 1. Insert header transaksi
    const headerData = {
      toko_id,
      shift_id: shift_id || '00000000-0000-0000-0000-000000000000',
      kasir_id,
      pelanggan_id: pelanggan_id || null,
      nomor_transaksi,
      subtotal: totalSubtotal,
      diskon_total: diskon,
      total,
      metode_bayar: metodeDb,
      nominal_bayar: nominal,
      kembalian,
      idempotency_key: idempotency_key || null,
      status: transaksiStatus,
      status_qris: statusQris,
      qris_payload: qrisPayload,
      is_offline: is_offline || false,
      created_at: new Date().toISOString(),
    };

    // Graceful: kolom idempotency_key baru ada setelah migrasi dijalankan.
    // Kalau belum, insert ulang tanpa kolom itu (anti PGRST204).
    let { data: tx, error: errTx } = await supabaseAdmin
      .from('transaksi')
      .insert(headerData)
      .select()
      .single();

    if (errTx && String(errTx.message || '').includes('idempotency_key')) {
      delete headerData.idempotency_key;
      ({ data: tx, error: errTx } = await supabaseAdmin
        .from('transaksi')
        .insert(headerData)
        .select()
        .single());
    }

    if (errTx) throw new Error('Gagal menyimpan transaksi: ' + errTx.message);

    // 2. Insert items dengan harga hasil recompute
    const itemsToInsert = resolvedItems.map((it, idx) => ({ ...it, transaksi_id: tx.id }));
    const { error: errItems } = await supabaseAdmin.from('transaksi_item').insert(itemsToInsert);
    if (errItems) {
      console.error('Error insert transaksi_item:', errItems);
      throw new Error('Gagal menyimpan item transaksi: ' + errItems.message);
    }

    // 3. Potong stok HANYA utk transaksi selesai (cash). QRIS pending TIDAK
    //    dikurangi dulu — stok dipotong saat di-approve (lihat approveTransaksiQris).
    if (transaksiStatus === 'selesai') {
      await this.decrementStokAtomik(toko_id, tx, resolvedItems);
    }

    return tx;
  },

  // Approve transaksi QRIS pending → selesai + potong stok + catat omzet
  async approveTransaksiQris(toko_id, id, actor_id, actorRole, { alasan } = {}) {
    const { data: tx } = await supabaseAdmin
      .from('transaksi')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();
    if (!tx) throw new Error('Transaksi tidak ditemukan');
    if (tx.status_qris !== 'pending' || tx.metode_bayar !== 'qris') {
      throw new Error('Hanya transaksi QRIS berstatus pending yang dapat di-approve');
    }
    if (actorRole !== 'owner' && tx.kasir_id !== actor_id) {
      throw httpError(403, 'Anda hanya dapat meng-approve transaksi yang Anda buat sendiri');
    }

    // Ambil items utk potong stok
    const { data: items } = await supabaseAdmin
      .from('transaksi_item')
      .select('*')
      .eq('transaksi_id', tx.id);
    const resolved = (items || []).map((it) => ({
      produk_id: it.produk_id,
      nama_produk: it.nama_produk,
      qty: it.qty,
      konversi: it.konversi || 1,
      harga_satuan: it.harga_satuan,
      subtotal: it.subtotal,
    }));

    // H2: potong stok DULU (atomik) — kalau ada item stok kurang → throw,
    // status tetap pending, client boleh retry. Update status menyusul.
    if (resolved.length > 0) {
      await this.decrementStokAtomik(toko_id, tx, resolved);
    }

    // Update status
    const { data: updated, error } = await supabaseAdmin
      .from('transaksi')
      .update({
        status: 'selesai',
        status_qris: 'approved',
        qris_alasan: alasan || null,
        qris_action_by: actor_id,
        qris_action_at: new Date().toISOString(),
      })
      .eq('id', tx.id)
      .select()
      .maybeSingle();
    if (error || !updated) throw new Error('Gagal meng-approve transaksi');
    return updated;
  },

  // Cancel transaksi QRIS pending → batal (stok memang belum dipotong)
  async cancelTransaksiQris(toko_id, id, actor_id, actorRole, { alasan }) {
    const { data: tx } = await supabaseAdmin
      .from('transaksi')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();
    if (!tx) throw new Error('Transaksi tidak ditemukan');
    if (tx.status_qris !== 'pending' || tx.metode_bayar !== 'qris') {
      throw new Error('Hanya transaksi QRIS berstatus pending yang dapat dibatalkan');
    }
    if (actorRole !== 'owner' && tx.kasir_id !== actor_id) {
      throw httpError(403, 'Anda hanya dapat membatalkan transaksi yang Anda buat sendiri');
    }

    const { data: updated, error } = await supabaseAdmin
      .from('transaksi')
      .update({
        status: 'void',
        status_qris: 'cancelled',
        qris_alasan: alasan || null,
        qris_action_by: actor_id,
        qris_action_at: new Date().toISOString(),
      })
      .eq('id', tx.id)
      .select()
      .maybeSingle();
    if (error || !updated) throw new Error('Gagal membatalkan transaksi');
    return updated;
  },

  // Atomic stock decrement anti-oversell (#2)
  // Prioritas: RPC SQL `decrement_stok_atomik` (atomik beneran). Kalau belum ada
  // (kolom idempotency_key belum dibuat user di Supabase), fallback guarded update
  // read-then-write dengan cek ulang — mengurangi race, bukan menghilangkan.
  async decrementStokAtomik(toko_id, tx, resolvedItems) {
    for (const it of resolvedItems) {
      const qtyDasar = it.qty * it.konversi;
      let stokSebelum = null;
      let stokSesudah = null;

      // Coba RPC atomik
      try {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('decrement_stok_atomik', {
          p_produk_id: it.produk_id,
          p_qty: qtyDasar,
        });
        if (rpcErr) throw rpcErr;
        const parsed = typeof rpcRes === 'string' ? JSON.parse(rpcRes) : rpcRes;
        if (!parsed?.ok) {
          throw new Error(`Stok tidak mencukupi untuk produk ${it.nama_produk}`);
        }
        stokSebelum = Number(parsed.stok_sebelum);
        stokSesudah = Number(parsed.stok_sesudah);
      } catch (rpcErr) {
        // RPC belum tersedia (function tidak ada) → fallback guarded update
        if (String(rpcErr?.message || '').toLowerCase().includes('function') || String(rpcErr?.code || '') === 'PGRST202') {
          const { data: p } = await supabaseAdmin
            .from('produk')
            .select('stok')
            .eq('id', it.produk_id)
            .single();
          stokSebelum = Number(p?.stok || 0);
          if (stokSebelum < qtyDasar) {
            throw new Error(`Stok tidak mencukupi untuk produk ${it.nama_produk}. Tersedia: ${stokSebelum}, Dibutuhkan: ${qtyDasar}`);
          }
          stokSesudah = stokSebelum - qtyDasar;
          await supabaseAdmin
            .from('produk')
            .update({ stok: stokSesudah })
            .eq('id', it.produk_id)
            .eq('toko_id', toko_id);
        } else {
          throw rpcErr;
        }
      }

      await supabaseAdmin.from('stock_movement').insert({
        toko_id,
        produk_id: it.produk_id,
        jenis: 'penjualan',
        referensi_id: tx.id,
        referensi_nomor: tx.nomor_transaksi,
        qty: -qtyDasar,
        stok_sebelum: stokSebelum,
        stok_sesudah: stokSesudah,
      });
    }
  },

  // Sync Batch Transaksi Offline dari Dexie.js
  async syncOffline(toko_id, kasir_id, transaksiList) {
    const hasil = [];

    for (const txPayload of transaksiList) {
      try {
        // Cek duplikasi nomor transaksi
        const { data: existing } = await supabaseAdmin
          .from('transaksi')
          .select('id')
          .eq('toko_id', toko_id)
          .eq('nomor_transaksi', txPayload.nomor_transaksi)
          .maybeSingle();

        if (!existing) {
          console.log('SYNC_OFFLINE payload shift_id:', txPayload.shift_id);
          const fixedPayload = {
            ...txPayload,
            shift_id: txPayload.shift_id || '00000000-0000-0000-0000-000000000000',
            is_offline: true,
          };
          console.log('SYNC_OFFLINE after fix shift_id:', fixedPayload.shift_id);
          const savedTx = await this.buatTransaksi(toko_id, kasir_id, fixedPayload);
          hasil.push({ id: txPayload.id, status: 'synced', server_id: savedTx.id });
        } else {
          hasil.push({ id: txPayload.id, status: 'already_exists' });
        }
      } catch (err) {
        console.error('Gagal sync item transaksi offline:', err);
        hasil.push({ id: txPayload.id, status: 'error', pesan: err.message });
      }
    }

    return hasil;
  },

  // List Transaksi
  async list(toko_id, { tanggal, kasir_id, metode_bayar, pagination } = {}) {
    let query = supabaseAdmin
      .from('transaksi')
      .select('*, kasir:kasir_id(nama), pelanggan:pelanggan_id(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (kasir_id) query = query.eq('kasir_id', kasir_id);
    if (metode_bayar) query = query.eq('metode_bayar', metode_bayar);
    if (pagination) query = query.range(pagination.offset, pagination.end);

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil daftar transaksi');
    return data;
  },

  // Detail Transaksi + Items
  async detail(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('transaksi')
      .select('*, kasir:kasir_id(nama), pelanggan:pelanggan_id(nama), items:transaksi_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error('Transaksi tidak ditemukan');
    if (!data) throw new Error('Transaksi tidak ditemukan');
    return data;
  },

  // Void Transaksi (Batal Transaksi & Stok Kembali)
  // #N1: hanya pemilik transaksi (kasir yg membuatnya) ATAU owner toko yg boleh void.
  async voidTransaksi(toko_id, id, void_by_id, { alasan_void, actorRole = 'kasir' }) {
    const { data: tx } = await supabaseAdmin
      .from('transaksi')
      .select('*, items:transaksi_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .maybeSingle();

    if (!tx) throw new Error('Transaksi tidak ditemukan');
    if (tx.status === 'void') throw new Error('Transaksi ini sudah divoid sebelumnya');
    // H1: transaksi QRIS pending tidak boleh di-void — stok belum dipotong,
    // void akan men-restore stok yang tidak pernah dipotong (inflate).
    if (tx.status === 'pending') {
      throw httpError(409, 'Transaksi QRIS pending harus dibatalkan via QRIS cancel, bukan void');
    }

    // Ownership / otorisasi void (horizontal authorization)
    if (actorRole !== 'owner' && tx.kasir_id !== void_by_id) {
      throw httpError(403, 'Anda hanya dapat membatalkan transaksi yang Anda buat sendiri');
    }

    // 🔒 Validasi batas waktu void (24 jam)
    const txTime = new Date(tx.created_at).getTime();
    const now = Date.now();
    const maxVoidMs = 24 * 60 * 60 * 1000;
    if (now - txTime > maxVoidMs) {
      throw new Error('Transaksi hanya bisa di-void dalam rentang 24 jam setelah dibuat');
    }

    // 1. Update status transaksi -> void
    const { data: txVoid, error } = await supabaseAdmin
      .from('transaksi')
      .update({
        status: 'void',
        alasan_void,
        void_by: void_by_id,
        void_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error('Gagal memvoid transaksi');
    if (!txVoid) throw new Error('Transaksi tidak ditemukan');

    await auditLog({
      toko_id,
      user_id: void_by_id,
      aksi: 'void_transaksi',
      tabel: 'transaksi',
      record_id: id,
      detail: { alasan_void, nomor_transaksi: tx.nomor_transaksi },
    });

    // 2. Kembalikan stok produk (atomic via RPC increment, fallback guarded update)
    if (tx.items) {
      for (const item of tx.items) {
        const qty_dasar = Number(item.qty) * Number(item.konversi || 1);

        let stokSebelum = null;
        let stokSesudah = null;

        try {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('increment_stok_atomik', {
            p_produk_id: item.produk_id,
            p_qty: qty_dasar,
          });
          if (rpcErr) throw rpcErr;
          const parsed = typeof rpcRes === 'string' ? JSON.parse(rpcRes) : rpcRes;
          if (parsed?.ok) {
            stokSebelum = Number(parsed.stok_sebelum);
            stokSesudah = Number(parsed.stok_sesudah);
          }
        } catch (rpcErr) {
          const isMissingFn = String(rpcErr?.message || '').toLowerCase().includes('function')
            || String(rpcErr?.code || '') === 'PGRST202';
          if (!isMissingFn && !String(rpcErr?.message || '').toLowerCase().includes('syntax')) throw rpcErr;
          // fallback: baca lalu update
          const { data: p } = await supabaseAdmin
            .from('produk')
            .select('stok')
            .eq('id', item.produk_id)
            .single();
          if (p) {
            stokSebelum = Number(p.stok);
            stokSesudah = stokSebelum + qty_dasar;
            await supabaseAdmin
              .from('produk')
              .update({ stok: stokSesudah })
              .eq('id', item.produk_id);
          }
        }

        if (stokSebelum !== null && stokSesudah !== null) {
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'void_penjualan',
            referensi_id: tx.id,
            referensi_nomor: tx.nomor_transaksi,
            qty: qty_dasar,
            stok_sebelum: stokSebelum,
            stok_sesudah: stokSesudah,
          });
        }
      }
    }

    return txVoid;
  },
};
