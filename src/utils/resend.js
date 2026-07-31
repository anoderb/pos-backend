import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resendApiKey = process.env.RESEND_API_KEY;
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function kirimEmail({ to, subject, html }) {
  if (!resend) {
    console.warn('⚠️ RESEND_API_KEY belum dikonfigurasi. Email batal dikirim.');
    return { success: false, message: 'Resend API key missing' };
  }

  try {
    const from = process.env.EMAIL_FROM || 'Tokiva POS <onboarding@resend.dev>';
    const data = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });
    return { success: true, data };
  } catch (error) {
    console.error('Gagal mengirim email via Resend:', error);
    return { success: false, error: error.message };
  }
}
