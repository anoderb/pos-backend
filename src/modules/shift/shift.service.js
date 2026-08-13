import { supabaseAdmin } from '../../config/database.js';

export const shiftService = {
  // Buka Shift Baru
  async bukaShift(toko_id, kasir_id, { modal_awal }) {
    // Cek apakah kasir sedang memiliki shift yang buka
    const { data: shiftAktif } = await supabaseAdmin
      .from('shift')
      .select('id')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .eq('status', 'buka')
      .maybeSingle();

    if (shiftAktif) {
      throw new Error('Anda masih memiliki shift yang belum ditutup');
    }

    const { data: shiftBaru, error } = await supabaseAdmin
      .from('shift')
      .insert({
        toko_id,
        kasir_id,
        waktu_buka: new Date().toISOString(),
        modal_awal: modal_awal || 0,
        status: 'buka',
      })
      .select()
      .single();

    if (error) throw new Error('Gagal membuka shift: ' + error.message);
    return shiftBaru;
  },

  // Get Shift yang Sedang Buka
  async getShiftAktif(toko_id, kasir_id) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .eq('kasir_id', kasir_id)
      .eq('status', 'buka')
      .maybeSingle();

    return data || null;
  },

  // Tutup Shift
  async tutupShift(toko_id, kasir_id, { shift_id, kas_aktual, catatan }) {
    // Ambil rekap transaksi penjualan selama shift ini
    const { data: txList } = await supabaseAdmin
      .from('transaksi')
      .select('total, diskon_total, metode_bayar, status')
      .eq('toko_id', toko_id)
      .eq('shift_id', shift_id);

    let total_penjualan = 0;
    let total_void = 0;
    let total_cash = 0;
    let total_qris = 0;
    let total_transfer = 0;

    if (txList) {
      for (const tx of txList) {
        if (tx.status === 'void') {
          total_void += Number(tx.total);
        } else {
          total_penjualan += Number(tx.total);
          if (tx.metode_bayar === 'cash') total_cash += Number(tx.total);
          if (tx.metode_bayar === 'qris') total_qris += Number(tx.total);
          if (tx.metode_bayar === 'transfer') total_transfer += Number(tx.total);
        }
      }
    }

    // Ambil shift header
    const { data: shiftCurrent } = await supabaseAdmin
      .from('shift')
      .select('modal_awal')
      .eq('id', shift_id)
      .single();

    const expectedKas = Number(shiftCurrent.modal_awal) + total_cash;
    const selisih = Number(kas_aktual) - expectedKas;

    const { data: shiftClosed, error } = await supabaseAdmin
      .from('shift')
      .update({
        waktu_tutup: new Date().toISOString(),
        kas_aktual,
        total_penjualan,
        total_void,
        total_cash,
        total_qris,
        total_transfer,
        selisih,
        catatan,
        status: 'tutup',
      })
      .eq('toko_id', toko_id)
      .eq('id', shift_id)
      .eq('kasir_id', kasir_id)
      .select()
      .single();

    if (error) throw new Error('Gagal menutup shift: ' + error.message);
    return shiftClosed;
  },

  // List Semua Shift Toko (Owner)
  async listShift(toko_id) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama)')
      .eq('toko_id', toko_id)
      .order('waktu_buka', { ascending: false });

    if (error) throw new Error('Gagal mengambil daftar shift');
    return data;
  },

  // Detail Shift + Rekap
  async getShiftById(toko_id, id) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('*, kasir:kasir_id(nama), transaksi(*)')
      .eq('toko_id', toko_id)
      .eq('id', id)
      .single();

    if (error) throw new Error('Shift tidak ditemukan');
    return data;
  },
};
