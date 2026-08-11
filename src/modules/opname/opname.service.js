import { supabaseAdmin } from '../../config/database.js';

function generateNomorOpname() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `OPN-${dateStr}-${randomNum}`;
}

export const opnameService = {
  // 1. Buat Periode Stock Opname Baru (Status: Draft) + Auto Populate seluruh produk
  async buatOpname(toko_id, created_by_id, { tanggal, catatan }) {
    const nomor_opname = generateNomorOpname();

    const { data: op, error: errOp } = await supabaseAdmin
      .from('opname')
      .insert({
        toko_id,
        nomor_opname,
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        status: 'draft',
        catatan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errOp) throw new Error('Gagal membuat periode stock opname: ' + errOp.message);

    // Ambil seluruh produk aktif toko untuk dijadikan item opname
    const { data: produkList } = await supabaseAdmin
      .from('produk')
      .select('id, nama, stok, hpp, satuan_dasar:satuan_dasar_id(nama)')
      .eq('toko_id', toko_id)
      .eq('aktif', true);

    if (produkList && produkList.length > 0) {
      const opnameItems = produkList.map((p) => ({
        opname_id: op.id,
        produk_id: p.id,
        nama_produk: p.nama,
        satuan: p.satuan_dasar?.nama || 'pcs',
        stok_sistem: Number(p.stok),
        stok_fisik: null,
        selisih: null,
        nilai_selisih: null,
      }));

      await supabaseAdmin.from('opname_item').insert(opnameItems);
    }

    return op;
  },

  // 2. Input / Update Stok Fisik per Produk
  async updateItemStokFisik(toko_id, opname_id, produk_id, { stok_fisik, catatan }) {
    const stokFisikNum = Number(stok_fisik || 0);

    const { data: item } = await supabaseAdmin
      .from('opname_item')
      .select('stok_sistem, produk:produk_id(hpp)')
      .eq('opname_id', opname_id)
      .eq('produk_id', produk_id)
      .single();

    if (!item) throw new Error('Item opname tidak ditemukan');

    const selisih = stokFisikNum - Number(item.stok_sistem);
    const hpp = Number(item.produk?.hpp || 0);
    const nilai_selisih = selisih * hpp;

    const { data: updated, error } = await supabaseAdmin
      .from('opname_item')
      .update({
        stok_fisik: stokFisikNum,
        selisih,
        nilai_selisih,
        catatan,
      })
      .eq('opname_id', opname_id)
      .eq('produk_id', produk_id)
      .select()
      .single();

    if (error) throw new Error('Gagal memperbarui stok fisik');
    return updated;
  },

  // 3. Ubah Status Ke Review
  async submitReview(toko_id, opname_id) {
    const { data, error } = await supabaseAdmin
      .from('opname')
      .update({ status: 'review' })
      .eq('toko_id', toko_id)
      .eq('id', opname_id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengubah status opname ke review');
    return data;
  },

  // 4. Finalize Opname -> Update Stok Massal + Stock Movement Audit
  async finalizeOpname(toko_id, opname_id, finalized_by_id) {
    const { data: op } = await supabaseAdmin
      .from('opname')
      .select('*, items:opname_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', opname_id)
      .single();

    if (!op) throw new Error('Opname tidak ditemukan');
    if (op.status === 'final') throw new Error('Opname ini sudah difinalisasi sebelumnya');

    let total_selisih_qty = 0;
    let total_nilai_selisih = 0;

    if (op.items) {
      for (const item of op.items) {
        if (item.stok_fisik !== null && item.stok_fisik !== undefined) {
          const stok_sebelum = Number(item.stok_sistem);
          const stok_sesudah = Number(item.stok_fisik);
          const selisih = Number(item.selisih || 0);
          const nilai_selisih = Number(item.nilai_selisih || 0);

          total_selisih_qty += selisih;
          total_nilai_selisih += nilai_selisih;

          // Update stok fisik ke produk
          await supabaseAdmin
            .from('produk')
            .update({ stok: stok_sesudah })
            .eq('id', item.produk_id);

          // Audit stock movement
          await supabaseAdmin.from('stock_movement').insert({
            toko_id,
            produk_id: item.produk_id,
            jenis: 'opname',
            referensi_id: op.id,
            referensi_nomor: op.nomor_opname,
            qty: selisih,
            stok_sebelum,
            stok_sesudah,
          });
        }
      }
    }

    // Update status opname -> final
    const { data: opFinal, error } = await supabaseAdmin
      .from('opname')
      .update({
        status: 'final',
        total_selisih_qty,
        total_nilai_selisih,
        finalized_by: finalized_by_id,
        finalized_at: new Date().toISOString(),
      })
      .eq('id', opname_id)
      .select()
      .single();

    if (error) throw new Error('Gagal memfinalisasi stock opname');
    return opFinal;
  },

  async listOpname(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('opname')
      .select('*, pembuat:created_by(nama)')
      .eq('toko_id', toko_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar stock opname');
    return data;
  },

  async detailOpname(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('opname')
      .select('*, items:opname_item(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Opname tidak ditemukan');
    return data;
  },
};
