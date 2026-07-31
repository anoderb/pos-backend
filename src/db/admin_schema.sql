-- ============================================================================
-- SKEMA DATABASE ADMIN PANEL TOKIVA (7 TABEL INTERNAL SAAS & AI MANAGEMENT)
-- ============================================================================

-- Enable Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABEL PENGGUNA ADMIN (SUPER ADMIN, ANNOTATOR, MODEL MANAGER)
CREATE TABLE IF NOT EXISTS pengguna_admin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT,
    role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin', 'annotator', 'model_manager')),
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABEL CLASS PRODUK (LABEL MODEL AI DETEKSI BARANG)
CREATE TABLE IF NOT EXISTS class_produk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(150) NOT NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    barcode VARCHAR(50),
    deskripsi TEXT,
    thumbnail_url TEXT,
    jumlah_foto INTEGER DEFAULT 0,
    aktif BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABEL DATASET FOTO (REPOSITORI FOTO LATIHAN AI)
CREATE TABLE IF NOT EXISTS dataset_foto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES class_produk(id) ON DELETE CASCADE,
    foto_url TEXT NOT NULL,
    file_name VARCHAR(255),
    storage_path TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    sudut VARCHAR(30),
    sumber VARCHAR(30) DEFAULT 'admin' CHECK (sumber IN ('admin', 'user_produk', 'koreksi_kasir')),
    referensi_id UUID,
    toko_id UUID REFERENCES toko(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'disetujui' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
    lokasi VARCHAR(20) DEFAULT 'supabase' CHECK (lokasi IN ('supabase', 'huggingface')),
    hf_commit_id VARCHAR(100),
    reviewed_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    catatan_review TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABEL SYNC LOG (RIWAYAT SINKRONISASI HUGGINGFACE & KAGGLE)
CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipe VARCHAR(20) NOT NULL CHECK (tipe IN ('huggingface', 'kaggle')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('berhasil', 'gagal', 'berjalan')),
    jumlah_foto INTEGER DEFAULT 0,
    commit_id VARCHAR(100),
    pesan_error TEXT,
    triggered_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    triggered_at TIMESTAMPTZ DEFAULT now(),
    selesai_at TIMESTAMPTZ
);

-- 5. TABEL MODEL VERSI (REGISTRI MODEL AI & AKTIVASI DEPLOYMENT)
CREATE TABLE IF NOT EXISTS model_versi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    versi VARCHAR(30) UNIQUE NOT NULL,
    nama VARCHAR(100),
    deskripsi TEXT,
    akurasi DECIMAL(5,4),
    jumlah_class INTEGER DEFAULT 0,
    jumlah_data_training INTEGER DEFAULT 0,
    ukuran_mb DECIMAL(6,2),
    model_json_url TEXT NOT NULL,
    weights_url TEXT NOT NULL,
    confidence_threshold DECIMAL(5,4) DEFAULT 0.7500,
    status VARCHAR(20) DEFAULT 'nonaktif' CHECK (status IN ('aktif', 'nonaktif')),
    notes TEXT,
    uploaded_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    activated_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABEL TRAINING LOG (HISTORI DOKUMENTASI PROSES TRAINING)
CREATE TABLE IF NOT EXISTS training_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_versi_id UUID REFERENCES model_versi(id) ON DELETE CASCADE,
    tanggal_training DATE NOT NULL DEFAULT CURRENT_DATE,
    jumlah_data INTEGER DEFAULT 0,
    jumlah_class INTEGER DEFAULT 0,
    akurasi_training DECIMAL(5,4),
    akurasi_validasi DECIMAL(5,4),
    epoch INTEGER DEFAULT 0,
    catatan TEXT,
    kaggle_notebook_url TEXT,
    created_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TABEL ADMIN LOG (AUDIT TRAIL AKTIVITAS ADMINISTRATOR)
CREATE TABLE IF NOT EXISTS admin_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    aksi VARCHAR(100) NOT NULL,
    referensi_id UUID,
    referensi_tipe VARCHAR(50),
    detail JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. TABEL MAPPING BARCODE BARANG KE CLASS AI
CREATE TABLE IF NOT EXISTS class_barcode_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES class_produk(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL UNIQUE,
    nama_varian VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABEL CONFIG AUTO SYNC HUGGINGFACE
CREATE TABLE IF NOT EXISTS sync_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    threshold_count INTEGER DEFAULT 500,
    cron_enabled BOOLEAN DEFAULT FALSE,
    cron_expression VARCHAR(30) DEFAULT '0 2 * * *',
    updated_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES UNTUK INTEGRITAS & KINERJA QUERY ADMIN
CREATE INDEX IF NOT EXISTS idx_class_produk_slug ON class_produk(slug);
CREATE INDEX IF NOT EXISTS idx_dataset_foto_class ON dataset_foto(class_id);
CREATE INDEX IF NOT EXISTS idx_dataset_foto_status ON dataset_foto(status);
CREATE INDEX IF NOT EXISTS idx_model_versi_status ON model_versi(status);
CREATE INDEX IF NOT EXISTS idx_class_barcode_map ON class_barcode_map(barcode);

