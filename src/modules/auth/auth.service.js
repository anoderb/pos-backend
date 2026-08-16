import { supabaseAdmin, supabaseAuth } from '../../config/database.js';
import { kirimEmail } from '../../utils/resend.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePasswordComplexity(password) {
  if (!password || password.length < 8) {
    throw new Error('Password minimal harus 8 karakter');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password maksimal 72 byte');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 huruf besar (A-Z)');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 huruf kecil (a-z)');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 angka (0-9)');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error('Password harus mengandung minimal 1 karakter spesial (!@#$%^&*)');
  }
}

export const authService = {
  // 1. Registrasi Owner Baru dengan Security Anti-Spam
  async registerOwner({ nama, email, password, nama_toko, alamat_toko, no_telp_toko }) {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }

    validatePasswordComplexity(password);

    const { data: existingUser } = await supabaseAdmin
      .from('pengguna')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      throw new Error('Registrasi tidak dapat diproses. Silakan periksa data atau gunakan akun lain.');
    }

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      throw new Error('Gagal membuat akun: ' + authErr.message);
    }

    const userId = authUser.user?.id;

    const { data: tokoBaru, error: tokoErr } = await supabaseAdmin
      .from('toko')
      .insert({
        nama: nama_toko,
        alamat: alamat_toko,
        no_telp: no_telp_toko,
      })
      .select()
      .single();

    if (tokoErr) {
      throw new Error('Gagal membuat data toko: ' + tokoErr.message);
    }

    const { data: penggunaBaru, error: penggunaErr } = await supabaseAdmin
      .from('pengguna')
      .insert({
        id: userId,
        nama,
        email,
        role: 'owner',
        toko_id: tokoBaru.id,
        aktif: true,
      })
      .select()
      .single();

    if (penggunaErr) {
      throw new Error('Gagal membuat profil owner: ' + penggunaErr.message);
    }

    await supabaseAdmin
      .from('toko')
      .update({ owner_id: penggunaBaru.id })
      .eq('id', tokoBaru.id);

    // Seed satuan default "pcs" untuk toko baru
    await supabaseAdmin.from('satuan').insert({ toko_id: tokoBaru.id, nama: 'pcs' });

    // Kirim email sambutan via Resend (Background safe)
    kirimEmail({
      to: email,
      subject: 'Selamat Datang di Tokiva POS!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #16A34A;">Halo ${nama}, Selamat Datang di Tokiva!</h2>
          <p>Toko Anda <strong>${nama_toko}</strong> telah berhasil didaftarkan.</p>
          <p>Silakan masuk ke aplikasi menggunakan email <strong>${email}</strong> untuk mengelola toko Anda.</p>
          <hr />
          <p style="font-size: 12px; color: #666;">Tokiva POS — Kasir Cerdas untuk UMKM Modern (tokiva.biz.id)</p>
        </div>
      `,
    }).catch(err => console.error('Error sending welcome email:', err.message));

    return {
      pengguna: penggunaBaru,
      toko: tokoBaru,
    };
  },

  // 2. Login Email & Password
  // CRITICAL: Use supabaseAuth (anon key) for signInWithPassword to avoid
  // polluting supabaseAdmin's internal session, which would cause RLS to
  // block subsequent database queries via supabaseAdmin.
  async login({ email, password }) {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }

    // Step 1: Authenticate via Supabase Auth (using anon client)
    let { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    // Handle user unconfirmed in Supabase (Automatic verification fix)
    if (error && (error.message?.toLowerCase().includes('confirm') || error.message?.toLowerCase().includes('email not confirmed'))) {
      const { data: userProfile } = await supabaseAdmin
        .from('pengguna')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (userProfile?.id) {
        await supabaseAdmin.auth.admin.updateUserById(userProfile.id, { email_confirm: true });
        const retry = await supabaseAuth.auth.signInWithPassword({ email, password });
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) {
      throw new Error('Email atau password salah');
    }

    // Step 2: Get profil pengguna (using admin client - bypasses RLS)
    const { data: profil } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .maybeSingle();

    if (!profil) {
      throw new Error('Akun Anda belum terdaftar pada toko mana pun. Silakan hubungi Owner toko.');
    }

    // Owner role is always active by default
    if (profil.role === 'owner' && !profil.aktif) {
      await supabaseAdmin
        .from('pengguna')
        .update({ aktif: true })
        .eq('id', profil.id);
      profil.aktif = true;
    }

    if (!profil.aktif) {
      throw new Error('Akun Anda telah dinonaktifkan oleh Owner');
    }

    return {
      // Controller moves refresh_token into an HttpOnly cookie.
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      pengguna: {
        id: profil.id,
        nama: profil.nama,
        email: profil.email,
        role: profil.role,
        toko_id: profil.toko_id,
      },
      toko: profil.toko,
    };
  },

  // 3. Login / Sync OAuth Google
  async handleOAuthCallback({ user }) {
    const { id, email, user_metadata } = user;
    const nama = user_metadata?.full_name || user_metadata?.name || email.split('@')[0];

    const { data: existingProfile } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return {
        isNewUser: false,
        pengguna: existingProfile,
        toko: existingProfile.toko,
      };
    }

    const namaTokoDefault = `Toko ${nama}`;
    const { data: tokoBaru } = await supabaseAdmin
      .from('toko')
      .insert({ nama: namaTokoDefault })
      .select()
      .single();

    const { data: penggunaBaru } = await supabaseAdmin
      .from('pengguna')
      .insert({
        id,
        nama,
        email,
        role: 'owner',
        toko_id: tokoBaru.id,
        aktif: true,
      })
      .select()
      .single();

    await supabaseAdmin.from('toko').update({ owner_id: id }).eq('id', tokoBaru.id);
    await supabaseAdmin.from('satuan').insert({ toko_id: tokoBaru.id, nama: 'pcs' });

    return {
      isNewUser: true,
      pengguna: penggunaBaru,
      toko: tokoBaru,
    };
  },

  // Kirim Email Verifikasi (desain template Tokiva)
  async kirimVerifikasiEmail(email) {
    if (!email || !EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }
    const { data: profil } = await supabaseAdmin
      .from('pengguna')
      .select('nama')
      .eq('email', email)
      .maybeSingle();
    const nama = profil?.nama || email.split('@')[0];

    await kirimEmail({
      to: email,
      subject: 'Verifikasi Email Anda — Tokiva',
      html: `
        <div style="font-family: Arial, sans-serif; background: #F1F5F4; padding: 24px;">
          <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 12px rgba(16,35,62,.08);">
            <div style="background: linear-gradient(135deg, #E8FAF0, #FFF8D9); padding: 28px 24px; text-align: center;">
              <img src="https://tokiva.biz.id/assets/tokiva-dashboard/img-verifikasi-hero.png" alt="Verifikasi" style="width: 160px; height: auto; border-radius: 12px;" />
              <h1 style="color: #10233E; font-size: 22px; margin: 16px 0 4px;">Verifikasi Email Anda!</h1>
              <p style="color: #0CAF60; font-size: 14px; margin: 0; font-weight: 600;">Satu langkah lagi untuk memulai</p>
            </div>
            <div style="padding: 24px;">
              <p style="color: #10233E; font-size: 14px; margin: 0 0 16px;">Halo <b>${nama}</b>! 👋</p>
              <p style="color: #68758A; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                Terima kasih telah mendaftar di Tokiva. Klik tombol di bawah untuk membuka aplikasi dan mulai mengelola toko Anda.
              </p>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="https://app.tokiva.biz.id/verifikasi?email=${encodeURIComponent(email)}" style="display: inline-block; background: #0CAF60; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 13px 32px; border-radius: 12px;">Verifikasi Email Saya</a>
              </div>
              <div style="background: #E8FAF0; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px;">
                <p style="margin: 0; color: #68758A; font-size: 12px;"><b style="color: #10233E;">Belum menerima email?</b> Cek folder Spam / Promosi Anda. Email bisa memerlukan waktu beberapa menit.</p>
              </div>
              <p style="color: #68758A; font-size: 12px; margin: 0;">Abaikan email ini jika Anda tidak mendaftar di Tokiva.</p>
            </div>
            <div style="background: #10233E; padding: 14px 24px; text-align: center;">
              <p style="color: #ffffff; font-size: 12px; margin: 0;">© 2026 Tokiva. Semua hak dilindungi.</p>
            </div>
          </div>
        </div>
      `,
    });

    return { pesan: 'Email verifikasi telah dikirim ulang.' };
  },

  // 4. Lupa Password — Kirim reset via Supabase
  async lupaPassword(email) {
    if (!email || !EMAIL_REGEX.test(email)) throw new Error('Format email tidak valid');

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.tokiva.biz.id/reset-password',
    });

    if (error) {
      throw new Error('Permintaan reset password tidak dapat diproses');
    }

    return { pesan: 'Jika email terdaftar, link reset akan dikirim.' };
  },

  // 5. Reset Password (Kirim Email Magic Link Secure)
  async resetPassword({ email }) {
    if (!email || !EMAIL_REGEX.test(email)) {
      throw new Error('Email tidak valid atau wajib diisi');
    }

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://app.tokiva.biz.id/reset-password',
    });

    if (error) {
      throw new Error('Permintaan reset password tidak dapat diproses');
    }

    return { pesan: 'Jika email terdaftar, link reset akan dikirim.' };
  },

  // 5b. Ganti Password Langsung (Self-Service, user sudah login JWT)
  async gantiPassword(email, old_password, new_password) {
    if (!old_password) {
      throw new Error('Password lama wajib diisi');
    }
    if (!new_password || new_password.length < 8) {
      throw new Error('Password baru minimal 8 karakter');
    }
    if (Buffer.byteLength(new_password, 'utf8') > 72) {
      throw new Error('Password maksimal 72 byte');
    }

    // 1. Verifikasi old password
    const { error: authErr } = await supabaseAuth.auth.signInWithPassword({
      email,
      password: old_password,
    });
    if (authErr) {
      throw new Error('Password lama salah');
    }

    // 2. Cari user auth ID dari email
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!authUser) {
      throw new Error('Akun pengguna tidak ditemukan di sistem auth');
    }

    // 3. Update password
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: new_password,
    });

    if (error) {
      throw new Error('Gagal mengubah password: ' + error.message);
    }

    // 4. Sign out all sessions
    await supabaseAdmin.auth.admin.signOut(authUser.id).catch(() => {});

    return { pesan: 'Password berhasil diperbarui! Silakan login ulang.' };
  },

  // 6. Refresh Token
  async refreshToken(refresh_token) {
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token,
    });

    if (error) throw new Error('Refresh token tidak valid atau expired');
    return data.session;
  },

  // 7. Get Profil Pengguna
  async getProfil(email) {
    const { data, error } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .single();

    if (error) throw new Error('Profil tidak ditemukan');
    return data;
  },
};
