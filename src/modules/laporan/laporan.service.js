import { supabaseAdmin } from '../../config/database.js';

export const laporanService = {
  // Widget Dashboard Owner
  async getDashboardWidget(toko_id) {
    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: txHariIni } = await supabaseAdmin
      .from('transaksi')
      .select('total')
      .eq('toko_id', toko_id)
      .eq('status', 'selesai')
      .gte('created_at', todayStr);

    const omzet_hari_ini = (txHariIni || []).reduce((acc, curr) => acc + Number(curr.total), 0);

    const { data: produkKritis } = await supabaseAdmin
      .from('produk')
      .select('id, nama, stok, stok_minimum')
      .eq('toko_id', toko_id)
      .eq('aktif', true);

    const stok_kritis = (produkKritis || []).filter((p) => Number(p.stok) <= Number(p.stok_minimum));

    const { data: shiftAktif } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .eq('status', 'buka')
      .maybeSingle();

    return {
      omzet_hari_ini,
      total_transaksi_hari_ini: (txHariIni || []).length,
      total_stok_kritis: stok_kritis.length,
      stok_kritis_list: stok_kritis.slice(0, 5),
      shift_aktif: shiftAktif || null,
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
      .select('*, kasir:kasir_id(nama, email)')
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
