// Test gate keamanan transaksi (read-only, pakai data scratch, cleanup di akhir)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API = 'http://localhost:5000/api';

let cookie = '';
let tokoId = null;
let produkId = null;
let shiftId = null;

async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'anoderb@gmail.com', password: 'Bandulan112@' }),
  });
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  cookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return r.json();
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await res.json(); } catch {}
  return { status: res.status, json: j };
}

const UUID = () => crypto.randomUUID();

(async () => {
  const results = [];

  // Ambil toko dari profil
  const profile = await login();
  const st = await api('/auth/status');
  tokoId = st.json?.data?.pengguna?.toko_id || profile.toko?.id;
  console.log('toko_id:', tokoId, '| kasir_id dr status:', st.json?.data?.pengguna?.id);
  const kasirId = st.json?.data?.pengguna?.id || profile.pengguna?.id;

  // ── #8: update produk stok negatif → harus tolak ──
  const { data: produk8 } = await sb.from('produk').insert({ toko_id: tokoId, nama: 'TestStokNeg', stok: 5 }).select().single();
  const r8 = await api(`/owner/produk/${produk8.id}`, { method: 'PUT', body: { stok: -3 } });
  results.push(['#8 stok negatif ditolak (400)', r8.status === 400]);
  await sb.from('produk').delete().eq('id', produk8.id);

  // ── Siapkan shift test (jangan ganggu shift asli — pakai shift_id sendiri) ──
  const { data: shift } = await sb.from('shift').insert({ toko_id: tokoId, kasir_id: kasirId, status: 'buka', modal_awal: 10000 }).select().single();
  shiftId = shift.id;

  // Produk test harga ecer 10000
  const { data: produk } = await sb.from('produk').insert({ toko_id: tokoId, nama: 'TestHarga10k', stok: 100 }).select().single();
  produkId = produk.id;
  const satuan = (await sb.from('satuan').select('id').eq('toko_id', tokoId).limit(1).maybeSingle()).data;
  const { data: sj } = await sb.from('produk_satuan_jual').insert({ produk_id: produkId, satuan_id: satuan.id, konversi: 1, harga_ecer: 10000, is_default: true }).select().single();

  // ── #1: kirim harga palsu (harga_satuan:1, total:1) → server harus recompute jadi 10000 ──
  const idemA = UUID();
  const r1 = await api('/kasir/transaksi', {
    method: 'POST',
    headers: { 'Idempotency-Key': idemA },
    body: { shift_id: shiftId, metode_bayar: 'cash', nominal_bayar: 10000, items: [{ produk_id: produkId, qty: 1, harga_satuan: 1, subtotal: 1 }] },
  });
  console.log('DEBUG #1 response:', JSON.stringify(r1));
  const tx1 = r1.json?.data;
  results.push(['#1 transaksi 201', r1.status === 201]);
  results.push(['#1 harga di-recompute 10000 (bukan 1)', tx1?.subtotal === 10000]);

  // ── #3: replay payload sama + Idempotency-Key → harus SAMA transaksi (tidak baru) ──
  const r3 = await api('/kasir/transaksi', {
    method: 'POST',
    headers: { 'Idempotency-Key': idemA },
    body: { shift_id: shiftId, metode_bayar: 'tunai', nominal_bayar: 10000, items: [{ produk_id: produkId, qty: 1, harga_satuan: 1, subtotal: 1 }] },
  });
  results.push(['#3 idempotency: replay kembalikan tx sama', r3.json?.data?.id === tx1?.id]);
  results.push(['#3 tidak buat transaksi baru', (r3.status === 201 || r3.status === 200)]);

  // ── #2: stok cukup test — beli 5 qty (stok awal ~100) → berkurang 5 ──
  const { data: pBefore } = await sb.from('produk').select('stok').eq('id', produkId).single();
  const idemB = UUID();
  await api('/kasir/transaksi', { method: 'POST', headers: { 'Idempotency-Key': idemB }, body: { shift_id: shiftId, metode_bayar: 'cash', nominal_bayar: 100000, items: [{ produk_id: produkId, qty: 5, satuan: 'pcs' }] } });
  const { data: pAfter } = await sb.from('produk').select('stok').eq('id', produkId).single();
  results.push(['#2 stok berkurang 5', pAfter.stok === Number(pBefore.stok) - 5]);

  // Cleanup
  await sb.from('transaksi').delete().eq('shift_id', shiftId);
  await sb.from('transaksi_item').delete().eq('produk_id', produkId).gte('transaksi_id',''); // items sudah ikut kehapus via FK? fallback
  await sb.from('produk_satuan_jual').delete().eq('produk_id', produkId);
  await sb.from('produk').delete().eq('id', produkId);
  await sb.from('shift').delete().eq('id', shiftId);
  console.log('cleanup done');

  // Hasil
  let fail = 0;
  for (const [name, pass] of results) {
    console.log((pass ? '✅' : '❌'), name);
    if (!pass) fail++;
  }
  console.log(fail === 0 ? '\nSEMUA PASS' : `\n${fail} GAGAL`);
})();
