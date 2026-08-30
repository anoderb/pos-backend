// Serializer terpusat: whitelist field response API.
// Mencegah kebocoran data sensitif (password_hash, token, metadata internal) ke client.

// ---------- USER / PENGGUNA ----------
export function serializeUser(p = {}) {
  return {
    id: p.id,
    nama: p.nama,
    email: p.email,
    role: p.role,
    toko_id: p.toko_id,
    aktif: p.aktif,
  };
}

// ---------- TOKO ----------
// Versi aman untuk owner UI (pengaturan toko, dashboard)
export function serializeToko(t = {}) {
  return {
    id: t.id,
    nama: t.nama,
    tema: t.tema,
    alamat: t.alamat,
    no_telp: t.no_telp,
    logo_url: t.logo_url,
    warna_utama: t.warna_utama,
    qris_aktif: t.qris_aktif,
    qris_url: t.qris_url,
    qris_mid: t.qris_mid,
    qris_merchant_name: t.qris_merchant_name,
    qris_status: t.qris_status || 'empty',
    qris_info: t.qris_info || null,
    tunai_aktif: t.tunai_aktif !== false,
    transfer_aktif: t.transfer_aktif,
    bank_nama: t.bank_nama,
    bank_no_rekening: t.bank_no_rekening,
    bank_atas_nama: t.bank_atas_nama,
    info_rekening: t.info_rekening,
    catatan_footer: t.catatan_footer,
  };
}

// ---------- PRODUK ----------
// Versi aman untuk katalog/POS. HPP disembunyikan kecuali flag eksplisit.
export function serializeProduk(p = {}, { includeHpp = false } = {}) {
  const base = {
    id: p.id,
    nama: p.nama,
    barcode: p.barcode,
    kategori_id: p.kategori_id,
    stok: p.stok,
    stok_minimum: p.stok_minimum,
    foto_url: p.foto_url,
    aktif: p.aktif,
    aktif_ai: p.aktif_ai,
    harga_jual_default: p.harga_jual_default,
    harga_ecer: p.harga_ecer,
    harga_grosir: p.harga_grosir,
    min_qty_grosir: p.min_qty_grosir,
    kategori: p.kategori ?? null,
    satuan_dasar: p.satuan_dasar ?? null,
    satuan_jual: Array.isArray(p.satuan_jual) ? p.satuan_jual : [],
  };
  if (includeHpp) base.hpp = p.hpp;
  return base;
}

// ---------- ADMIN ----------
export function serializeAdmin(a = {}) {
  return {
    id: a.id,
    nama: a.nama,
    email: a.email,
    role: a.role,
    aktif: a.aktif,
  };
}

// ---------- SESSION (login response) ----------
// Token TIDAK PERNAH disertakan di JSON body. Hanya lewat HttpOnly cookie.
export function serializeSession(s = {}) {
  if (!s) return null;
  return {
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: s.token_type,
  };
}
