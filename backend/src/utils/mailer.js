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

// Credentials that Gmail rejects must not switch students to email sign-in: they
// would get links that never arrive. Mail counts as enabled only after Gmail accepts
// the login. Network errors are retried every 15 minutes; a rejected password is not,
// because .env.mail is only re-read when the container is recreated, and repeated
// failed logins could get the account locked.
const RETRY_MS = 15 * 60 * 1000;
let verified = process.env.NODE_ENV === 'test';

function verifyTransport() {
  transporter.verify()
    .then(() => {
      verified = true;
      logger.info(`Mail enabled: Gmail accepted ${MAIL_USER}`);
    })
    .catch(err => {
      verified = false;
      if (err.code === 'EAUTH') {
        logger.error({ responseCode: err.responseCode }, 'Mail disabled: Gmail rejected the .env.mail credentials; fix them and redeploy');
        return;
      }
      logger.error({ code: err.code }, 'Mail disabled: could not reach Gmail, retrying in 15 minutes');
      setTimeout(verifyTransport, RETRY_MS).unref();
    });
}
if (transporter && !verified) verifyTransport();

const mailEnabled = () => Boolean(transporter) && verified;

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
