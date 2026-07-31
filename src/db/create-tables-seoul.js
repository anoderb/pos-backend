import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createAdminTablesOptions() {
  console.log('⚡ Connecting to Supabase PostgreSQL (Seoul ap-northeast-2 with reference option)...');

  const pool = new pg.Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, options: '-c reference=drxudbkupglnzbfmyjif', ssl: { rejectUnauthorized: false } }
      : {
          user: process.env.DATABASE_USER || 'postgres',
          password: process.env.DATABASE_PASSWORD,
          host: 'aws-0-ap-northeast-2.pooler.supabase.com',
          port: 5432,
          database: 'postgres',
          options: '-c reference=drxudbkupglnzbfmyjif',
          ssl: { rejectUnauthorized: false }
        }
  );

  try {
    const client = await pool.connect();
    console.log('✅ Connected to Supabase PostgreSQL!');

    const sqlPath = path.join(__dirname, 'admin_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sqlContent);
    console.log('🎉🎉🎉 7 TABEL ADMIN BERHASIL DIBUAT DI SUPABASE DATABASE!');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal membuat tabel admin:', err.message);
    await pool.end();
    process.exit(1);
  }
}

createAdminTablesOptions();
