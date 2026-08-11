-- ============================================================================
-- SKEMA DATABASE TOKIVA POS (26 TABEL + RLS + TRIGGERS + INDEXES)
-- Target Engine: Supabase PostgreSQL
-- ============================================================================

-- Enable Extension UUID & Crypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function otomatis update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- 1. MASTER TABLE: TOKO
-- ============================================================================
CREATE TABLE IF NOT EXISTS toko (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,
    logo_url TEXT,
    alamat TEXT,
    no_telp VARCHAR(20),
    tema VARCHAR(10) DEFAULT 'light' CHECK (tema IN ('light', 'dark')),
    warna_utama VARCHAR(7) DEFAULT '#16A34A',
    qris_url TEXT,
    info_rekening TEXT,
    owner_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. MASTER TABLE: PENGGUNA (OWNER & KASIR)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pengguna (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'kasir')),
    toko_id UUID REFERENCES toko(id) ON DELETE CASCADE,
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- FK toko.owner_id -> pengguna.id
ALTER TABLE toko DROP CONSTRAINT IF EXISTS fk_toko_owner;
ALTER TABLE toko ADD CONSTRAINT fk_toko_owner FOREIGN KEY (owner_id) REFERENCES pengguna(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. MASTER TABLE: KATEGORI
-- ============================================================================
CREATE TABLE IF NOT EXISTS kategori (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    nama VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. MASTER TABLE: SATUAN
-- ============================================================================
CREATE TABLE IF NOT EXISTS satuan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    nama VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. MASTER TABLE: PRODUK
-- ============================================================================
CREATE TABLE IF NOT EXISTS produk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    kategori_id UUID REFERENCES kategori(id) ON DELETE SET NULL,
    class_produk_id UUID REFERENCES class_produk(id) ON DELETE SET NULL,
    class_status VARCHAR(20) DEFAULT 'unmapped' CHECK (class_status IN ('mapped', 'unmapped', 'pending_review')),
    nama VARCHAR(150) NOT NULL,
    barcode VARCHAR(50),
    foto_url TEXT,
    satuan_dasar_id UUID REFERENCES satuan(id) ON DELETE SET NULL,
    stok DECIMAL DEFAULT 0,
    stok_minimum DECIMAL DEFAULT 0,
    hpp DECIMAL DEFAULT 0,
    aktif_ai BOOLEAN DEFAULT FALSE,
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. PRODUK SATUAN JUAL
-- ============================================================================
CREATE TABLE IF NOT EXISTS produk_satuan_jual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    satuan_id UUID NOT NULL REFERENCES satuan(id) ON DELETE RESTRICT,
    konversi DECIMAL NOT NULL DEFAULT 1,
    harga_ecer DECIMAL NOT NULL DEFAULT 0,
    harga_grosir DECIMAL,
    min_qty_grosir DECIMAL,
    barcode VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 7. PRODUK SATUAN BELI
-- ============================================================================
CREATE TABLE IF NOT EXISTS produk_satuan_beli (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    satuan_id UUID NOT NULL REFERENCES satuan(id) ON DELETE RESTRICT,
    konversi DECIMAL NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 8. PRODUK FOTO AI
-- ============================================================================
CREATE TABLE IF NOT EXISTS produk_foto_ai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    foto_url TEXT NOT NULL,
    sudut VARCHAR(30),
    sumber VARCHAR(20) DEFAULT 'owner' CHECK (sumber IN ('owner', 'kasir', 'koreksi_ai')),
    status VARCHAR(20) DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 9. MASTER TABLE: SUPPLIER
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    nama VARCHAR(100) NOT NULL,
    no_telp VARCHAR(20),
    alamat TEXT,
    catatan TEXT,
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 10. PRODUK SUPPLIER
-- ============================================================================
CREATE TABLE IF NOT EXISTS produk_supplier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    harga_beli_terakhir DECIMAL DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 11. MASTER TABLE: PELANGGAN
-- ============================================================================
CREATE TABLE IF NOT EXISTS pelanggan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    nama VARCHAR(100) NOT NULL,
    no_hp VARCHAR(20),
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 12. SHIFT KASIR
-- ============================================================================
CREATE TABLE IF NOT EXISTS shift (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    kasir_id UUID NOT NULL REFERENCES pengguna(id) ON DELETE RESTRICT,
    waktu_buka TIMESTAMPTZ NOT NULL DEFAULT now(),
    waktu_tutup TIMESTAMPTZ,
    modal_awal DECIMAL NOT NULL DEFAULT 0,
    kas_aktual DECIMAL,
    total_penjualan DECIMAL DEFAULT 0,
    total_void DECIMAL DEFAULT 0,
    total_cash DECIMAL DEFAULT 0,
    total_qris DECIMAL DEFAULT 0,
    total_transfer DECIMAL DEFAULT 0,
    selisih DECIMAL,
    catatan TEXT,
    status VARCHAR(10) DEFAULT 'buka' CHECK (status IN ('buka', 'tutup'))
);

-- ============================================================================
-- 13. TRANSAKSI (HEADER)
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shift(id) ON DELETE RESTRICT,
    kasir_id UUID NOT NULL REFERENCES pengguna(id) ON DELETE RESTRICT,
    pelanggan_id UUID REFERENCES pelanggan(id) ON DELETE SET NULL,
    nomor_transaksi VARCHAR(30) UNIQUE NOT NULL,
    subtotal DECIMAL NOT NULL DEFAULT 0,
    diskon_total DECIMAL DEFAULT 0,
    total DECIMAL NOT NULL DEFAULT 0,
    metode_bayar VARCHAR(15) NOT NULL CHECK (metode_bayar IN ('cash', 'qris', 'transfer')),
    nominal_bayar DECIMAL NOT NULL DEFAULT 0,
    kembalian DECIMAL DEFAULT 0,
    status VARCHAR(10) DEFAULT 'selesai' CHECK (status IN ('selesai', 'void')),
    alasan_void TEXT,
    void_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    void_at TIMESTAMPTZ,
    is_offline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 14. TRANSAKSI ITEM (DETAIL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS transaksi_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaksi_id UUID NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    produk_satuan_jual_id UUID REFERENCES produk_satuan_jual(id) ON DELETE SET NULL,
    nama_produk VARCHAR(150) NOT NULL,
    satuan VARCHAR(30) NOT NULL,
    konversi DECIMAL NOT NULL DEFAULT 1,
    qty DECIMAL NOT NULL DEFAULT 1,
    harga_satuan DECIMAL NOT NULL DEFAULT 0,
    diskon DECIMAL DEFAULT 0,
    subtotal DECIMAL NOT NULL DEFAULT 0
);

-- ============================================================================
-- 15. NOTA MASUK (HEADER PEMBELIAN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS nota_masuk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    nomor_nota VARCHAR(30) UNIQUE NOT NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    total DECIMAL NOT NULL DEFAULT 0,
    total_dibayar DECIMAL DEFAULT 0,
    sisa_hutang DECIMAL DEFAULT 0,
    status_bayar VARCHAR(15) DEFAULT 'lunas' CHECK (status_bayar IN ('lunas', 'hutang', 'sebagian')),
    foto_nota_url TEXT,
    catatan TEXT,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 16. NOTA MASUK ITEM (DETAIL PEMBELIAN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS nota_masuk_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_masuk_id UUID NOT NULL REFERENCES nota_masuk(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    produk_satuan_beli_id UUID REFERENCES produk_satuan_beli(id) ON DELETE SET NULL,
    nama_produk VARCHAR(150) NOT NULL,
    satuan VARCHAR(30) NOT NULL,
    konversi DECIMAL NOT NULL DEFAULT 1,
    qty DECIMAL NOT NULL DEFAULT 1,
    qty_dasar DECIMAL NOT NULL DEFAULT 1,
    harga_beli DECIMAL NOT NULL DEFAULT 0,
    subtotal DECIMAL NOT NULL DEFAULT 0
);

-- ============================================================================
-- 17. PEMBAYARAN HUTANG
-- ============================================================================
CREATE TABLE IF NOT EXISTS pembayaran_hutang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_masuk_id UUID NOT NULL REFERENCES nota_masuk(id) ON DELETE CASCADE,
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    jumlah DECIMAL NOT NULL DEFAULT 0,
    metode VARCHAR(15) DEFAULT 'cash' CHECK (metode IN ('cash', 'transfer')),
    bukti_url TEXT,
    catatan TEXT,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 18. RETURN SUPPLIER (HEADER)
-- ============================================================================
CREATE TABLE IF NOT EXISTS return_supplier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    nota_masuk_id UUID REFERENCES nota_masuk(id) ON DELETE SET NULL,
    nomor_return VARCHAR(30) UNIQUE NOT NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    total DECIMAL NOT NULL DEFAULT 0,
    alasan TEXT,
    catatan TEXT,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 19. RETURN SUPPLIER ITEM (DETAIL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS return_supplier_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_supplier_id UUID NOT NULL REFERENCES return_supplier(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(150) NOT NULL,
    satuan VARCHAR(30) NOT NULL,
    qty DECIMAL NOT NULL DEFAULT 1,
    harga_beli DECIMAL NOT NULL DEFAULT 0,
    subtotal DECIMAL NOT NULL DEFAULT 0
);

-- ============================================================================
-- 20. KONSINYASI (HEADER)
-- ============================================================================
CREATE TABLE IF NOT EXISTS konsinyasi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    nomor_konsinyasi VARCHAR(30) UNIQUE NOT NULL,
    tanggal_terima DATE NOT NULL DEFAULT CURRENT_DATE,
    tanggal_jatuh_tempo DATE,
    total_nilai DECIMAL DEFAULT 0,
    total_terjual DECIMAL DEFAULT 0,
    total_dibayar DECIMAL DEFAULT 0,
    status VARCHAR(15) DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai')),
    catatan TEXT,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 21. KONSINYASI ITEM (DETAIL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS konsinyasi_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    konsinyasi_id UUID NOT NULL REFERENCES konsinyasi(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(150) NOT NULL,
    satuan VARCHAR(30) NOT NULL,
    qty_terima DECIMAL NOT NULL DEFAULT 0,
    qty_terjual DECIMAL DEFAULT 0,
    qty_kembali DECIMAL DEFAULT 0,
    harga_beli DECIMAL NOT NULL DEFAULT 0,
    harga_jual DECIMAL NOT NULL DEFAULT 0
);

-- ============================================================================
-- 22. STOCK ADJUSTMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_adjustment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    nomor_adjustment VARCHAR(30) UNIQUE NOT NULL,
    tipe VARCHAR(10) NOT NULL CHECK (tipe IN ('tambah', 'kurang')),
    qty DECIMAL NOT NULL DEFAULT 0,
    stok_sebelum DECIMAL NOT NULL DEFAULT 0,
    stok_sesudah DECIMAL NOT NULL DEFAULT 0,
    alasan TEXT NOT NULL,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 23. STOCK OPNAME (HEADER)
-- ============================================================================
CREATE TABLE IF NOT EXISTS opname (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    nomor_opname VARCHAR(30) UNIQUE NOT NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(10) DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final')),
    total_selisih_qty DECIMAL DEFAULT 0,
    total_nilai_selisih DECIMAL DEFAULT 0,
    catatan TEXT,
    created_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    finalized_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 24. STOCK OPNAME ITEM (DETAIL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS opname_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opname_id UUID NOT NULL REFERENCES opname(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(150) NOT NULL,
    satuan VARCHAR(30) NOT NULL,
    stok_sistem DECIMAL NOT NULL DEFAULT 0,
    stok_fisik DECIMAL,
    selisih DECIMAL,
    nilai_selisih DECIMAL,
    catatan TEXT
);

-- ============================================================================
-- 25. STOCK MOVEMENT (AUDIT LOG STOK)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_movement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    produk_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    jenis VARCHAR(25) NOT NULL CHECK (jenis IN (
        'penjualan', 'void_penjualan', 'pembelian', 'return_supplier',
        'konsinyasi_masuk', 'konsinyasi_kembali', 'adjustment', 'opname'
    )),
    referensi_id UUID,
    referensi_nomor VARCHAR(30),
    qty DECIMAL NOT NULL DEFAULT 0,
    stok_sebelum DECIMAL NOT NULL DEFAULT 0,
    stok_sesudah DECIMAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 26. KOREKSI AI
-- ============================================================================
CREATE TABLE IF NOT EXISTS koreksi_ai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    toko_id UUID NOT NULL REFERENCES toko(id) ON DELETE CASCADE,
    kasir_id UUID NOT NULL REFERENCES pengguna(id) ON DELETE RESTRICT,
    foto_url TEXT NOT NULL,
    prediksi_1_produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    prediksi_1_confidence DECIMAL(5,4),
    prediksi_2_produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    prediksi_2_confidence DECIMAL(5,4),
    prediksi_3_produk_id UUID REFERENCES produk(id) ON DELETE SET NULL,
    prediksi_3_confidence DECIMAL(5,4),
    produk_dipilih_id UUID NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
    status VARCHAR(15) DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
    reviewed_by UUID REFERENCES pengguna(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES UNTUK PERFORMA QUERY POS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pengguna_toko ON pengguna(toko_id);
CREATE INDEX IF NOT EXISTS idx_produk_toko ON produk(toko_id);
CREATE INDEX IF NOT EXISTS idx_produk_barcode ON produk(barcode);
CREATE INDEX IF NOT EXISTS idx_produk_satuan_jual_barcode ON produk_satuan_jual(barcode);
CREATE INDEX IF NOT EXISTS idx_transaksi_toko ON transaksi(toko_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_shift ON transaksi(shift_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_created ON transaksi(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movement_produk ON stock_movement(produk_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE pengguna ENABLE ROW LEVEL SECURITY;
ALTER TABLE toko ENABLE ROW LEVEL SECURITY;
ALTER TABLE produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE kategori ENABLE ROW LEVEL SECURITY;
ALTER TABLE satuan ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE nota_masuk ENABLE ROW LEVEL SECURITY;

-- Note: RLS dikontrol via token JWT yang menyertakan toko_id dan auth.uid()
