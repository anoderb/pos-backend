import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terisi di .env');
}

// Client Supabase Admin (Bypass RLS untuk operasi backend/database)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Client Supabase Auth (Anon key - untuk signInWithPassword)
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// PostgreSQL Direct Pool (Supabase IPv4 Pooler via DATABASE_URL env)
const { Pool } = pg;
const sslConfig = { rejectUnauthorized: process.env.NODE_ENV === 'production' };
export const dbPool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: sslConfig }
    : {
        host: process.env.DATABASE_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: Number(process.env.DATABASE_PORT) || 5432,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME || 'postgres',
        ssl: sslConfig,
      }
);
