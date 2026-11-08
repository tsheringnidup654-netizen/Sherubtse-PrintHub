/**
 * Central, typed access to environment variables.
 * Every other module reads configuration from here, never from process.env directly.
 */
require('dotenv').config();

const bool = (value, fallback) =>
  value === undefined ? fallback : String(value).toLowerCase() === 'true';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'printhub',
    password: process.env.DB_PASSWORD || 'printhub123',
    database: process.env.DB_NAME || 'sherubtse_printhub',
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  secureCookies: bool(process.env.COOKIE_SECURE, false),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 20,
  emailDomain: (process.env.COLLEGE_EMAIL_DOMAIN || 'rub.edu.bt').toLowerCase(),
  requireCollegeEmail: bool(process.env.REQUIRE_COLLEGE_EMAIL, false),
  timezone: 'Asia/Thimphu',
  currency: 'Nu.',
};
