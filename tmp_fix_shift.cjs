require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  // Try ALTER via raw SQL
  const { data, error } = await sb.rpc('exec_sql', {
    query: `ALTER TABLE transaksi ALTER COLUMN shift_id DROP NOT NULL;`
  });
  console.log('rpc result:', { data, error });

  // Fallback: try pg client-style query
  if (error) {
    console.log('RPC failed, trying direct query...');
    const { data: d2, error: e2 } = await sb.from('_exec_sql').select('*').eq('q', `ALTER TABLE transaksi ALTER COLUMN shift_id DROP NOT NULL;`).single();
    console.log({ d2, e2 });
  }
}

fix().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
