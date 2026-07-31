import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;

async function findWorkingPool() {
  const ref = 'drxudbkupglnzbfmyjif';
  const pass = process.env.DATABASE_PASSWORD || 'Bandulan112@';

  const hosts = [
    'aws-0-ap-southeast-1.pooler.supabase.com',
    'aws-0-ap-northeast-2.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-0-eu-central-1.pooler.supabase.com',
    `db.${ref}.supabase.co`,
  ];

  const ports = [6543, 5432];
  const users = [`postgres.${ref}`, 'postgres'];

  for (const host of hosts) {
    for (const port of ports) {
      for (const user of users) {
        try {
          console.log(`Testing ${host}:${port} as ${user}...`);
          const pool = new Pool({
            host, port, user, password: pass, database: 'postgres',
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 3000,
          });
          const client = await pool.connect();
          console.log(`🎯 CONNECTED SUCCESSFULLY to ${host}:${port} as ${user}!`);

          await client.query(`
            CREATE TABLE IF NOT EXISTS class_barcode_map (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                class_id UUID NOT NULL REFERENCES class_produk(id) ON DELETE CASCADE,
                barcode VARCHAR(50) NOT NULL UNIQUE,
                nama_varian VARCHAR(150),
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_class_barcode_map ON class_barcode_map(barcode);

            CREATE TABLE IF NOT EXISTS sync_config (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                auto_sync_enabled BOOLEAN DEFAULT FALSE,
                threshold_count INTEGER DEFAULT 500,
                cron_enabled BOOLEAN DEFAULT FALSE,
                cron_expression VARCHAR(30) DEFAULT '0 2 * * *',
                updated_by UUID REFERENCES pengguna_admin(id) ON DELETE SET NULL,
                updated_at TIMESTAMPTZ DEFAULT now()
            );

            INSERT INTO sync_config (auto_sync_enabled, threshold_count, cron_enabled, cron_expression)
            VALUES (false, 500, false, '0 2 * * *')
            ON CONFLICT DO NOTHING;

            ALTER TABLE produk ADD COLUMN IF NOT EXISTS class_produk_id UUID REFERENCES class_produk(id) ON DELETE SET NULL;
            ALTER TABLE produk ADD COLUMN IF NOT EXISTS class_status VARCHAR(20) DEFAULT 'unmapped';

            INSERT INTO class_barcode_map (class_id, barcode, nama_varian)
            SELECT id, barcode, nama FROM class_produk
            WHERE barcode IS NOT NULL AND barcode != ''
            ON CONFLICT (barcode) DO NOTHING;

            UPDATE produk p
            SET class_produk_id = cbm.class_id,
                class_status = 'mapped'
            FROM class_barcode_map cbm
            WHERE p.barcode = cbm.barcode
              AND (p.class_produk_id IS NULL OR p.class_status = 'unmapped');
          `);

          console.log('🎉 ALL TABLES AND COLUMNS CREATED PERFECTLY!');
          client.release();
          process.exit(0);
        } catch (e) {
          // ignore failure and continue loop
        }
      }
    }
  }

  console.error('All hosts failed.');
  process.exit(1);
}

findWorkingPool();
