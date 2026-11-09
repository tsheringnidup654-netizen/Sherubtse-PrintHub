/** Administrator area. */
const Stats = require('../models/Stats');
const User = require('../models/User');
const Service = require('../models/Service');
const Order = require('../models/Order');
const Document = require('../models/Document');
const Payment = require('../models/Payment');
const Feedback = require('../models/Feedback');
const Setting = require('../models/Setting');
const C = require('../config/constants');
const { send: sendDocument } = require('./documentController');
const { sendInvoice } = require('./orderController');
const { clean, toInt } = require('../utils/helpers');
const { fromBhutanLocal, toInputParts } = require('../utils/time');
const { urgentFee } = require('../utils/pricing');

const render = (res, view, title, section, extra = {}) => res.render(`admin/${view}`, { title, section, ...extra });
const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/* ------------------------------------------------------------ dashboard */
exports.dashboard = async (req, res) => {
  const [stats, urgent, recent] = await Promise.all([
    Stats.adminDashboard(),
    Order.listAll({ deadline: 'urgent' }, 'deadline'),
    Order.listAll({}, 'newest'),
  ]);
  render(res, 'dashboard', 'Admin dashboard', 'dashboard', { pageJs: ['charts'], stats, urgent: urgent.slice(0, 5), recent: recent.slice(0, 6) });
};

/* ------------------------------------------------------------- students */
exports.students = async (req, res) => {
  const q = clean(req.query.q, 60);
  render(res, 'students', 'Manage students', 'students', { students: await User.listStudents(q), q });
};
exports.toggleStudent = async (req, res) => {
  await User.setActive(toInt(req.params.id), req.body.active === 'true');
  req.flash('success', req.body.active === 'true' ? 'Student account activated.' : 'Student account deactivated.');
  res.redirect('/admin/students');
};

/* ------------------------------------------------------------- services */
exports.services = async (req, res) => {
  const [services, categories, settings] = await Promise.all([Service.listAll(), Service.categories(), Setting.getAll()]);
  render(res, 'services', 'Manage services & prices', 'services', { services, categories, settings, pageJs: ['admin'] });
};

function parseService(body, categories) {
  const errors = [];
  const d = {
    category_id: toInt(body.category_id), name: clean(body.name, 100), description: clean(body.description, 600), icon: clean(body.icon, 50) || 'bi-printer',
    pricing_type: ['print', 'per_page_flat', 'per_set'].includes(body.pricing_type) ? body.pricing_type : 'print',
    base_price: Number(body.base_price), colour_price: body.colour_price === '' || body.colour_price == null ? null : Number(body.colour_price),
    unit_label: clean(body.unit_label, 30) || 'per page', options_text: clean(body.options_text, 255) || null, sort_order: toInt(body.sort_order, 0),
  };
  if (d.name.length < 3) errors.push('Service name is required.');
  if (d.description.length < 10) errors.push('Please add a short description.');
  if (!categories.some((c) => c.id === d.category_id)) errors.push('Choose a category.');
  if (!(d.base_price >= 0) || d.base_price > 100000) errors.push('Price must be a valid positive number.');
  if (d.colour_price !== null && !(d.colour_price >= 0)) errors.push('Colour price must be a valid positive number.');
  if (!/^bi-[a-z0-9-]+$/.test(d.icon)) d.icon = 'bi-printer';
  return { d, errors };
}

exports.saveService = async (req, res) => {
  const categories = await Service.categories();
  const { d, errors } = parseService(req.body, categories);
  if (errors.length) { req.flash('danger', errors[0]); return res.redirect('/admin/services'); }
  const id = toInt(req.params.id);
  try {
    if (id) { const old = await Service.findById(id); if (!old) throw new Error('missing'); await Service.update(id, { ...d, slug: old.slug }); req.flash('success', 'Service updated.'); }
    else { await Service.create({ ...d, slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }); req.flash('success', 'Service created.'); }
  } catch (e) {
    req.flash('danger', e.code === '23505' ? 'A service with that name already exists.' : 'Could not save the service.');
  }
  res.redirect('/admin/services');
};

