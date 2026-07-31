import { supabaseAdmin } from '../../config/database.js';

function sanitizeInput(str) {
  if (!str) return str;
  return String(str)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export const produkService = {
  // List Produk dengan Filter
  async listProduk(toko_id, { kategori_id, stok_kritis, aktif_ai, search } = {}) {
    let query = supabaseAdmin
      .from('produk')
      .select('*, kategori:kategori_id(nama), satuan_dasar:satuan_dasar_id(nama), produk_satuan_jual(*)')
      .eq('toko_id', toko_id)
      .eq('aktif', true)
      .order('nama', { ascending: true });

    if (kategori_id) query = query.eq('kategori_id', kategori_id);
    if (aktif_ai !== undefined) query = query.eq('aktif_ai', aktif_ai === 'true' || aktif_ai === true);
    if (search) query = query.ilike('nama', `%${search}%`);

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil daftar produk: ' + error.message);

    if (stok_kritis === 'true' || stok_kritis === true) {
      return data.filter((p) => p.stok <= p.stok_minimum);
    }

    return data;
  },

  // Tambah Produk Baru
  async tambahProduk(toko_id, payload) {
    const { nama, barcode, foto_url, kategori_id, satuan_dasar_id, stok, stok_minimum, hpp, harga_jual_default } = payload;

    if (!nama || !nama.trim()) {
      throw new Error('Nama produk wajib diisi');
    }
    if (hpp === undefined || hpp === null || Number(hpp) <= 0) {
      throw new Error('Harga Modal Beli (HPP) wajib diisi dan harus lebih dari 0');
    }
    if (!harga_jual_default || Number(harga_jual_default) <= 0) {
      throw new Error('Harga jual wajib diisi dan harus lebih dari 0');
    }

    const namaBersih = sanitizeInput(nama.trim());
    let finalFotoUrl = foto_url || null;

    if (foto_url && foto_url.startsWith('data:image')) {
      try {
        const base64Data = foto_url.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `produk-${toko_id}-${Date.now()}.jpg`;

        const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
          .from('produk-foto')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage
            .from('produk-foto')
            .getPublicUrl(fileName);
          finalFotoUrl = urlData?.publicUrl || foto_url;
        }
      } catch (uploadFail) {
        console.error('Gagal upload base64 foto produk:', uploadFail);
      }
    }

    // Check barcode mapping with class_barcode_map
    let class_produk_id = null;
    let class_status = 'unmapped';

    if (barcode && String(barcode).trim()) {
      const { data: mapData } = await supabaseAdmin
        .from('class_barcode_map')
        .select('class_id')
        .eq('barcode', String(barcode).trim())
        .maybeSingle();

      if (mapData?.class_id) {
        class_produk_id = mapData.class_id;
        class_status = 'mapped';
      }
    }

    const { data: produkBaru, error: errProduk } = await supabaseAdmin
      .from('produk')
      .insert({
        toko_id,
        nama: namaBersih,
        barcode: barcode ? String(barcode).trim() : null,
        foto_url: finalFotoUrl,
        kategori_id,
        satuan_dasar_id,
        class_produk_id,
        class_status,
        stok: Number(stok) || 0,
        stok_minimum: Number(stok_minimum) || 0,
        hpp: Number(hpp) || 0,
        aktif: true,
      })
      .select()
      .single();

    if (errProduk) throw new Error('Gagal menambah produk: ' + errProduk.message);

    if (satuan_dasar_id && harga_jual_default) {
      await supabaseAdmin.from('produk_satuan_jual').insert({
        produk_id: produkBaru.id,
        satuan_id: satuan_dasar_id,
        konversi: 1,
        harga_ecer: Number(harga_jual_default),
        barcode: barcode ? String(barcode).trim() : null,
        is_default: true,
      });
    }

    return produkBaru;
  },

  // Detail Produk
  async getProdukById(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('produk')
      .select(`
        *,
        kategori:kategori_id(nama),
        satuan_dasar:satuan_dasar_id(nama),
        satuan_jual:produk_satuan_jual(*, satuan:satuan_id(nama)),
        satuan_beli:produk_satuan_beli(*, satuan:satuan_id(nama)),
        supplier:produk_supplier(*, supplier:supplier_id(nama))
      `)
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Produk tidak ditemukan');
    return data;
  },

  // Edit Produk (SEC-22 Whitelist Approach)
  async updateProduk(toko_id, id, payload) {
    const ALLOWED_FIELDS = [
      'nama', 'barcode', 'foto_url', 'kategori_id', 'satuan_dasar_id',
      'stok', 'stok_minimum', 'hpp', 'aktif_ai'
    ];

    const updatePayload = {};
    for (const field of ALLOWED_FIELDS) {
      if (payload[field] !== undefined) {
        updatePayload[field] = payload[field];
      }
    }

    if (updatePayload.nama) {
      updatePayload.nama = sanitizeInput(updatePayload.nama.trim());
    }

    // Handle base64 image upload to produk-foto bucket
    if (payload.foto_url && payload.foto_url.startsWith('data:image')) {
      try {
        const base64Data = payload.foto_url.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `produk-${toko_id}-${Date.now()}.jpg`;

        const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
          .from('produk-foto')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage
            .from('produk-foto')
            .getPublicUrl(fileName);
          updatePayload.foto_url = urlData?.publicUrl || payload.foto_url;
        }
      } catch (uploadFail) {
        console.error('Gagal upload base64 foto produk:', uploadFail);
      }
    }

    if (updatePayload.barcode !== undefined) {
      if (updatePayload.barcode && String(updatePayload.barcode).trim()) {
        const { data: mapData } = await supabaseAdmin
          .from('class_barcode_map')
          .select('class_id')
          .eq('barcode', String(updatePayload.barcode).trim())
          .maybeSingle();

        if (mapData?.class_id) {
          updatePayload.class_produk_id = mapData.class_id;
          updatePayload.class_status = 'mapped';
        } else {
          updatePayload.class_produk_id = null;
          updatePayload.class_status = 'unmapped';
        }
      } else {
        updatePayload.class_produk_id = null;
        updatePayload.class_status = 'unmapped';
      }
    }

    const { data, error } = await supabaseAdmin
      .from('produk')
      .update(updatePayload)
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal mengedit produk: ' + error.message);

    // Update default selling price if provided in payload
    if (payload.harga_jual_default || payload.harga) {
      const newPrice = payload.harga_jual_default || payload.harga;
      await supabaseAdmin
        .from('produk_satuan_jual')
        .update({ harga_ecer: newPrice, barcode: payload.barcode || undefined })
        .eq('produk_id', id)
        .eq('is_default', true);
    }

    return data;
  },

  // Nonaktifkan Produk
  async deleteProduk(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('produk')
      .update({ aktif: false })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal menonaktifkan produk');
    return data;
  },

  // Cari Produk By Barcode
  async getProdukByBarcode(toko_id, kode) {
    const { data } = await supabaseAdmin
      .from('produk')
      .select('*, produk_satuan_jual(*)')
      .eq('toko_id', toko_id)
      .eq('barcode', kode)
      .maybeSingle();

    if (data) return data;

    const { data: sjData } = await supabaseAdmin
      .from('produk_satuan_jual')
      .select('*, produk:produk_id(*)')
      .eq('barcode', kode)
      .maybeSingle();

    if (sjData) return sjData.produk;

    throw new Error('Produk dengan barcode tersebut tidak ditemukan');
  },

  // Histori Stok Movement Produk
  async getStockMovement(toko_id, produk_id) {
    const { data, error } = await supabaseAdmin
      .from('stock_movement')
      .select('*')
      .eq('toko_id', toko_id)
      .eq('produk_id', produk_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil histori stok');
    return data;
  },

  // --- SUB-MODULE SATUAN JUAL ---
  async listSatuanJual(produk_id) {
    const { data, error } = await supabaseAdmin
      .from('produk_satuan_jual')
      .select('*, satuan:satuan_id(nama)')
      .eq('produk_id', produk_id);
    if (error) throw new Error('Gagal mengambil satuan jual');
    return data;
  },

  async tambahSatuanJual(produk_id, payload) {
    const clean = { ...payload };
    delete clean.id;
    delete clean.produk_id;
    delete clean.created_at;

    const { data, error } = await supabaseAdmin
      .from('produk_satuan_jual')
      .insert({ produk_id, ...clean })
      .select()
      .single();
    if (error) throw new Error('Gagal menambah satuan jual: ' + error.message);
    return data;
  },

  async updateSatuanJual(produk_id, sid, payload) {
    const clean = { ...payload };
    delete clean.id;
    delete clean.produk_id;
    delete clean.created_at;

    const { data, error } = await supabaseAdmin
      .from('produk_satuan_jual')
      .update(clean)
      .eq('produk_id', produk_id)
      .eq('id', sid)
      .select()
      .single();
    if (error) throw new Error('Gagal memperbarui satuan jual');
    return data;
  },

  async hapusSatuanJual(produk_id, sid) {
    const { data, error } = await supabaseAdmin
      .from('produk_satuan_jual')
      .delete()
      .eq('produk_id', produk_id)
      .eq('id', sid)
      .select()
      .single();
    if (error) throw new Error('Gagal menghapus satuan jual');
    return data;
  },

  // --- SUB-MODULE SATUAN BELI ---
  async listSatuanBeli(produk_id) {
    const { data, error } = await supabaseAdmin
      .from('produk_satuan_beli')
      .select('*, satuan:satuan_id(nama)')
      .eq('produk_id', produk_id);
    if (error) throw new Error('Gagal mengambil satuan beli');
    return data;
  },

  async tambahSatuanBeli(produk_id, payload) {
    const clean = { ...payload };
    delete clean.id;
    delete clean.produk_id;
    delete clean.created_at;

    const { data, error } = await supabaseAdmin
      .from('produk_satuan_beli')
      .insert({ produk_id, ...clean })
      .select()
      .single();
    if (error) throw new Error('Gagal menambah satuan beli: ' + error.message);
    return data;
  },

  async updateSatuanBeli(produk_id, sid, payload) {
    const { data, error } = await supabaseAdmin
      .from('produk_satuan_beli')
      .update(payload)
      .eq('produk_id', produk_id)
      .eq('id', sid)
      .select()
      .single();
    if (error) throw new Error('Gagal memperbarui satuan beli');
    return data;
  },

  async hapusSatuanBeli(produk_id, sid) {
    const { data, error } = await supabaseAdmin
      .from('produk_satuan_beli')
      .delete()
      .eq('produk_id', produk_id)
      .eq('id', sid)
      .select()
      .single();
    if (error) throw new Error('Gagal menghapus satuan beli');
    return data;
  },
};
