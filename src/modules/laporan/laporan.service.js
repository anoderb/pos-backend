import { supabaseAdmin } from '../../config/database.js';

export const laporanService = {
  // Widget Dashboard Owner — periode: hari_ini | minggu_ini | bulan_ini | custom (tanggal_mulai/tanggal_selesai)
  async getDashboardWidget(toko_id, periode = 'hari_ini', tanggal_mulai, tanggal_selesai) {
    const O = 7 * 3600 * 1000; // offset GMT+7
    const now = Date.now();
    const local = new Date(now + O);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();

    let mulaiLocal, selesaiLocal;
    let p = ['hari_ini', 'minggu_ini', 'bulan_ini'].includes(periode) ? periode : 'hari_ini';
    let isCustom = false;

    if (tanggal_mulai && tanggal_selesai) {
      isCustom = true;
      p = 'custom';
      const parse = (s) => {
        const [yy, mm, dd] = String(s).slice(0, 10).split('-').map(Number);
        return new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1));
      };
      mulaiLocal = parse(tanggal_mulai);
      // selesai inclusive → end of day
      selesaiLocal = new Date(parse(tanggal_selesai).getTime() + 24 * 3600 * 1000);
      if (selesaiLocal <= mulaiLocal) selesaiLocal = new Date(mulaiLocal.getTime() + 24 * 3600 * 1000);
    } else if (p === 'hari_ini') {
      mulaiLocal = new Date(Date.UTC(y, m, d));
      selesaiLocal = new Date(Date.UTC(y, m, d + 1));
    } else if (p === 'minggu_ini') {
      const dow = (local.getUTCDay() + 6) % 7; // Senin = 0
      mulaiLocal = new Date(Date.UTC(y, m, d - dow));
      selesaiLocal = new Date(Date.UTC(y, m, d - dow + 7));
    } else {
      mulaiLocal = new Date(Date.UTC(y, m, 1));
      selesaiLocal = new Date(Date.UTC(y, m + 1, 1));
    }

    const durasi = selesaiLocal.getTime() - mulaiLocal.getTime();
    const mulai = new Date(mulaiLocal.getTime() - O);
    const selesai = new Date(selesaiLocal.getTime() - O);
    const prevMulai = new Date(mulai.getTime() - durasi);

    // --- Transaksi periode aktif (omzet + count + bucket chart) ---
    const { data: txCur } = await supabaseAdmin
      .from('transaksi')
      .select('id, total, created_at')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .gte('created_at', mulai.toISOString())
      .lt('created_at', selesai.toISOString());
    const rows = txCur || [];
    const omzet = rows.reduce((acc, t) => acc + Number(t.total || 0), 0);
    const total_transaksi = rows.length;

    // --- Transaksi periode sebelumnya (growth) ---
    const { data: txPrev } = await supabaseAdmin
      .from('transaksi')
      .select('total')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .gte('created_at', prevMulai.toISOString())
      .lt('created_at', mulai.toISOString());
    const omzet_prev = (txPrev || []).reduce((acc, t) => acc + Number(t.total || 0), 0);

    const growth_persen =
      omzet_prev > 0 ? Math.round(((omzet - omzet_prev) / omzet_prev) * 1000) / 10 : null;

    // --- Bucket chart (dipakai chart omset + chart transaksi sekaligus) ---
    const buckets = [];
    if (isCustom) {
      // per-hari dalam rentang
      const tglAwal = new Date(mulaiLocal.getTime());
      const tglAkhir = new Date(selesaiLocal.getTime() - 24 * 3600 * 1000);
      let cur = new Date(tglAwal.getTime());
      let idx = 1;
      while (cur.getTime() <= tglAkhir.getTime() && idx <= 62) {
        buckets.push({ idx, label: cur.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) });
        cur = new Date(cur.getTime() + 24 * 3600 * 1000);
        idx++;
      }
    } else if (p === 'hari_ini') {
      for (let h = 0; h < 24; h++) buckets.push({ idx: h, label: `${String(h).padStart(2, '0')}:00` });
    } else if (p === 'minggu_ini') {
      const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      for (let i = 0; i < 7; i++) buckets.push({ idx: i, label: days[i] });
    } else {
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let i = 1; i <= dim; i++) buckets.push({ idx: i, label: String(i) });
    }

    const chart_omzet = buckets.map(() => 0);
    const chart_transaksi = buckets.map(() => 0);
    const bucketIndexOf = (createdAt) => {
      const l = new Date(new Date(createdAt).getTime() + O);
      if (isCustom) return Math.floor((new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())).getTime() - new Date(Date.UTC(mulaiLocal.getUTCFullYear(), mulaiLocal.getUTCMonth(), mulaiLocal.getUTCDate())).getTime()) / (24 * 3600 * 1000)) + 1;
      if (p === 'hari_ini') return l.getUTCHours();
      if (p === 'minggu_ini') return (l.getUTCDay() + 6) % 7;
      return l.getUTCDate();
    };
    for (const t of rows) {
      const idx = bucketIndexOf(t.created_at);
      const slot = p === 'bulan_ini' ? idx - 1 : idx;
      if (slot >= 0 && slot < buckets.length) {
        chart_omzet[slot] += Number(t.total || 0);
        chart_transaksi[slot] += 1;
      }
    }
    const chart_omzet_out = buckets.map((b, i) => ({ bucket: b.label, nilai: Math.round(chart_omzet[i]) }));
    const chart_transaksi_out = buckets.map((b, i) => ({ bucket: b.label, jumlah: chart_transaksi[i] }));

    // --- Items periode (laba + top produk) ---
    let estimasi_laba = 0;
    let hpp_lengkap = true;
    const produkAgg = {};
    if (rows.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('transaksi_item')
        .select('qty, subtotal, produk_id, produk:produk_id(nama, foto_url, hpp)')
        .in('transaksi_id', rows.map((t) => t.id));
      for (const i of items || []) {
        const qty = Number(i.qty || 0);
        const subtotal = Number(i.subtotal || 0);
        const hpp = i.produk ? Number(i.produk.hpp || 0) : null;
        if (hpp === null || i.produk === null) {
          hpp_lengkap = false;
        } else {
          estimasi_laba += subtotal - qty * hpp;
        }
        const pid = i.produk_id;
        if (!produkAgg[pid]) produkAgg[pid] = { produk_id: pid, nama: i.produk?.nama || i.nama_produk || 'Produk', foto_url: i.produk?.foto_url || null, qty: 0, omzet: 0 };
        produkAgg[pid].qty += qty;
        produkAgg[pid].omzet += subtotal;
      }
    }
    const margin_persen = omzet > 0 ? Math.round((estimasi_laba / omzet) * 1000) / 10 : 0;
    const rata_rata_tx = total_transaksi > 0 ? omzet / total_transaksi : 0;
    const top_produk = Object.values(produkAgg).sort((a, b) => b.qty - a.qty).slice(0, 3);
    const total_item_terjual = Object.values(produkAgg).reduce((s, a) => s + a.qty, 0);
    const total_produk_terjual = Object.keys(produkAgg).length;

    // --- Stok kritis (tidak terpengaruh periode) ---
    const { data: produkKritis } = await supabaseAdmin
      .from('produk')
      .select('id, nama, stok, stok_minimum, foto_url')
      .eq('toko_id', toko_id)
      .eq('aktif', true);
    const stok_kritis = (produkKritis || []).filter((pr) => Number(pr.stok) <= Number(pr.stok_minimum));

    // --- Shift aktif ---
    const { data: shiftAktif } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .eq('status', 'buka')
      .maybeSingle();

    // --- Insight ---
    const prevLabel = isCustom ? 'periode sebelumnya' : p === 'hari_ini' ? 'kemarin' : p === 'minggu_ini' ? 'minggu lalu' : 'bulan lalu';
    let insight = { arah: 'stable', persen: null, teks: `Penjualan periode ini relatif stabil dibanding ${prevLabel}.` };
    if (growth_persen !== null) {
      if (growth_persen > 0) insight = { arah: 'up', persen: growth_persen, teks: `Penjualan periode ini lebih tinggi ${growth_persen}% dibanding ${prevLabel}.` };
      else if (growth_persen < 0) insight = { arah: 'down', persen: Math.abs(growth_persen), teks: `Penjualan periode ini lebih rendah ${Math.abs(growth_persen)}% dibanding ${prevLabel}.` };
    }

    return {
      periode: p,
      custom: isCustom,
      rentang: { mulai: mulai.toISOString(), selesai: selesai.toISOString() },
      omzet,
      omzet_prev,
      growth_persen,
      total_transaksi,
      rata_rata_tx,
      estimasi_laba,
      margin_persen,
      hpp_lengkap,
      chart_omzet: chart_omzet_out,
      chart_transaksi: chart_transaksi_out,
      top_produk,
      total_item_terjual,
      total_produk_terjual,
      total_stok_kritis: stok_kritis.length,
      stok_kritis_list: stok_kritis.slice(0, 5),
      insight,
      shift_aktif: shiftAktif || null,
      // kompatibilitas field lama
      omzet_hari_ini: omzet,
      total_transaksi_hari_ini: total_transaksi,
    };
  },

  // Ringkasan Laporan Keuangan — rentang: hari_ini | 7_hari | bulan_ini | bulan_lalu
  async getRingkasanLaporan(toko_id, rentang = 'bulan_ini') {
    const r = ['hari_ini', '7_hari', 'bulan_ini', 'bulan_lalu'].includes(rentang) ? rentang : 'bulan_ini';
    const O = 7 * 3600 * 1000;
    const now = Date.now();
    const local = new Date(now + O);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();

    let mulaiLocal, selesaiLocal, label;
    if (r === 'hari_ini') {
      mulaiLocal = new Date(Date.UTC(y, m, d));
      selesaiLocal = new Date(Date.UTC(y, m, d + 1));
      label = new Date(Date.UTC(y, m, d)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } else if (r === '7_hari') {
      mulaiLocal = new Date(Date.UTC(y, m, d - 6));
      selesaiLocal = new Date(Date.UTC(y, m, d + 1));
      label = '7 hari terakhir';
    } else if (r === 'bulan_lalu') {
      mulaiLocal = new Date(Date.UTC(y, m - 1, 1));
      selesaiLocal = new Date(Date.UTC(y, m, 1));
      label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else {
      mulaiLocal = new Date(Date.UTC(y, m, 1));
      selesaiLocal = new Date(Date.UTC(y, m + 1, 1));
      label = new Date(Date.UTC(y, m, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }

    const durasi = selesaiLocal.getTime() - mulaiLocal.getTime();
    const mulai = new Date(mulaiLocal.getTime() - O);
    const selesai = new Date(selesaiLocal.getTime() - O);
    const prevMulai = new Date(mulai.getTime() - durasi);

    const q = (startIso, endIso) => supabaseAdmin
      .from('transaksi')
      .select('id, total, diskon_total')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .gte('created_at', startIso)
      .lt('created_at', endIso);

    const { data: cur } = await q(mulai.toISOString(), selesai.toISOString());
    const { data: prev } = await q(prevMulai.toISOString(), mulai.toISOString());

    const rows = cur || [];
    const prevRows = prev || [];
    const sum = (arr, f) => arr.reduce((a, t) => a + Number(f(t) || 0), 0);
    const omset = sum(rows, t => t.total);
    const omset_prev = sum(prevRows, t => t.total);
    const total_transaksi = rows.length;
    const tx_prev = prevRows.length;
    const diskon = Math.abs(sum(rows, t => t.diskon_total));

    // HPP dari items periode aktif
    const idsCur = rows.map(t => t.id);
    let total_hpp = 0;
    if (idsCur.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('transaksi_item')
        .select('qty, produk:produk_id(hpp)')
        .in('transaksi_id', idsCur);
      for (const it of items || []) total_hpp += Number(it.qty || 0) * Number(it.produk?.hpp || 0);
    }
    const laba_kotor = omset - total_hpp;
    const laba_bersih = laba_kotor - diskon;

    // HPP periode sebelumnya (growth laba)
    const idsPrev = prevRows.map(t => t.id);
    let prev_hpp = 0;
    if (idsPrev.length > 0) {
      const { data: prevItems } = await supabaseAdmin
        .from('transaksi_item')
        .select('qty, produk:produk_id(hpp)')
        .in('transaksi_id', idsPrev);
      for (const it of prevItems || []) prev_hpp += Number(it.qty || 0) * Number(it.produk?.hpp || 0);
    }
    const prev_diskon = Math.abs(sum(prevRows, t => t.diskon_total));
    const laba_prev = omset_prev - prev_hpp - prev_diskon;

    const rata_rata_tx = total_transaksi > 0 ? omset / total_transaksi : 0;
    const rata_prev = tx_prev > 0 ? omset_prev / tx_prev : 0;

    const g = (curV, prevV) => (prevV > 0 ? Math.round(((curV - prevV) / prevV) * 1000) / 10 : null);

    // Metode pembayaran (butuh kolom metode_bayar — query ulang ringan)
    const { data: curMetode } = await supabaseAdmin
      .from('transaksi')
      .select('total, metode_bayar')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .gte('created_at', mulai.toISOString())
      .lt('created_at', selesai.toISOString());
    const agg = { cash: 0, qris: 0, transfer: 0 };
    (curMetode || []).forEach(t => {
      const key = (t.metode_bayar || 'cash').toLowerCase();
      if (agg[key] === undefined) agg.transfer += Number(t.total || 0);
      else agg[key] += Number(t.total || 0);
    });
    const metode = [
      { nama: 'cash', label: 'Tunai (Cash)', total: agg.cash },
      { nama: 'qris', label: 'QRIS', total: agg.qris },
      { nama: 'transfer', label: 'Transfer Bank', total: agg.transfer },
    ].map(mt => ({ ...mt, persentase: omset > 0 ? Math.round((mt.total / omset) * 1000) / 10 : 0 }));

    return {
      rentang: r,
      label_periode: label,
      omset,
      omset_prev,
      growth_omset: g(omset, omset_prev),
      laba_bersih,
      laba_prev,
      growth_laba: g(laba_bersih, laba_prev),
      total_transaksi,
      tx_prev,
      growth_tx: g(total_transaksi, tx_prev),
      rata_rata_tx,
      rata_prev,
      growth_rata: g(rata_rata_tx, rata_prev),
      total_hpp,
      laba_kotor,
      diskon,
      metode,
    };
  },

  // Laporan Penjualan
  async getLaporanPenjualan(toko_id, { tanggal_mulai, tanggal_selesai, kasir_id }) {
    let query = supabaseAdmin
      .from('transaksi')
      .select('*, kasir:kasir_id(nama), pelanggan:pelanggan_id(nama), items:transaksi_item(*)')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .order('created_at', { ascending: false });

    if (tanggal_mulai) query = query.gte('created_at', tanggal_mulai);
    if (tanggal_selesai) query = query.lte('created_at', tanggal_selesai + 'T23:59:59');
    if (kasir_id) query = query.eq('kasir_id', kasir_id);

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil laporan penjualan');
    return data;
  },

  // Laporan Histori Stok
  async getLaporanStok(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('produk')
      .select('*, kategori:kategori_id(nama), satuan_dasar:satuan_dasar_id(nama)')
      .eq('toko_id', toko_id)
      .eq('aktif', true)
      .order('nama', { ascending: true });

    if (error) throw new Error('Gagal mengambil laporan stok');
    return data;
  },

  // Laporan Pembelian (Nota Masuk)
  async getLaporanPembelian(toko_id, { tanggal_mulai, tanggal_selesai, supplier_id }) {
    let query = supabaseAdmin
      .from('nota_masuk')
      .select('*, supplier:supplier_id(nama), items:nota_masuk_item(*)')
      .eq('toko_id', toko_id)
      .order('tanggal', { ascending: false });

    if (tanggal_mulai) query = query.gte('tanggal', tanggal_mulai);
    if (tanggal_selesai) query = query.lte('tanggal', tanggal_selesai);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil laporan pembelian');
    return data;
  },

  // Laporan Shift Kasir
  async getLaporanShift(toko_id, { kasir_id }) {
    let query = supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .order('waktu_buka', { ascending: false });

    if (kasir_id) query = query.eq('kasir_id', kasir_id);

    const { data, error } = await query;
    if (error) throw new Error('Gagal mengambil laporan shift');
    return data;
  },

  // Estimasi Laba Rugi
  async getLaporanLabaRugi(toko_id, { tanggal_mulai, tanggal_selesai }) {
    let queryTx = supabaseAdmin
      .from('transaksi_item')
      .select('qty, harga_satuan, diskon, subtotal, produk:produk_id(hpp), transaksi!inner(toko_id, status, created_at)')
      .eq('transaksi.toko_id', toko_id)
      .eq('transaksi.status', 'selesai');

    if (tanggal_mulai) queryTx = queryTx.gte('transaksi.created_at', tanggal_mulai);
    if (tanggal_selesai) queryTx = queryTx.lte('transaksi.created_at', tanggal_selesai + 'T23:59:59');

    const { data: items } = await queryTx;

    let total_pendapatan = 0;
    let total_hpp = 0;

    if (items) {
      for (const item of items) {
        total_pendapatan += Number(item.subtotal || 0);
        const hppItem = Number(item.produk?.hpp || 0);
        total_hpp += Number(item.qty) * hppItem;
      }
    }

    const estimasi_laba_kotor = total_pendapatan - total_hpp;

    return {
      total_pendapatan,
      total_hpp,
      estimasi_laba_kotor,
    };
  },
};
