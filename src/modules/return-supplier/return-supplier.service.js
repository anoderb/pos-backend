import { supabaseAdmin } from '../../config/database.js';

function generateNomorReturn() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `RET-${dateStr}-${randomNum}`;
}

export const returnSupplierService = {
  // Buat Return Supplier Baru + Potong Stok Produk + Audit Movement
  async buatReturn(toko_id, created_by_id, payload) {
    const { supplier_id, nota_masuk_id, tanggal, total, alasan, catatan, items } = payload;
    const nomor_return = payload.nomor_return || generateNomorReturn();

    const { data: ret, error: errRet } = await supabaseAdmin
      .from('return_supplier')
      .insert({
        toko_id,
        supplier_id,
        nota_masuk_id: nota_masuk_id || null,
        nomor_return,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        total: total || 0,
        alasan,
        catatan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errRet) throw new Error('Gagal menyimpan return supplier: ' + errRet.message);

    if (items && items.length > 0) {
      const itemsToInsert = items.map((item) => ({
        return_supplier_id: ret.id,
        produk_id: item.produk_id,
        nama_produk: item.nama_produk,
        satuan: item.satuan,
        qty: item.qty,
        harga_beli: item.harga_beli,
        subtotal: item.subtotal,
      }));

      await supabaseAdmin.from('return_supplier_item').insert(itemsToInsert);

      for (const item of items) {
        const { data: p } = await supabaseAdmin
          .from('produk')
          .select('stok')
          .eq('id', item.produk_id)
          .single();

        if (p) {
          const stok_sebelum = Number(p.stok);
          const stok_sesudah = stok_sebelum - Number(item.qty);

          // Potong stok produk
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_sesudah })
            .eq('id', item.produk_id);

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'return_supplier',
            referensi_id: ret.id,
            referensi_nomor: ret.nomor_return,
            qty: -Number(item.qty),
            stok_sebelum,
            stok_sesudah,
          });
        }
      }
    }

    return ret;
  },

  async listReturn(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('return_supplier')
      .select('*, supplier:supplier_id(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar return supplier');
    return data;
  },

  async detailReturn(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('return_supplier')
      .select('*, supplier:supplier_id(nama), items:return_supplier_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Return supplier tidak ditemukan');
    return data;
  },
};
