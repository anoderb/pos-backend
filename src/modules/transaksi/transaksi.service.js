import { supabaseAdmin } from '../../config/database.js';

// Helper generator nomor transaksi (cth: TRX-260730-0001)
function generateNomorTransaksi() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `TRX-${dateStr}-${randomNum}`;
}

export const transaksiService = {
  // Buat Transaksi Baru (Online)
  async buatTransaksi(toko_id, kasir_id, payload) {
    const {
      shift_id,
      pelanggan_id,
      subtotal,
      diskon_total,
      total,
      metode_bayar,
      nominal_bayar,
      kembalian,
      items,
      is_offline,
    } = payload;

    const nomor_transaksi = payload.nomor_transaksi || generateNomorTransaksi();

    // 1. Insert header transaksi
    const { data: tx, error: errTx } = await supabaseAdmin
      .from('transaksi')
      .insert({
        toko_id,
        shift_id,
        kasir_id,
        pelanggan_id: pelanggan_id || null,
        nomor_transaksi,
        subtotal,
        diskon_total: diskon_total || 0,
        total,
        metode_bayar,
        nominal_bayar,
        kembalian: kembalian || 0,
        status: 'selesai',
        is_offline: is_offline || false,
        created_at: payload.created_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (errTx) throw new Error('Gagal menyimpan transaksi: ' + errTx.message);

    // 2. Insert items & potong stok produk + catat stock movement
    if (items && items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        transaksi_id: tx.id,
        produk_id: item.produk_id,
        produk_satuan_jual_id: item.produk_satuan_jual_id || null,
        nama_produk: item.nama_produk,
        satuan: item.satuan,
        konversi: item.konversi || 1,
        qty: item.qty,
        harga_satuan: item.harga_satuan,
        diskon: item.diskon || 0,
        subtotal: item.subtotal,
      }));

      const { error: errItems } = await supabaseAdmin.from('transaksi_item').insert(itemsToInsert);
      if (errItems) console.error('Error insert transaksi_item:', errItems);

      // Potong stok & audit stock_movement per produk
      for (const item of items) {
        const qty_dasar = Number(item.qty) * Number(item.konversi || 1);

        const { data: p } = await supabaseAdmin
          .from('produk')
          .select('stok')
          .eq('id', item.produk_id)
          .single();

        if (p) {
          const stok_sebelum = Number(p.stok);
          const stok_sesudah = stok_sebelum - qty_dasar;

          // Update stok produk
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_sesudah })
            .eq('id', item.produk_id);

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'penjualan',
            referensi_id: tx.id,
            referensi_nomor: tx.nomor_transaksi,
            qty: -qty_dasar,
            stok_sebelum,
            stok_sesudah,
          });
        }
      }
    }

    return tx;
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
          const savedTx = await this.buatTransaksi(toko_id, kasir_id, {
            ...txPayload,
            is_offline: true,
          });
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
  async list(toko_id, { tanggal, kasir_id, metode_bayar } = {}) {
    let query = supabaseAdmin
      .from('transaksi')
      .select('*, kasir:kasir_id(nama), pelanggan:pelanggan_id(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (kasir_id) query = query.eq('kasir_id', kasir_id);
    if (metode_bayar) query = query.eq('metode_bayar', metode_bayar);

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
      .single();

    if (error) throw new Error('Transaksi tidak ditemukan');
    return data;
  },

  // Void Transaksi (Batal Transaksi & Stok Kembali)
  async voidTransaksi(toko_id, id, void_by_id, { alasan_void }) {
    const { data: tx } = await supabaseAdmin
      .from('transaksi')
      .select('*, items:transaksi_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (!tx) throw new Error('Transaksi tidak ditemukan');
    if (tx.status === 'void') throw new Error('Transaksi ini sudah divoid sebelumnya');

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
      .single();

    if (error) throw new Error('Gagal memvoid transaksi');

    // 2. Kembalikan stok produk & catat stock_movement jenis void_penjualan
    if (tx.items) {
      for (const item of tx.items) {
        const qty_dasar = Number(item.qty) * Number(item.konversi || 1);

        const { data: p } = await supabaseAdmin
          .from('produk')
          .select('stok')
          .eq('id', item.produk_id)
          .single();

        if (p) {
          const stok_sebelum = Number(p.stok);
          const stok_sesudah = stok_sebelum + qty_dasar;

          // Restorasi stok
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_sesudah })
            .eq('id', item.produk_id);

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'void_penjualan',
            referensi_id: tx.id,
            referensi_nomor: tx.nomor_transaksi,
            qty: qty_dasar,
            stok_sebelum,
            stok_sesudah,
          });
        }
      }
    }

    return txVoid;
  },
};
