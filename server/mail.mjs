import mail from 'nodemailer';

export function createMailer(env = process.env) {
  if (env.SMTP_URL) return mail.createTransport(env.SMTP_URL);
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD?.trim()) return null;
  const port = Number(env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) throw Error('Use SMTP port 465 or 587.');
  return mail.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_HOST === 'smtp.gmail.com'
        ? env.SMTP_PASSWORD.replace(/\s/g, '')
        : env.SMTP_PASSWORD,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
