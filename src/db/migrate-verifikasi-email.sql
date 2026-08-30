-- ============================================================
-- Tokiva — Migrasi Verifikasi Email (Model B: manual confirm)
-- Jalankan di Supabase Dashboard → SQL Editor
-- Tambah kolom token verifikasi di tabel pengguna
-- ============================================================

ALTER TABLE pengguna
  ADD COLUMN IF NOT EXISTS verifikasi_token TEXT,
  ADD COLUMN IF NOT EXISTS verifikasi_expires_at TIMESTAMPTZ;

-- (opsional) index biar lookup token cepet
CREATE INDEX IF NOT EXISTS idx_pengguna_verifikasi_token ON pengguna (verifikasi_token);