exports.toggleService = async (req, res) => {
  await Service.setActive(toInt(req.params.id), req.body.active === 'true');
  req.flash('success', 'Service visibility updated.');
  res.redirect('/admin/services');
};

exports.saveSettings = async (req, res) => {
  const rules = { a3_multiplier: [1, 10], hq_multiplier: [1, 5], duplex_discount: [0, 90], urgent_surcharge_pct: [0, 300], pages_per_hour: [10, 10000], min_lead_minutes: [0, 1440] };
  for (const [k, [min, max]] of Object.entries(rules)) {
    const v = Number(req.body[k]);
    if (!(v >= min && v <= max)) { req.flash('danger', `Invalid value for ${k.replace(/_/g, ' ')} (allowed ${min}-${max}).`); return res.redirect('/admin/services'); }
    await Setting.set(k, String(v));
  }
  for (const k of ['shop_location', 'shop_phone', 'shop_email', 'shop_hours']) if (req.body[k] !== undefined) await Setting.set(k, clean(req.body[k], 160));
  req.flash('success', 'Pricing rules and shop settings saved.');
  res.redirect('/admin/services');
};

/* --------------------------------------------------------------- orders */
exports.orders = async (req, res) => {
  const f = { q: clean(req.query.q, 40), status: C.ORDER_STATUSES.includes(req.query.status) ? req.query.status : '', service: toInt(req.query.service) || '',
    from: dateOk(req.query.from) ? req.query.from : '', to: dateOk(req.query.to) ? req.query.to : '',
    deadline: ['upcoming', 'today', 'urgent', 'overdue'].includes(req.query.deadline) ? req.query.deadline : '' };
  const sort = req.query.sort === 'deadline' ? 'deadline' : 'newest';
  const [orders, services] = await Promise.all([Order.listAll(f, sort), Service.listAll()]);
  render(res, 'orders', 'Manage orders', 'orders', { orders, services, f, sort });
};

async function loadOrder(req, res) {
  const order = await Order.findById(toInt(req.params.id));
  if (!order) { res.status(404).render('public/error', { title: 'Not found', code: 404, message: 'Order not found.' }); return null; }
  return order;
}

exports.orderDetail = async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const [items, history, payment, collection] = await Promise.all([Order.items(order.id), Order.history(order.id), Order.payment(order.id), Order.collection(order.id)]);
  const est = order.estimated_completion ? toInputParts(order.estimated_completion) : { date: '', time: '' };
  render(res, 'order-detail', `Order ${order.order_number}`, 'orders', {
    pageCss: ['tracking'], order, items, history, payment, collection, next: C.TRANSITIONS[order.status], est, dl: toInputParts(order.collection_deadline),
  });
};

exports.updateStatus = async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const status = req.body.status;
  const note = clean(req.body.note, 300);
  const fromDashboard = req.body.return_to === '/admin/dashboard';
  const back = fromDashboard ? '/admin/dashboard' : `/admin/orders/${order.id}`;
  if (fromDashboard && !['accepted', 'rejected'].includes(status)) {
    req.flash('danger', 'The dashboard supports accepting or rejecting pending orders.');
    return res.redirect(back);
  }
  if (!C.TRANSITIONS[order.status].includes(status)) { req.flash('danger', `An order that is "${C.STATUS_LABELS[order.status]}" cannot move to "${C.STATUS_LABELS[status] || status}".`); return res.redirect(back); }
  if (status === 'rejected' && note.length < 3) { req.flash('danger', 'Please give the student a reason for rejecting the order.'); return res.redirect(back); }
  await Order.setStatus(order, status, req.user.id, note);
  req.flash('success', `Order ${order.order_number} is now "${C.STATUS_LABELS[status]}". The student was notified.`);
  res.redirect(back);
};

exports.decideUrgent = async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  if (order.urgent_status !== 'requested') { req.flash('warning', 'There is no pending urgent request on this order.'); return res.redirect(`/admin/orders/${order.id}`); }
  const approve = req.body.decision === 'approve';
  await Order.decideUrgent(order, approve, req.user.id, { urgentFee: urgentFee(order.subtotal, await Setting.getAll()) });
  req.flash('success', approve ? 'Urgent printing approved.' : 'Urgent request declined and the urgent fee was removed.');
  res.redirect(`/admin/orders/${order.id}`);
};

