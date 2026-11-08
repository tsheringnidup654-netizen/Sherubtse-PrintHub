/** 404 and global error handling. */
const C = require('../config/constants');
const { viewHelpers } = require('../utils/helpers');

/**
 * Locals every page needs. The normal `locals` middleware may not have run yet when the error
 * happened early (for example the database/session store was unreachable), so the error page
 * supplies safe defaults itself instead of crashing a second time.
 */
const safeLocals = (res) => ({
  ...viewHelpers, APP_NAME: C.APP_NAME, TAGLINE: C.TAGLINE, user: null, cartCount: 0, unreadCount: 0, flash: null,
  csrfToken: '', currentPath: '', serverNow: Date.now(), pageCss: [], pageJs: [], errors: [], form: {},
  collegeDomain: process.env.COLLEGE_EMAIL_DOMAIN || 'rub.edu.bt', enforceCollegeEmail: false, ...res.locals,
});
const notFound = (req, res) => {
  res.status(404).render('public/error', { ...safeLocals(res), title: 'Page not found', code: 404, message: 'The page you are looking for does not exist.' });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  if (res.headersSent) return next(err);
  const message = process.env.NODE_ENV === 'production' ? 'Something went wrong on our side. Please try again.' : err.message;
  if ((req.get('accept') || '').includes('application/json')) return res.status(500).json({ ok: false, error: message });
  res.status(500).render('public/error', { ...safeLocals(res), title: 'Server error', code: 500, message });
};

module.exports = { notFound, errorHandler };
