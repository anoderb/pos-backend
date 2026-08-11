import { supabaseAdmin } from '../../config/database.js';

export const hutangService = {
  async listHutangAktif(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('nota_masuk')
      .select('*, supplier:supplier_id(nama, no_telp)')
      .eq('toko_id', toko_id)
      .gt('sisa_hutang', 0)
      .order('tanggal', { ascending: true });

    if (error) throw new Error('Gagal mengambil daftar hutang');
    return data;
  },

  async bayarHutang(toko_id, nota_id, created_by_id, { jumlah, metode, bukti_url, catatan }) {
    const jumlahNum = Number(jumlah || 0);

    const { data: nota } = await supabaseAdmin
      .from('nota_masuk')
      .select('total, total_dibayar, sisa_hutang')
      .eq('toko_id', toko_id)
      .eq('id', nota_id)
      .single();

    if (!nota) throw new Error('Nota pembelian tidak ditemukan');

    if (jumlahNum > Number(nota.sisa_hutang)) {
      throw new Error(`Jumlah pembayaran (${jumlahNum}) melebihi sisa hutang (${nota.sisa_hutang})`);
    }

    const { data: bayar, error: errBayar } = await supabaseAdmin
      .from('pembayaran_hutang')
      .insert({
        nota_masuk_id: nota_id,
        toko_id,
        jumlah: jumlahNum,
        metode: metode || 'cash',
        bukti_url,
        catatan,
        created_by: created_by_id,
      })
      .select()
      .single();

    if (errBayar) throw new Error('Gagal mencatat pembayaran hutang');

    const total_dibayar_baru = Number(nota.total_dibayar) + jumlahNum;
    const sisa_hutang_baru = Math.max(0, Number(nota.sisa_hutang) - jumlahNum);
    const status_bayar = sisa_hutang_baru === 0 ? 'lunas' : 'sebagian';

    await supabaseAdmin
      .from('nota_masuk')
      .update({
        total_dibayar: total_dibayar_baru,
        sisa_hutang: sisa_hutang_baru,
        status_bayar,
      })
      .eq('id', nota_id);

    return bayar;
  },

  async getHistoriPembayaran(toko_id, nota_id) {
    const { data, error } = await supabaseAdmin
      .from('pembayaran_hutang')
      .select('*, pembuat:created_by(nama)')
      .eq('toko_id', toko_id)
      .eq('nota_masuk_id', nota_id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Gagal mengambil histori pembayaran hutang');
    return data;
  },
};