/** Estimated completion, collection deadline and delay notices. */
exports.schedule = async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  const back = req.body.back === 'deadlines' ? '/admin/deadlines' : `/admin/orders/${order.id}`;
  if (!C.ACTIVE_STATUSES.includes(order.status)) { req.flash('warning', 'Only live orders can be rescheduled.'); return res.redirect(back); }
  const change = {};
  if (req.body.est_date || req.body.est_time) {
    const est = fromBhutanLocal(req.body.est_date, req.body.est_time);
    if (!est) { req.flash('danger', 'Enter both a date and a time for the estimated completion.'); return res.redirect(back); }
    change.estimated = est;
  } else if (req.body.clear_estimate === 'on') change.estimated = null;
  if (req.body.deadline_date || req.body.deadline_time) {
    const dl = fromBhutanLocal(req.body.deadline_date, req.body.deadline_time);
    if (!dl || dl.getTime() < Date.now()) { req.flash('danger', 'The new collection deadline must be a valid time in the future.'); return res.redirect(back); }
    change.deadline = dl;
  }
  const note = clean(req.body.delay_note, 300);
  if (req.body.notify_delay === 'on') {
    if (note.length < 3) { req.flash('danger', 'Please describe the delay for the student.'); return res.redirect(back); }
    change.delayed = true; change.delayNote = note;
  } else if (req.body.clear_delay === 'on') change.delayed = false;
  if (!Object.keys(change).length) { req.flash('warning', 'Nothing to update.'); return res.redirect(back); }
  await Order.schedule(order, change, req.user.id);
  req.flash('success', 'Schedule updated and the student has been notified.');
  res.redirect(back);
};

exports.invoice = async (req, res) => {
  const order = await loadOrder(req, res);
  if (!order) return;
  await sendInvoice(req, res, order, await User.findById(order.user_id));
};

/* ------------------------------------------------------------ documents */
exports.documents = async (req, res) => {
  const q = clean(req.query.q, 60);
  render(res, 'documents', 'Uploaded documents', 'documents', { documents: await Document.listAll(q), q });
};
exports.documentFile = async (req, res, next) => {
  const doc = await Document.findById(toInt(req.params.id));
  if (!doc) return res.status(404).render('public/error', { title: 'Not found', code: 404, message: 'Document not found.' });
  sendDocument(doc, res, next);
};

/* ------------------------------------------------------------ deadlines */
exports.deadlines = async (req, res) => {
  render(res, 'deadlines', 'Manage deadlines', 'deadlines', { orders: await Order.upcomingDeadlines() });
};

/* ------------------------------------------------------------- payments */
exports.payments = async (req, res) => {
  const status = ['pending', 'paid', 'failed', 'refunded'].includes(req.query.status) ? req.query.status : '';
  const [payments, totals, settings] = await Promise.all([Payment.listAll(status), Payment.totals(), Setting.getAll()]);
  render(res, 'payments', 'Manage payments', 'payments', { payments, totals, methods: settings.payment_methods, status });
};
exports.updatePayment = async (req, res) => {
  const status = req.body.status;
  if (!['pending', 'paid', 'failed', 'refunded'].includes(status)) { req.flash('danger', 'Invalid payment status.'); return res.redirect('/admin/payments'); }
  await Payment.setStatus(toInt(req.params.id), status, clean(req.body.reference, 80));
  req.flash('success', 'Payment updated.');
  res.redirect('/admin/payments');
};
exports.savePaymentMethods = async (req, res) => {
  const settings = await Setting.getAll();
  const methods = settings.payment_methods.map((m) => ({ ...m, enabled: req.body[`enabled_${m.code}`] === 'on', label: clean(req.body[`label_${m.code}`], 60) || m.label }));
  if (!methods.some((m) => m.enabled)) { req.flash('danger', 'At least one payment method must stay enabled.'); return res.redirect('/admin/payments'); }
  await Setting.set('payment_methods', methods);
  req.flash('success', 'Payment methods saved.');
  res.redirect('/admin/payments');
};

