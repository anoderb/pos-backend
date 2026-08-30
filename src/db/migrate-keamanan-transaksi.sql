-- ============================================================
-- Tokiva — Migration Keamanan Transaksi (Laporan Temuan)
-- Jalankan di Supabase Dashboard → SQL Editor (SAFETY: sekali jalan)
-- ============================================================

-- ── #3 Idempotency key — cegah double submit / replay transaksi ──
ALTER TABLE transaksi
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique per toko (idempotency harus unik dalam satu toko)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaksi_idempotency_key
  ON transaksi (toko_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── #2 Atomic stock decrement — anti overselling (TOCTOU) ──
-- Satu UPDATE atomik: kurangi stok HANYA kalau stok >= qty.
-- Kembalikan JSON: {"ok":true,"stok_sebelum":N,"stok_sesudah":N} atau {"ok":false}.
CREATE OR REPLACE FUNCTION decrement_stok_atomik(p_produk_id UUID, p_qty NUMERIC)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_stok_sebelum NUMERIC;
  v_stok_sesudah NUMERIC;
BEGIN
  UPDATE produk
  SET stok = stok - p_qty
  WHERE id = p_produk_id AND stok >= p_qty
  RETURNING stok + p_qty, stok INTO v_stok_sebelum, v_stok_sesudah;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'stok_sebelum', v_stok_sebelum, 'stok_sesudah', v_stok_sesudah);
END;
$$;

-- ── #2 void: atomic stock increment (kembalikan stok) ──
CREATE OR REPLACE FUNCTION increment_stok_atomik(p_produk_id UUID, p_qty NUMERIC)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_stok_sebelum NUMERIC;
  v_stok_sesudah NUMERIC;
BEGIN
  UPDATE produk
  SET stok = stok + p_qty
  WHERE id = p_produk_id
  RETURNING stok - p_qty, stok INTO v_stok_sebelum, v_stok_sesudah;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'stok_sebelum', v_stok_sebelum, 'stok_sesudah', v_stok_sesudah);
END;
$$;
