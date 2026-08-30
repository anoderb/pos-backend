import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { calculateCRC16, validateQRIS, convertQRIS } from '../utils/qris-utils.mjs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API = 'http://localhost:5000/api';

async function main() {
  const lo = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'anoderb@gmail.com', password: 'Bandulan112@' }) });
  const cookie = (lo.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const st = (await (await fetch(API + '/auth/status', { headers: { Cookie: cookie } })).json()).data.pengguna;
  const tokoId = st.toko_id, kasirId = st.id;
  const originalToko = (await sb.from('toko').select('qris_string,qris_status,qris_info,qris_aktif').eq('id', tokoId).single()).data;

  const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
  const merchantAccount = tlv('00', 'ID.CO.QRIS') + tlv('01', 'MERCHANT123');
  const body = [
    tlv('00', '01'),
    tlv('01', '11'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '360'),
    tlv('58', 'ID'),
    tlv('59', 'TOKO BOSS'),
    tlv('60', 'MALANG'),
    tlv('61', '65145'),
  ].join('');
  const qris = body + '6304' + calculateCRC16(body + '6304');
  const results = [];
  const ok = (n, p) => results.push([n, p]);
  const call = async (path, method = 'GET', bodyData, extraHeaders = {}) => {
    const headers = { 'Content-Type': 'application/json', Cookie: cookie, ...extraHeaders };
    const r = await fetch(API + path, { method, headers, body: bodyData === undefined ? undefined : JSON.stringify(bodyData) });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, json: j };
  };

  // 1. set QRIS valid
  let r = await call('/owner/toko/qris', 'PUT', { qris_string: qris });
  ok('1. set QRIS valid [' + r.status + '] ' + (r.json?.pesan || ''), r.status === 200 && r.json?.data?.qris_status === 'valid');

  // 2. QRIS invalid -> 400
  r = await call('/owner/toko/qris', 'PUT', { qris_string: 'INVALIDDATA' });
  ok('2. QRIS invalid -> 400 [' + r.status + ']', r.status === 400);

  // re-set valid
  await call('/owner/toko/qris', 'PUT', { qris_string: qris });

  // setup shift + produk
  const sh = (await sb.from('shift').insert({ toko_id: tokoId, kasir_id: kasirId, status: 'buka', modal_awal: 10000 }).select('id').single()).data;
  const pr = (await sb.from('produk').insert({ toko_id: tokoId, nama: 'QRIS-PROD', stok: 10 }).select('id').single()).data;
  const sat = (await sb.from('satuan').select('id').eq('toko_id', tokoId).limit(1).maybeSingle()).data;
  await sb.from('produk_satuan_jual').insert({ produk_id: pr.id, satuan_id: sat.id, konversi: 1, harga_ecer: 5000, is_default: true });

  // 3. checkout qris -> pending, stok tidak berkurang
  r = await call('/kasir/transaksi', 'POST', { shift_id: sh.id, metode_bayar: 'qris', items: [{ produk_id: pr.id, qty: 2 }] }, { 'Idempotency-Key': randomUUID() });
  const txQ = r.json?.data?.id;
  const p1 = (await sb.from('produk').select('stok').eq('id', pr.id).single()).data?.stok;
  ok('3. checkout qris -> pending [' + r.status + '] status=' + r.json?.data?.status + '/' + r.json?.data?.status_qris, r.status === 201 && r.json?.data?.status === 'pending' && r.json?.data?.status_qris === 'pending');
  ok('3b. qris_payload ada + stok belum berkurang (' + p1 + ')', !!r.json?.data?.qris_payload && p1 === 10);
  ok('3c. payload CRC valid', validateQRIS(r.json?.data?.qris_payload || '').valid);

  // 4. laporan pending
  r = await call('/owner/laporan/pending');
  ok('4. laporan pending total>=1 (' + r.json?.data?.total + ')', r.status === 200 && r.json?.data?.total >= 1);

  // 5. approve -> selesai + stok berkurang
  r = await call('/kasir/transaksi/' + txQ + '/qris/approve', 'POST', { alasan: 'dibayar' });
  const p2 = (await sb.from('produk').select('stok').eq('id', pr.id).single()).data?.stok;
  ok('5. approve -> approved/selesai [' + r.status + '] ' + r.json?.data?.status_qris, r.status === 200 && r.json?.data?.status_qris === 'approved' && r.json?.data?.status === 'selesai');
  ok('5b. stok berkurang 10->8 (' + p2 + ')', p2 === 8);

  // 6-7. cancel
  const txQ2 = (await sb.from('transaksi').insert({ toko_id: tokoId, shift_id: sh.id, kasir_id: kasirId, nomor_transaksi: 'TP-' + Date.now(), subtotal: 5000, total: 5000, metode_bayar: 'qris', status: 'pending', status_qris: 'pending', qris_payload: convertQRIS(qris, { amount: 5000 }), created_at: new Date().toISOString() }).select('id').single()).data?.id;
  await sb.from('transaksi_item').insert({ transaksi_id: txQ2, produk_id: pr.id, nama_produk: 'QRIS-PROD', satuan: 'pcs', konversi: 1, qty: 1, harga_satuan: 5000, subtotal: 5000 });
  r = await call('/kasir/transaksi/' + txQ2 + '/qris/cancel', 'POST', {});
  ok('6. cancel tanpa alasan -> 400 [' + r.status + ']', r.status === 400);
  r = await call('/kasir/transaksi/' + txQ2 + '/qris/cancel', 'POST', { alasan: 'pembeli batal' });
  ok('7. cancel dgn alasan -> cancelled [' + r.status + '] ' + r.json?.data?.status_qris, r.status === 200 && r.json?.data?.status_qris === 'cancelled');

  // cleanup
  await sb.from('transaksi_item').delete().eq('produk_id', pr.id);
  await sb.from('transaksi').delete().eq('shift_id', sh.id);
  await sb.from('stock_movement').delete().eq('produk_id', pr.id);
  await sb.from('produk_satuan_jual').delete().eq('produk_id', pr.id);
  await sb.from('produk').delete().eq('id', pr.id);
  await sb.from('shift').delete().eq('id', sh.id);
  if (originalToko) await sb.from('toko').update(originalToko).eq('id', tokoId);
  console.log('cleanup done\\n');
  let fail = 0;
  for (const [n, p] of results) { console.log((p ? '✅' : '❌'), n); if (!p) fail++; }
  console.log(fail === 0 ? '\nSEMUA PASS' : '\n' + fail + ' GAGAL');
}
main();
