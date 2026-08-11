import { supabaseAdmin } from '../../config/database.js';

function generateNomorNota() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `NM-${dateStr}-${randomNum}`;
}

export const notaMasukService = {
  // Buat Nota Masuk Baru + Hitung Ulang HPP Average Cost + Tambah Stok
  async buatNotaMasuk(toko_id, created_by_id, payload) {
    const { supplier_id, tanggal, total, total_dibayar, foto_nota_url, catatan, items } = payload;
    const nomor_nota = payload.nomor_nota || generateNomorNota();

    const totalNum = Number(total || 0);
    const dibayarNum = Number(total_dibayar || 0);
    const sisa_hutang = Math.max(0, totalNum - dibayarNum);

    let status_bayar = 'lunas';
    if (sisa_hutang > 0) {
      status_bayar = dibayarNum > 0 ? 'sebagian' : 'hutang';
    }

    // 1. Insert header nota_masuk
    const { data: nota, error: errNota } = await supabaseAdmin
      .from('nota_masuk')
      .insert({
        toko_id,
        supplier_id,
        nomor_nota,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        total: totalNum,
        total_dibayar: dibayarNum,
        sisa_hutang,
        status_bayar,
        foto_nota_url,
        catatan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errNota) throw new Error('Gagal menyimpan nota masuk: ' + errNota.message);

    // 2. Insert items + update HPP (Average Cost) + Tambah Stok + Audit Movement
    if (items && items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        nota_masuk_id: nota.id,
        produk_id: item.produk_id,
        produk_satuan_beli_id: item.produk_satuan_beli_id || null,
        nama_produk: item.nama_produk,
        satuan: item.satuan,
        konversi: item.konversi || 1,
        qty: item.qty,
        qty_dasar: Number(item.qty) * Number(item.konversi || 1),
        harga_beli: item.harga_beli,
        subtotal: item.subtotal,
      }));

      await supabaseAdmin.from('nota_masuk_item').insert(itemsToInsert);

      for (const item of items) {
        const qty_dasar = Number(item.qty) * Number(item.konversi || 1);
        const harga_beli_dasar = Number(item.harga_beli) / Number(item.konversi || 1);

        const { data: p } = await supabaseAdmin
          .from('produk')
          .select('stok, hpp')
          .eq('id', item.produk_id)
          .single();

        if (p) {
          const stok_lama = Number(p.stok);
          const hpp_lama = Number(p.hpp);
          const stok_baru = stok_lama + qty_dasar;

          // Kalkulasi HPP Average Cost Baru: ((stok_lama * hpp_lama) + (qty_dasar * harga_beli_dasar)) / stok_baru
          let hpp_baru = hpp_lama;
          if (stok_baru > 0) {
            hpp_baru = ((stok_lama * hpp_lama) + (qty_dasar * harga_beli_dasar)) / stok_baru;
          }

          // Update produk: stok & hpp baru
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_baru, hpp: hpp_baru })
            .eq('id', item.produk_id);

          // Update harga_beli_terakhir di produk_supplier
          await supabaseAdmin
            .from('produk_supplier')
            .upsert({
              produk_id: item.produk_id,
              supplier_id,
              toko_id,
              harga_beli_terakhir: item.harga_beli,
            });

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'pembelian',
            referensi_id: nota.id,
            referensi_nomor: nota.nomor_nota,
            qty: qty_dasar,
            stok_sebelum: stok_lama,
            stok_sesudah: stok_baru,
          });
        }
      }
    }

    return nota;
  },

  async listNotaMasuk(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('nota_masuk')
      .select('*, supplier:supplier_id(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar nota masuk');
    return data;
  },

  async detailNotaMasuk(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('nota_masuk')
      .select('*, supplier:supplier_id(nama), items:nota_masuk_item(*), pembayaran:pembayaran_hutang(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Nota masuk tidak ditemukan');
    return data;
  },
};
