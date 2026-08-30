-- ============================================================
-- Tokiva — QRIS Dinamis + Approval Manual + Hapus Metode Transfer
-- Jalankan di Supabase Dashboard → SQL Editor (SAFETY: sekali jalan)
-- ============================================================

-- ── Tabel toko: simpan QRIS asli hasil validasi ──
ALTER TABLE toko
  ADD COLUMN IF NOT EXISTS qris_string TEXT,
  ADD COLUMN IF NOT EXISTS qris_status TEXT,
  ADD COLUMN IF NOT EXISTS qris_info JSONB;

-- ── Tabel transaksi: lifecycle QRIS (pending/approved/cancelled) ──
ALTER TABLE transaksi
  ADD COLUMN IF NOT EXISTS status_qris TEXT,
  ADD COLUMN IF NOT EXISTS qris_payload TEXT,
  ADD COLUMN IF NOT EXISTS qris_alasan TEXT,
  ADD COLUMN IF NOT EXISTS qris_action_by UUID,
  ADD COLUMN IF NOT EXISTS qris_action_at TIMESTAMPTZ;

-- ── Hapus metode transfer dari constraint ──
-- (attualmente 'transfer' dihapus; cash & qris tersisa + legacy 'tunai' FK)
DO $$
BEGIN
  -- Drop constraint lama dulu kalau ada (nama bisa beda antar skema)
  ALTER TABLE transaksi DROP CONSTRAINT IF EXISTS transaksi_metode_bayar_check;
  ALTER TABLE transaksi ADD CONSTRAINT transaksi_metode_bayar_check
    CHECK (metode_bayar IN ('cash', 'qris', 'tunai'));
EXCEPTION
  WHEN others THEN null;
END $$;

-- ── Tambah status 'pending' ke CHECK constraint transaksi.status ──
-- (untuk transaksi QRIS yang belum di-approve)
ALTER TABLE transaksi DROP CONSTRAINT IF EXISTS transaksi_status_check;
ALTER TABLE transaksi ADD CONSTRAINT transaksi_status_check
  CHECK (status IN ('selesai', 'void', 'pending'));

