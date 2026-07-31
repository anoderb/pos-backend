-- Migrasi Data shift_kasir -> shift (INC-04)
-- Jalankan di Supabase SQL Editor

INSERT INTO shift (
  id, 
  toko_id, 
  kasir_id, 
  modal_awal, 
  waktu_buka, 
  waktu_tutup, 
  total_penjualan, 
  total_cash, 
  total_qris, 
  total_transfer, 
  total_void, 
  selisih, 
  kas_aktual, 
  catatan, 
  status, 
  created_at
)
SELECT 
  id, 
  toko_id, 
  kasir_id, 
  saldo_awal AS modal_awal, 
  waktu_buka, 
  waktu_tutup, 
  total_penjualan, 
  total_cash, 
  total_qris, 
  total_transfer, 
  total_void, 
  selisih, 
  kas_aktual, 
  catatan, 
  status, 
  created_at
FROM shift_kasir
ON CONFLICT (id) DO NOTHING;
