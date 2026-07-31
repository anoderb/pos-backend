import { supabaseAdmin } from '../../config/database.js';

export const aiService = {
  // Mengambil model aktif dan mapping kelas ke barcode
  async getActiveModel() {
    const { data: model, error: modelErr } = await supabaseAdmin
      .from('model_versi')
      .select('*')
      .eq('status', 'aktif')
      .maybeSingle();

    if (modelErr) throw new Error('Gagal mengambil model aktif: ' + modelErr.message);
    if (!model) return null;

    const { data: mappings, error: mapErr } = await supabaseAdmin
      .from('class_barcode_map')
      .select('barcode, class:class_id(slug)');

    if (mapErr) throw new Error('Gagal mengambil mapping barcode: ' + mapErr.message);

    return {
      model,
      mappings: mappings.map(m => ({
        barcode: m.barcode,
        class_slug: m.class?.slug
      }))
    };
  },

  // 1. Simpan Koreksi Kasir saat AI confidence rendah dengan Auto Upload Base64 Image
  async simpanKoreksi(toko_id, kasir_id, payload) {
    const {
      foto_url,
      foto_base64,
      prediksi_1_produk_id,
      prediksi_1_confidence,
      prediksi_2_produk_id,
      prediksi_2_confidence,
      prediksi_3_produk_id,
      prediksi_3_confidence,
      produk_dipilih_id,
    } = payload;

    let finalFotoUrl = foto_url || '';

    if (foto_base64) {
      try {
        const base64Data = foto_base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `koreksi-${toko_id}-${Date.now()}.jpg`;

        const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
          .from('dataset-foto-ai')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadErr) {
          console.error('Upload error detail:', uploadErr);
          finalFotoUrl = foto_base64.startsWith('data:image') ? foto_base64 : `data:image/jpeg;base64,${foto_base64}`;
        } else {
          const { data: urlData } = supabaseAdmin.storage
            .from('dataset-foto-ai')
            .getPublicUrl(fileName);
          finalFotoUrl = urlData?.publicUrl || (foto_base64.startsWith('data:image') ? foto_base64 : `data:image/jpeg;base64,${foto_base64}`);
        }
      } catch (uploadFail) {
        console.error('Gagal upload base64 koreksi:', uploadFail);
        finalFotoUrl = foto_base64.startsWith('data:image') ? foto_base64 : `data:image/jpeg;base64,${foto_base64}`;
      }
    } else if (!finalFotoUrl && foto_base64) {
      finalFotoUrl = foto_base64.startsWith('data:image') ? foto_base64 : `data:image/jpeg;base64,${foto_base64}`;
    }

    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .insert({
        toko_id,
        kasir_id,
        foto_url: finalFotoUrl,
        prediksi_1_produk_id,
        prediksi_1_confidence,
        prediksi_2_produk_id,
        prediksi_2_confidence,
        prediksi_3_produk_id,
        prediksi_3_confidence,
        produk_dipilih_id,
        status: 'menunggu',
      })
      .select()
      .single();

    if (error) throw new Error('Gagal menyimpan koreksi AI: ' + error.message);
    return data;
  },

  // 2. List Koreksi Menunggu Review
  async listKoreksi(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .select('*, kasir:kasir_id(nama), produk_dipilih:produk_dipilih_id(nama)')
      .eq('toko_id', toko_id)
      .eq('status', 'menunggu')
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar koreksi AI');
    return data;
  },

  // 3. Review Koreksi AI (Approve / Reject) oleh Owner
  async reviewKoreksi(toko_id, id, reviewed_by_id, { status }) {
    if (!['disetujui', 'ditolak'].includes(status)) {
      throw new Error('Status harus disetujui atau ditolak');
    }

    const { data, error } = await supabaseAdmin
      .from('koreksi_ai')
      .update({
        status,
        reviewed_by: reviewed_by_id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('toko_id', toko_id)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Gagal merespons koreksi AI');
    return data;
  },
};
