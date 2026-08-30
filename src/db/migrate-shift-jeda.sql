-- Migrasi: format ulang status shift agar mendukung 'jeda'
-- status: buka | jeda | tutup
ALTER TABLE shift DROP CONSTRAINT IF EXISTS shift_status_check;
ALTER TABLE shift ADD CONSTRAINT shift_status_check CHECK (status IN ('buka', 'jeda', 'tutup'));
ALTER TABLE shift ADD COLUMN IF NOT EXISTS waktu_jeda TIMESTAMPTZ;