/* ------------------------------------------------------------- feedback */
exports.feedback = async (req, res) => {
  const [items, summary, messages] = await Promise.all([Feedback.listAll(), Feedback.summary(), Feedback.messages()]);
  render(res, 'feedback', 'Manage feedback', 'feedback', { items, summary, messages });
};
exports.moderateFeedback = async (req, res) => {
  await Feedback.moderate(toInt(req.params.id), req.body.visible === 'true', clean(req.body.reply, 500));
  req.flash('success', 'Feedback updated.');
  res.redirect('/admin/feedback');
};
exports.readMessage = async (req, res) => { await Feedback.markMessageRead(toInt(req.params.id)); res.redirect('/admin/feedback#messages'); };

/* -------------------------------------------------------------- reports */
function range(q) {
  const today = toInputParts(new Date()).date;
  const monthAgo = toInputParts(new Date(Date.now() - 29 * 86400000)).date;
  const from = dateOk(q.from) ? q.from : monthAgo;
  const to = dateOk(q.to) ? q.to : today;
  return from <= to ? { from, to } : { from: to, to: from };
}
exports.reports = async (req, res) => {
  const { from, to } = range(req.query);
  render(res, 'reports', 'Reports & analytics', 'reports', { pageJs: ['charts'], from, to, report: await Stats.report(from, to) });
};
exports.exportCsv = async (req, res) => {
  const { from, to } = range(req.query);
  const orders = await Order.listAll({ from, to }, 'newest');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Order', 'Student', 'Student ID', 'Services', 'Status', 'Payment', 'Total (Nu)', 'Placed (UTC)', 'Deadline (UTC)'].join(',')];
  orders.forEach((o) => lines.push([o.order_number, o.full_name, o.student_id, o.services, o.status, o.payment_status, o.total, o.created_at.toISOString(), o.collection_deadline.toISOString()].map(esc).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="printhub-report-${from}_to_${to}.csv"`);
  res.send(lines.join('\n'));
};

/* ------------------------------------------------- QR / manual collection */
exports.collectHome = async (req, res) => {
  const q = clean(req.query.q, 200);
  if (q) {
    const tail = q.split('/').pop().trim();
    const byToken = await Order.findByToken(tail);
    if (byToken) return res.redirect(`/admin/collect/${byToken.qr_token}`);
    const byNumber = await Order.findByNumber(q.toUpperCase());
    if (byNumber) return res.redirect(`/admin/collect/${byNumber.qr_token}?via=manual`);
    req.flash('danger', 'No order matches that order number or QR code.');
    return res.redirect('/admin/collect');
  }
  render(res, 'collect', 'Collect an order', 'collect', { pageCss: ['tracking'], pageJs: ['collect'], order: null });
};

exports.collectOrder = async (req, res) => {
  const order = await Order.findByToken(clean(req.params.token, 64));
  if (!order) return res.status(404).render('public/error', { title: 'Not found', code: 404, message: 'This QR code does not match any order.' });
  const [items, collection] = await Promise.all([Order.items(order.id), Order.collection(order.id)]);
  render(res, 'collect', 'Collect an order', 'collect', { order, items, collection, via: req.query.via === 'manual' ? 'manual' : 'qr', pageCss: ['tracking'], pageJs: ['collect'] });
};

exports.collectConfirm = async (req, res) => {
  const order = await Order.findByToken(clean(req.params.token, 64));
  if (!order) return res.status(404).render('public/error', { title: 'Not found', code: 404, message: 'Order not found.' });
  if (order.status !== 'ready') { req.flash('danger', `Order ${order.order_number} is "${C.STATUS_LABELS[order.status]}" - only orders that are Ready for Collection can be handed over.`); return res.redirect(`/admin/collect/${order.qr_token}`); }
  await Order.collect(order, req.user.id, req.body.via === 'manual' ? 'manual' : 'qr', clean(req.body.note, 200));
  req.flash('success', `Order ${order.order_number} handed over to ${order.full_name}.`);
  res.redirect(`/admin/collect/${order.qr_token}`);
};
