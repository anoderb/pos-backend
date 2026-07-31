import { supabaseAdmin } from '../../config/database.js';

function generateNomorKonsinyasi() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `KSN-${dateStr}-${randomNum}`;
}

export const konsinyasiService = {
  // 1. Terima Barang Konsinyasi (Titip Jual) + Tambah Stok + Audit Movement
  async terimaBarangKonsinyasi(toko_id, created_by_id, payload) {
    const { supplier_id, tanggal_terima, tanggal_jatuh_tempo, total_nilai, catatan, items } = payload;
    const nomor_konsinyasi = payload.nomor_konsinyasi || generateNomorKonsinyasi();

    const { data: ksn, error: errKsn } = await supabaseAdmin
      .from('konsinyasi')
      .insert({
        toko_id,
        supplier_id,
        nomor_konsinyasi,
        tanggal_terima: tanggal_terima || new Date().toISOString().slice(0, 10),
        tanggal_jatuh_tempo,
        total_nilai: total_nilai || 0,
        status: 'aktif',
        catatan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errKsn) throw new Error('Gagal mencatat barang konsinyasi: ' + errKsn.message);

    if (items && items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        konsinyasi_id: ksn.id,
        produk_id: item.produk_id,
        nama_produk: item.nama_produk,
        satuan: item.satuan,
        qty_terima: item.qty_terima,
        qty_terjual: 0,
        qty_kembali: 0,
        harga_beli: item.harga_beli,
        harga_jual: item.harga_jual,
      }));

      await supabaseAdmin.from('konsinyasi_item').insert(itemsToInsert);

      for (const item of items) {
        const { data: p } = await supabaseAdmin
          .from('produk')
          .select('stok')
          .eq('id', item.produk_id)
          .single();

        if (p) {
          const stok_sebelum = Number(p.stok);
          const stok_sesudah = stok_sebelum + Number(item.qty_terima);

          // Tambah stok produk titipan
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_sesudah })
            .eq('id', item.produk_id);

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'konsinyasi_masuk',
            referensi_id: ksn.id,
            referensi_nomor: ksn.nomor_konsinyasi,
            qty: Number(item.qty_terima),
            stok_sebelum,
            stok_sesudah,
          });
        }
      }
    }

    return ksn;
  },

  // 2. Kembalikan Barang Konsinyasi Tidak Terjual
  async kembalikanBarang(toko_id, id, { item_id, qty_kembali }) {
    const qtyKembaliNum = Number(qty_kembali || 0);

    const { data: item } = await supabaseAdmin
      .from('konsinyasi_item')
      .select('*, konsinyasi:konsinyasi_id(nomor_konsinyasi)')
      .eq('id', item_id)
      .eq('konsinyasi_id', id)
      .single();

    if (!item) throw new Error('Item konsinyasi tidak ditemukan');

    const sisaBisaDikembalikan = Number(item.qty_terima) - Number(item.qty_terjual) - Number(item.qty_kembali);
    if (qtyKembaliNum > sisaBisaDikembalikan) {
      throw new Error(`Qty pengembalian (${qtyKembaliNum}) melebihi sisa barang titipan (${sisaBisaDikembalikan})`);
    }

    const { data: updatedItem, error } = await supabaseAdmin
      .from('konsinyasi_item')
      .update({ qty_kembali: Number(item.qty_kembali) + qtyKembaliNum })
      .eq('id', item_id)
      .select()
      .single();

    if (error) throw new Error('Gagal mencatat pengembalian barang konsinyasi');

    // Potong stok produk & audit movement
    const { data: p } = await supabaseAdmin
      .from('produk')
      .select('stok')
      .eq('id', item.produk_id)
      .single();

    if (p) {
      const stok_sebelum = Number(p.stok);
      const stok_sesudah = stok_sebelum - qtyKembaliNum;

      await supabaseAdmin
        .from('produk')
        .update({ stok: stok_sesudah })
        .eq('id', item.produk_id);

      await supabaseAdmin.from('stock_movement').insert({
        toko_id,
        produk_id: item.produk_id,
        jenis: 'konsinyasi_kembali',
        referensi_id: id,
        referensi_nomor: item.konsinyasi?.nomor_konsinyasi,
        qty: -qtyKembaliNum,
        stok_sebelum,
        stok_sesudah,
      });
    }

    return updatedItem;
  },

  // 3. Settlement Pembayaran Konsinyasi
  async settlementBayar(toko_id, id, { jumlah_bayar }) {
    const jumlahNum = Number(jumlah_bayar || 0);

    const { data: ksn } = await supabaseAdmin
      .from('konsinyasi')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (!ksn) throw new Error('Konsinyasi tidak ditemukan');

    const total_dibayar_baru = Number(ksn.total_dibayar) + jumlahNum;

    const { data: updated, error } = await supabaseAdmin
      .from('konsinyasi')
      .update({
        total_dibayar: total_dibayar_baru,
        status: 'selesai',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal memproses settlement konsinyasi');
    return updated;
  },

  async listKonsinyasi(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('konsinyasi')
      .select('*, supplier:supplier_id(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar konsinyasi');
    return data;
  },

  async detailKonsinyasi(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('konsinyasi')
      .select('*, supplier:supplier_id(nama), items:konsinyasi_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Konsinyasi tidak ditemukan');
    return data;
  },
};
