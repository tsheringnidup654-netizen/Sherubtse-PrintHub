/**
 * Minimal CSRF protection (synchroniser token kept in the session).
 * Forms send a hidden `_csrf` field; fetch() calls send the `x-csrf-token` header.
 * Multipart (file upload) routes run multer first and then `verify` explicitly.
 */
const crypto = require('crypto');
const fs = require('fs');

function ensureToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function verify(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session.csrf || '';
  const ok = sent.length === expected.length && sent.length > 0 && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (ok) return next();
  if (req.file) fs.unlink(req.file.path, () => {}); // discard an upload that failed the check
  const wantsJson = (req.get('accept') || '').includes('application/json');
  if (wantsJson) return res.status(403).json({ ok: false, error: 'Invalid security token. Please refresh the page.' });
  return res.status(403).render('public/error', { title: 'Security check failed', code: 403, message: 'Your session security token is invalid or expired. Go back, refresh the page and try again.' });
}

/** Global guard: multipart bodies are not parsed yet, so those routes call verify() themselves. */
const guard = (req, res, next) => ((req.is('multipart/form-data')) ? next() : verify(req, res, next));

module.exports = { ensureToken, verify, guard };
