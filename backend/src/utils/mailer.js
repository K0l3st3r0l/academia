const nodemailer = require('nodemailer');
const logger = require('../logger');

// AcademIA sends from its own Gmail account, not Anahuac's: Gmail's sending limit
// is per account, and Anahuac's mailbox carries payslips and NFC receipts.
// Credentials come from .env.mail, an env file only the backend reads, because
// editing the shared .env recreates the database container too.
const { MAIL_USER, MAIL_APP_PASSWORD } = process.env;
const FROM = `"AcademIA" <${MAIL_USER || 'academia@test.local'}>`;

function createTransport() {
  if (process.env.NODE_ENV === 'test') return nodemailer.createTransport({ jsonTransport: true });
  if (!MAIL_USER || !MAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: MAIL_USER, pass: MAIL_APP_PASSWORD },
    pool: true,
    maxConnections: 1,
    // A whole class asking for links at once queues instead of tripping Gmail's limits.
    rateDelta: 20000,
    rateLimit: 3,
  });
}

const transporter = createTransport();
if (!transporter) logger.warn('Mail disabled: MAIL_USER / MAIL_APP_PASSWORD not set (.env.mail)');

const mailEnabled = () => Boolean(transporter);

async function sendMail({ to, subject, html, text }) {
  if (!transporter) throw new Error('mail_not_configured');
  const info = await transporter.sendMail({ from: FROM, to, subject, html, text });
  if (process.env.NODE_ENV === 'test') {
    // Tests import the app through a CJS chain their own imports can't share, so
    // the outbox lives on globalThis instead of a module export.
    (globalThis.__academiaOutbox ??= []).push(JSON.parse(info.message));
  }
  return info;
}

module.exports = { mailEnabled, sendMail };
