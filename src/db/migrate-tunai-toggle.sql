-- ============================================================
-- Tokiva — Toggle metode pembayaran: Tunai + QRIS
-- Jalankan di Supabase Dashboard → SQL Editor (SAFETY: sekali jalan)
-- ============================================================

-- Toggle Tunai: default aktif (selalu bisa dipakai)
ALTER TABLE toko
  ADD COLUMN IF NOT EXISTS tunai_aktif BOOLEAN DEFAULT true;
