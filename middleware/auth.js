/**
 * Authentication & role-based authorisation middleware.
 */
const crypto = require('crypto');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Notification = require('../models/Notification');

/** Loads the logged-in user (fresh from the DB) and the counters shown in the navbar. */
async function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.cartCount = 0;
  res.locals.unreadCount = 0;
  if (req.path === '/') return next();
  if (!req.session.userId) return next();
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.is_active) {
      return req.session.destroy(() => res.redirect('/login'));
    }
    req.user = user;
    res.locals.user = user;
    const [unreadCount, cartCount] = await Promise.all([
      Notification.unreadCount(user.id),
      user.role === 'student' ? Cart.count(user.id) : 0,
    ]);
    res.locals.unreadCount = unreadCount;
    res.locals.cartCount = cartCount;
    next();
  } catch (err) { next(err); }
}

function forceGuest(req, res, next) {
  if (!req.session.userId) return next();

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.user = null;
    res.locals.user = null;
    res.locals.cartCount = 0;
    res.locals.unreadCount = 0;
    res.locals.csrfToken = req.session.csrf;
    next();
  });
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  req.flash('warning', 'Please log in to continue.');
  res.redirect('/login');
}

/** Usage: requireRole('admin') - responds 403 when the logged-in user has a different role. */
const requireRole = (role) => (req, res, next) => {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role !== role) {
    return res.status(403).render('public/error', { title: 'Access denied', code: 403, message: 'You do not have permission to view this page.' });
  }
  next();
};

const redirectIfAuth = (req, res, next) => {
  if (!req.user) return next();
  res.redirect(req.user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
};

module.exports = { attachUser, forceGuest, requireLogin, requireStudent: requireRole('student'), requireAdmin: requireRole('admin'), redirectIfAuth };
