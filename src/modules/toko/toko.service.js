import { supabaseAdmin } from '../../config/database.js';
import { sanitizeOptionalText } from '../../utils/sanitize.js';

function isValidUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const blocked = ['127.0.0.1', 'localhost', '0.0.0.0', '10.', '172.16.', '192.168.', '169.254.'];
    if (blocked.some(p => parsed.hostname.startsWith(p))) return false;
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    const configuredHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
    return Boolean(configuredHost && (parsed.hostname === configuredHost || parsed.hostname.endsWith('.supabase.co')));
  } catch { return false; }
}

const MEDIA_BUCKETS = Object.freeze({
  logo_url: 'toko-logos',
  qris_url: 'toko-qris',
});

function getMediaPath(url, bucket) {
  if (typeof url !== 'string' || !url.includes('/storage/v1/object/')) return null;
  try {
    const afterMarker = url.split('/storage/v1/object/')[1].split('?')[0];
    const parts = afterMarker.split('/');
    if (parts[0] === 'sign' || parts[0] === 'public') parts.shift();
    if (parts.shift() !== bucket) return null;
    return parts.map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return null;
  }
}

async function attachSignedMedia(data, field) {
  const bucket = MEDIA_BUCKETS[field];
  const filePath = getMediaPath(data[field], bucket);
  if (!bucket || !filePath) return;
  const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(filePath, 3600);
  if (signed?.signedUrl) data[field] = signed.signedUrl;
}

