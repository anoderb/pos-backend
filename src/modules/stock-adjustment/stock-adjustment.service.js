import { supabaseAdmin } from '../../config/database.js';

function generateNomorAdj() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `ADJ-${dateStr}-${randomNum}`;
}

export const stockAdjustmentService = {
  // Buat Stock Adjustment Baru (+ / -) + Update Stok + Stock Movement Audit
  async buatAdjustment(toko_id, created_by_id, { produk_id, tipe, qty, alasan }) {
    if (!alasan || !alasan.trim()) {
      throw new Error('Alasan adjustment wajib diisi');
    }

    const qtyNum = Number(qty || 0);
    if (qtyNum <= 0) throw new Error('Qty adjustment harus lebih besar dari 0');

    // 1. Ambil stok terkini produk
    const { data: produk } = await supabaseAdmin
      .from('produk')
      .select('stok')
      .eq('toko_id', toko_id)
      .eq('id', produk_id)
      .single();

    if (!produk) throw new Error('Produk tidak ditemukan');

    const stok_sebelum = Number(produk.stok);
    const deltaQty = tipe === 'tambah' ? qtyNum : -qtyNum;
    const stok_sesudah = stok_sebelum + deltaQty;

    const nomor_adjustment = generateNomorAdj();

    // 2. Insert record stock_adjustment
    const { data: adj, error: errAdj } = await supabaseAdmin
      .from('stock_adjustment')
      .insert({
        toko_id,
        produk_id,
        nomor_adjustment,
        tipe,
        qty: qtyNum,
        stok_sebelum,
        stok_sesudah,
        alasan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errAdj) throw new Error('Gagal menyimpan stock adjustment: ' + errAdj.message);

    // 3. Update stok produk
    await supabaseAdmin
      .from('produk')
      .update({ stok: stok_sesudah })
      .eq('id', produk_id);

    // 4. Audit stock_movement
    await supabaseAdmin.from('stock_movement').insert({
      toko_id,
      produk_id,
      jenis: 'adjustment',
      referensi_id: adj.id,
      referensi_nomor: adj.nomor_adjustment,
      qty: deltaQty,
      stok_sebelum,
      stok_sesudah,
    });

    return adj;
  },

  async listAdjustment(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('stock_adjustment')
      .select('*, produk:produk_id(nama, barcode), pembuat:created_by(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar stock adjustment');
    return data;
  },
};
