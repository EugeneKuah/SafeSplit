const nodemailer = require('nodemailer');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';

function buildTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

async function sendVerificationEmail({ email, username, rawToken }) {
  const link = `${FRONTEND_URL}/verify-email?token=${rawToken}`;

  // Build transport fresh on every call so env vars are always current
  const transport = buildTransport();

  if (!transport) {
    console.log(`[dev email] Verification link for ${email}: ${link}`);
    return;
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@safesplit.app',
      to: email,
      subject: 'Verify your SafeSplit email address',
      text: `Hi ${username}, verify your email: ${link}`,
      html: `<p>Hi ${username},</p><p>Click below to verify your email address:</p><p><a href="${link}">Verify email address</a></p>`
    });
    console.log(`[email] Verification email sent to ${email}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${email}:`, err.message);
    // Fall back to logging the link so registration still works
    console.log(`[dev email fallback] Verification link for ${email}: ${link}`);
  }
}

module.exports = { sendVerificationEmail };