export const tokoService = {
  // Ambil detail toko sendiri
  async getToko(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('toko')
      .select('*')
      .eq('id', toko_id)
      .maybeSingle();

    if (error) throw new Error('Data toko tidak ditemukan');
    if (!data) throw new Error('Data toko tidak ditemukan');

    // Kedua bucket private: expose signed URL sesuai jenis media.
    await Promise.all([
      attachSignedMedia(data, 'logo_url'),
      attachSignedMedia(data, 'qris_url'),
    ]);
    return data;
  },

  // Update setting toko (Nama, Alamat, No Telp, Tema, Warna, Info Rekening)
  async updateToko(toko_id, payload, owner_id) {
    const clean = { ...payload };
    delete clean.id;
    delete clean.toko_id;
    delete clean.created_at;
    delete clean.updated_at;
    delete clean.owner_id;

    // Verify ownership: toko_id belongs to owner + baca state pembayaran utk validasi silang
    const { data: existing } = await supabaseAdmin
      .from('toko')
      .select('*')
      .eq('id', toko_id)
      .maybeSingle();

    if (!existing) throw new Error('Data toko tidak ditemukan');
    if (existing.owner_id !== owner_id) {
      throw new Error('Anda tidak memiliki akses untuk mengubah data toko ini');
    }

    const updateData = {};
    if (clean.nama !== undefined) updateData.nama = sanitizeOptionalText(clean.nama, { max: 200 });
    if (clean.alamat !== undefined) updateData.alamat = sanitizeOptionalText(clean.alamat, { max: 500 });
    if (clean.no_telp !== undefined) updateData.no_telp = sanitizeOptionalText(clean.no_telp, { max: 30 });
    if (clean.tema !== undefined) updateData.tema = sanitizeOptionalText(clean.tema, { max: 50 });
    if (clean.warna_utama !== undefined) updateData.warna_utama = sanitizeOptionalText(clean.warna_utama, { max: 30 });
    if (clean.info_rekening !== undefined) updateData.info_rekening = sanitizeOptionalText(clean.info_rekening, { max: 500 });
    if (clean.catatan_footer !== undefined) updateData.catatan_footer = sanitizeOptionalText(clean.catatan_footer, { max: 500 });
    if (clean.qris_mid !== undefined) updateData.qris_mid = sanitizeOptionalText(clean.qris_mid, { max: 100 });
    if (clean.qris_merchant_name !== undefined) updateData.qris_merchant_name = sanitizeOptionalText(clean.qris_merchant_name, { max: 200 });
    if (clean.bank_nama !== undefined) updateData.bank_nama = sanitizeOptionalText(clean.bank_nama, { max: 100 });
    if (clean.bank_no_rekening !== undefined) updateData.bank_no_rekening = sanitizeOptionalText(clean.bank_no_rekening, { max: 50 });
    if (clean.bank_atas_nama !== undefined) updateData.bank_atas_nama = sanitizeOptionalText(clean.bank_atas_nama, { max: 200 });
    if (clean.qris_aktif !== undefined) updateData.qris_aktif = clean.qris_aktif === true || clean.qris_aktif === 'true';
    if (clean.transfer_aktif !== undefined) updateData.transfer_aktif = clean.transfer_aktif === true || clean.transfer_aktif === 'true';
    if (clean.tunai_aktif !== undefined) updateData.tunai_aktif = clean.tunai_aktif === true || clean.tunai_aktif === 'true';

    // ── Validasi silang metode pembayaran (#payment-gate) ──
    // Ambil state terkini utk validasi (combine yg di-update + yg ada di DB)
    const qrisAktifBaru = updateData.qris_aktif !== undefined ? updateData.qris_aktif : !!existing.qris_aktif;
    const tunaiAktifBaru = updateData.tunai_aktif !== undefined ? updateData.tunai_aktif : !!existing.tunai_aktif;
    const qrisValid = (existing.qris_status || '') === 'valid' && !!existing.qris_string;

    // 1. QRIS tidak bisa diaktifkan kalau belum ada QRIS valid
    if (qrisAktifBaru && !qrisValid) {
      throw new Error('QRIS tidak bisa diaktifkan karena belum ada QRIS yang valid. Silakan atur QRIS di Pengaturan dahulu.');
    }

    // 2. Minimal satu metode pembayaran harus aktif (jangan sampai semuanya off)
    const metodeAktifCount = (tunaiAktifBaru ? 1 : 0) + (qrisAktifBaru ? 1 : 0);
    if (metodeAktifCount === 0) {
      throw new Error('Minimal satu metode pembayaran harus aktif (Tunai atau QRIS).');
    }

    const { data, error } = await supabaseAdmin
      .from('toko')
      .update(updateData)
      .eq('id', toko_id)
      .select()
      .maybeSingle();

    if (error) throw new Error('Gagal memperbarui data toko: ' + error.message);
    if (!data) throw new Error('Data toko tidak ditemukan');
    return data;
  },

  // Update URL/media toko. Data URL diunggah ke Supabase Storage.
  async updateMediaToko(toko_id, field, media_url) {
    const bucket = MEDIA_BUCKETS[field];
    if (!bucket) throw new Error('Jenis foto toko tidak dikenal');

    let finalUrl = media_url;
    if (typeof media_url === 'string' && media_url.startsWith('data:image/')) {
      const match = media_url.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
      if (!match) throw new Error('Format foto tidak valid');
      const [, contentType, encoded] = match;
      const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
      const fileName = `toko-${toko_id}/${field}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(fileName, Buffer.from(encoded, 'base64'), { contentType, upsert: true });
      if (uploadError) throw new Error('Gagal upload foto toko: ' + uploadError.message);
      const { data: signedData, error: signedError } = await supabaseAdmin.storage
        .from(bucket).createSignedUrl(fileName, 60 * 60 * 24 * 365);
      if (signedError) throw new Error('Gagal membuat URL foto toko: ' + signedError.message);
      finalUrl = signedData?.signedUrl;
    }

    // #7 Validasi URL eksternal: wajib https + host Supabase terpercaya.
    // Menolak `file:`, `data:`, IP internal, host asing (SSRF/phishing).
    if (!isValidUrl(finalUrl)) {
      throw new Error('URL tidak valid. Hanya URL https dari Supabase Storage/domain terpercaya yang diperbolehkan');
    }

    if (typeof finalUrl !== 'string' || !finalUrl.trim()) {
      throw new Error('URL foto tidak berhasil dibuat dari Storage');
    }
    const { data, error } = await supabaseAdmin
      .from('toko').update({ [field]: finalUrl }).eq('id', toko_id).select().maybeSingle();
    if (error) throw new Error('Gagal memperbarui foto toko: ' + error.message);
    if (!data) throw new Error('Data toko tidak ditemukan');
    return data;
  },
};
