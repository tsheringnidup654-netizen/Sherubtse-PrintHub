/** Student area: dashboard, profile, notifications, history, feedback. */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const Stats = require('../models/Stats');
const Feedback = require('../models/Feedback');
const C = require('../config/constants');
const { clean, strongPassword, toInt } = require('../utils/helpers');
const { signatureMatches } = require('../utils/fileCheck');

exports.dashboard = async (req, res) => {
  const uid = req.user.id;
  const [orders, summary, notifications] = await Promise.all([Order.listForUser(uid), Stats.studentSummary(uid), Notification.list(uid, 5)]);
  const live = orders.filter((o) => C.ACTIVE_STATUSES.includes(o.status)).sort((a, b) => a.collection_deadline - b.collection_deadline);
  res.render('student/dashboard', {
    title: 'My dashboard', section: 'dashboard', live, recent: orders.slice(0, 5), summary, notifications,
    counts: { active: live.length, ready: orders.filter((o) => o.status === 'ready').length },
  });
};

/* ------------------------------------------------------------- profile */
exports.showProfile = (req, res) => res.render('student/profile', { title: 'My profile', section: 'profile', form: req.user });

exports.updateProfile = async (req, res) => {
  const f = { full_name: clean(req.body.full_name, 120), phone: clean(req.body.phone, 20), programme: clean(req.body.programme, 120) };
  const errors = [];
  if (f.full_name.length < 3) errors.push('Please enter your full name.');
  if (f.phone && !/^[+\d][\d\s-]{6,18}$/.test(f.phone)) errors.push('Please enter a valid phone number.');
  if (errors.length) return res.status(400).render('student/profile', { title: 'My profile', section: 'profile', errors, form: { ...req.user, ...f } });
  await User.updateProfile(req.user.id, f);
  req.flash('success', 'Profile updated.');
  res.redirect('/student/profile');
};

exports.updateAvatar = async (req, res) => {
  const fail = (msg) => { if (req.file) fs.unlink(req.file.path, () => {}); req.flash('danger', msg); return res.redirect('/student/profile'); };
  if (req.uploadError) return fail(req.uploadError);
  if (!req.file) return fail('Please choose an image first.');
  const ext = path.extname(req.file.filename).toLowerCase();
  if (!signatureMatches(req.file.path, ext)) return fail('That file is not a valid image.');
  if (req.user.avatar) fs.unlink(path.join(C.AVATAR_DIR, req.user.avatar), () => {});
  await User.updateAvatar(req.user.id, req.file.filename);
  req.flash('success', 'Profile picture updated.');
  res.redirect('/student/profile');
};

exports.changePassword = async (req, res) => {
  const { current_password: cur, new_password: pw, confirm_password: conf } = req.body;
  const errors = [];
  if (!(await bcrypt.compare(String(cur || ''), await User.getHash(req.user.id)))) errors.push('Your current password is incorrect.');
  if (!strongPassword(pw)) errors.push('New password must be at least 8 characters and include a letter and a number.');
  if (pw !== conf) errors.push('New passwords do not match.');
  if (errors.length) return res.status(400).render('student/profile', { title: 'My profile', section: 'profile', errors, form: req.user });
  await User.updatePassword(req.user.id, await bcrypt.hash(pw, 10));
  req.flash('success', 'Password changed successfully.');
  res.redirect('/student/profile');
};

/* -------------------------------------------------------- notifications */
// These handlers are shared by students and admins (each only ever sees their own rows).
const base = (req) => (req.user.role === 'admin' ? '/admin' : '/student');
exports.notifications = async (req, res) => {
  res.render('student/notifications', { title: 'Notifications', section: 'notifications', base: base(req), items: await Notification.list(req.user.id) });
};
exports.readNotification = async (req, res) => {
  await Notification.markRead(req.user.id, toInt(req.params.id));
  const next = req.body.next || '';
  res.redirect(next.startsWith(`${base(req)}/`) ? next : `${base(req)}/notifications`);
};
exports.readAll = async (req, res) => { await Notification.markAllRead(req.user.id); res.redirect(`${base(req)}/notifications`); };
exports.unreadCount = async (req, res) => res.json({ count: await Notification.unreadCount(req.user.id) });

/* -------------------------------------------------------------- history */
exports.history = async (req, res) => {
  const [summary, orders] = await Promise.all([Stats.studentSummary(req.user.id), Order.listForUser(req.user.id)]);
  res.render('student/history', { title: 'Printing history', section: 'history', pageJs: ['charts'], summary, orders });
};

/* ------------------------------------------------------------- feedback */
exports.showFeedback = async (req, res) => {
  const [pending, mine] = await Promise.all([Feedback.pendingForUser(req.user.id), Feedback.listForUser(req.user.id)]);
  res.render('student/feedback', { title: 'Feedback & ratings', section: 'feedback', pending, mine, selected: toInt(req.query.order) });
};

exports.submitFeedback = async (req, res) => {
  const orderId = toInt(req.body.order_id);
  const rating = toInt(req.body.rating);
  const order = orderId ? await Order.findById(orderId) : null;
  if (!order || order.user_id !== req.user.id || order.status !== 'collected') { req.flash('danger', 'You can only review your own collected orders.'); return res.redirect('/student/feedback'); }
  if (!rating || rating < 1 || rating > 5) { req.flash('danger', 'Please choose a rating from 1 to 5 stars.'); return res.redirect(`/student/feedback?order=${orderId}`); }
  if (await Feedback.forOrder(orderId)) { req.flash('warning', 'You have already reviewed this order.'); return res.redirect('/student/feedback'); }
  await Feedback.create({ user_id: req.user.id, order_id: orderId, rating, comment: clean(req.body.comment, 1000) });
  req.flash('success', 'Thank you for your feedback!');
  res.redirect('/student/feedback');
};
