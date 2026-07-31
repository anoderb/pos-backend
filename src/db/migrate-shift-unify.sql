-- Migrasi Data shift_kasir -> shift (INC-04)
-- Jalankan di Supabase SQL Editor

DO $$ 
BEGIN 
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shift_kasir') THEN
    INSERT INTO shift (
      id, toko_id, kasir_id, modal_awal, waktu_buka, waktu_tutup, 
      total_penjualan, total_cash, total_qris, total_transfer, 
      total_void, selisih, kas_aktual, catatan, status
    )
    SELECT 
      id, toko_id, kasir_id, saldo_awal AS modal_awal, waktu_buka, waktu_tutup, 
      total_penjualan, total_cash, total_qris, total_transfer, 
      total_void, selisih, kas_aktual, catatan, status
    FROM shift_kasir
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'Data dari shift_kasir berhasil dipindahkan ke shift.';
  ELSE
    RAISE NOTICE 'Tabel shift_kasir tidak ditemukan. Tabel shift sudah digunakan sebagai tabel utama (Tidak perlu migrasi).';
  END IF;
END $$;
