-- Jalankan di Supabase Dashboard → SQL Editor (bukan via kode)
-- Menambah kolom pengaturan pembayaran & footer di tabel toko
ALTER TABLE toko
  ADD COLUMN IF NOT EXISTS catatan_footer TEXT,
  ADD COLUMN IF NOT EXISTS qris_mid TEXT,
  ADD COLUMN IF NOT EXISTS qris_merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_nama TEXT,
  ADD COLUMN IF NOT EXISTS bank_no_rekening TEXT,
  ADD COLUMN IF NOT EXISTS bank_atas_nama TEXT,
  ADD COLUMN IF NOT EXISTS qris_aktif BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_aktif BOOLEAN DEFAULT FALSE;
