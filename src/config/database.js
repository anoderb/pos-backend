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

// PostgreSQL Direct Pool (Supabase IPv4 Pooler)
const { Pool } = pg;
export const dbPool = new Pool({
  user: 'postgres.drxudbkupglnzbfmyjif',
  password: 'Bandulan112@',
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
