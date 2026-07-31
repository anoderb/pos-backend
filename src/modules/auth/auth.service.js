import { supabaseAdmin, supabaseAuth } from '../../config/database.js';
import { kirimEmail } from '../../utils/resend.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authService = {
  // 1. Registrasi Owner Baru dengan Security Anti-Spam
  async registerOwner({ nama, email, password, nama_toko, alamat_toko, no_telp_toko }) {
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('Format email tidak valid');
    }

    if (!password || password.length < 8) {
      throw new Error('Password minimal harus 8 karakter');
    }

    const { data: existingUser } = await supabaseAdmin
      .from('pengguna')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      throw new Error('Email ini sudah terdaftar di sistem. Silakan login.');
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
    let { data: profil } = await supabaseAdmin
      .from('pengguna')
      .select('*, toko:toko_id(*)')
      .eq('email', email)
      .maybeSingle();

    // Auto-heal missing profil pengguna & toko if user exists in Supabase Auth
    if (!profil && data?.user) {
      const nama = email.split('@')[0];
      const { data: tokoBaru } = await supabaseAdmin
        .from('toko')
        .insert({ nama: `Toko ${nama}` })
        .select()
        .single();

      const { data: penggunaBaru } = await supabaseAdmin
        .from('pengguna')
        .insert({
          id: data.user.id,
          nama: nama,
          email: email,
          role: 'owner',
          toko_id: tokoBaru?.id,
          aktif: true,
        })
        .select()
        .single();

      if (tokoBaru?.id) {
        await supabaseAdmin.from('toko').update({ owner_id: data.user.id }).eq('id', tokoBaru.id);
      }

      profil = {
        ...penggunaBaru,
        toko: tokoBaru,
      };
    }

    if (!profil) {
      throw new Error('Profil pengguna tidak dapat dibuat atau ditemukan');
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
      session: data.session,
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

    return {
      isNewUser: true,
      pengguna: penggunaBaru,
      toko: tokoBaru,
    };
  },

  // 4. Lupa Password
  async lupaPassword(email) {
    if (!EMAIL_REGEX.test(email)) throw new Error('Format email tidak valid');

    const { data: user } = await supabaseAdmin
      .from('pengguna')
      .select('nama')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return { pesan: 'Jika email terdaftar, link reset akan dikirim.' };
    }

    const resetLink = `https://tokiva.biz.id/reset-password?email=${encodeURIComponent(email)}`;

    kirimEmail({
      to: email,
      subject: 'Reset Password Tokiva POS',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h3 style="color: #16A34A;">Halo ${user.nama}, Permintaan Reset Password</h3>
          <p>Anda menerima email ini karena ada permintaan reset password untuk akun Tokiva POS Anda.</p>
          <p><a href="${resetLink}" style="background: #16A34A; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Reset Password Sekarang</a></p>
          <p style="font-size: 12px; color: #888;">Jika Anda tidak merasa meminta ini, abaikan email ini.</p>
        </div>
      `,
    }).catch(err => console.error('Error sending reset password email:', err.message));

    return { pesan: 'Link reset password telah dikirim ke email Anda.' };
  },

  // 5. Reset Password Baru
  async resetPassword({ email, new_password }) {
    if (!new_password || new_password.length < 8) {
      throw new Error('Password baru minimal 8 karakter');
    }

    const { data: p } = await supabaseAdmin
      .from('pengguna')
      .select('id')
      .eq('email', email)
      .single();

    if (!p) throw new Error('User tidak ditemukan');

    const { error } = await supabaseAdmin.auth.admin.updateUserById(p.id, {
      password: new_password,
    });

    if (error) throw new Error('Gagal mereset password: ' + error.message);
    return { pesan: 'Password berhasil diperbarui. Silakan login kembali.' };
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
