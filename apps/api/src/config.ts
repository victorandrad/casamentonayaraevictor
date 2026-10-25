// Runtime configuration from environment variables.
import { join } from 'node:path';

const env = process.env;

function databaseUrl(): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  // Running on the host against the Docker database (npm run dev -w @nv/api).
  const user = env.POSTGRES_USER ?? 'casamento';
  const db = env.POSTGRES_DB ?? 'casamento';
  const port = env.POSTGRES_PORT ?? '5433';
  if (!env.POSTGRES_PASSWORD) throw new Error('Defina DATABASE_URL ou POSTGRES_PASSWORD');
  return `postgres://${user}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@localhost:${port}/${db}`;
}

export const config = {
  port: Number(env.PORT ?? env.API_PORT ?? 4100),
  isProduction: env.NODE_ENV === 'production',
  databaseUrl: databaseUrl(),
  allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:4000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSecure: env.COOKIE_SECURE === 'true',
  sessionDays: 30,
  // Panel owner (the only one who manages users): the account created from ADMIN_EMAIL.
  ownerEmail: (env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  inviteDays: 7,
  resetMinutes: 60,
  // Public address of the site, used for Stripe's return URLs
  siteUrl: (env.SITE_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  stripeSecretKey: env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
  // Uploaded gift photos (a Docker volume in production)
  uploadsDir: env.UPLOADS_DIR ?? join(import.meta.dirname, '..', 'uploads'),
  // Config folder of the mail server (docker-mailserver, in its own Docker project, serving several
  // domains). The panel manages only MAIL_DOMAIN's mailboxes there.
  // Empty = the E-mails tab shows that the mail server is not set up here.
  mail: {
    configDir: env.MAIL_CONFIG_DIR ?? '',
    domain: (env.MAIL_DOMAIN ?? '').trim().toLowerCase(),
    // Server name for IMAP/SMTP (shared by every domain); default mail.<domain>.
    hostname: (env.MAIL_HOSTNAME || (env.MAIL_DOMAIN ? `mail.${env.MAIL_DOMAIN.trim().toLowerCase()}` : '')).trim().toLowerCase(),
    webmailUrl: env.WEBMAIL_URL ?? '',
    // The mailbox with the panel login's address uses the panel password (synced by the seed).
    adminEmail: (env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  },
  // Receipt e-mails over SMTP (local Mailpit by default)
  smtp: {
    host: env.SMTP_HOST ?? 'localhost',
    port: Number(env.SMTP_PORT ?? 1025),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.EMAIL_FROM ?? 'Nayara & Victor <nao-responder@nayaraevictor.local>',
    replyTo: env.EMAIL_REPLY_TO ?? '',
  },
};
