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
  // Mercado Pago (Checkout Pro): access token of the application (TEST-… in test mode, APP_USR-… live)
  // and the secret that signs its webhook notifications.
  mercadoPago: {
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? '',
  },
  // Which gateway new gift orders go through. Unset: Mercado Pago when its token is set, else Stripe.
  gateway: (env.PAGAMENTO_GATEWAY === 'stripe' || env.PAGAMENTO_GATEWAY === 'mercadopago'
    ? env.PAGAMENTO_GATEWAY
    : env.MERCADOPAGO_ACCESS_TOKEN
      ? 'mercadopago'
      : 'stripe') as 'stripe' | 'mercadopago',
  // Uploaded gift photos (a Docker volume in production)
  uploadsDir: env.UPLOADS_DIR ?? join(import.meta.dirname, '..', 'uploads'),
  // Mail server config folder shared with docker-mailserver (mailboxes managed in the panel).
  // Empty = the E-mails tab shows that the mail server is not set up here.
  mail: {
    configDir: env.MAIL_CONFIG_DIR ?? '',
    domain: (env.MAIL_DOMAIN ?? '').trim().toLowerCase(),
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

// Mercado Pago only notifies and redirects to public HTTPS addresses: in production, refuse to start
// with a SITE_URL it can't reach rather than take orders that never get confirmed.
if (config.isProduction && config.gateway === 'mercadopago' && config.mercadoPago.accessToken && !config.siteUrl.startsWith('https://')) {
  throw new Error(`SITE_URL precisa ser público e em https para o Mercado Pago (está ${config.siteUrl}).`);
}
