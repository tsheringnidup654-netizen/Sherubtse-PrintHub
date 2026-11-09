/** Student: customise a print job, cart, checkout, order list, tracking, receipts, cancellation. */
const QRCode = require('qrcode');
const Service = require('../models/Service');
const Cart = require('../models/Cart');
const Document = require('../models/Document');
const Order = require('../models/Order');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const Feedback = require('../models/Feedback');
const C = require('../config/constants');
const { calculateItem, urgentFee, round2 } = require('../utils/pricing');
const { parseItemOptions, clean, toInt } = require('../utils/helpers');
const { estimateProcessing } = require('../utils/estimate');
const { fromBhutanLocal, toInputParts, fmtFull } = require('../utils/time');
const { buildInvoice } = require('../utils/invoice');
const { refreshSinglePageDocuments } = require('../utils/documentPageCount');

const baseUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

/** Re-price cart rows from the CURRENT service prices (never trust stored/browser prices). */
function priceLines(rows, ctx) {
  return rows.map((r) => {
    const calc = calculateItem(r, r, ctx);
    return { ...r, ...calc, line_total: calc.total };
  });
}

/* ---------------------------------------------------------- customise */
exports.customize = async (req, res) => {
  const [services, userDocuments] = await Promise.all([Service.listActive(), Document.listByUser(req.user.id)]);
  const documents = await refreshSinglePageDocuments(userDocuments, req.user.id, Document.setPages);
  const editing = req.query.edit ? await Cart.find(req.user.id, toInt(req.query.edit)) : null;
  let service = null;
  if (editing) service = services.find((s) => s.id === editing.service_id);
  else if (req.query.service) service = services.find((s) => s.slug === req.query.service);
  const documentId = toInt(req.query.document);
  const selectedDocument = documents.find((document) => document.id === documentId);
  const item = editing || { pages: selectedDocument && selectedDocument.page_count || 1, copies: 1, paper_size: 'A4', colour_mode: 'bw', sided: 'single', orientation: 'portrait', quality: 'normal', binding: 'none', document_id: documentId };
  res.render('student/customize', {
    title: 'Printing customization', section: 'customize', pageCss: ['customize'], pageJs: ['calculator'],
    services, documents, service: service || services[0], item, editing,
  });
};

exports.addToCart = async (req, res) => {
  const service = await Service.findById(toInt(req.body.service_id));
  if (!service || !service.is_active) { req.flash('danger', 'Please choose a valid service.'); return res.redirect('/student/customize'); }
  const { value, errors } = parseItemOptions(req.body, service);
  if (value.document_id && !(await Document.findOwned(value.document_id, req.user.id))) errors.push('Selected document was not found.');
  if (errors.length) { req.flash('danger', errors[0]); return res.redirect(`/student/customize?service=${service.slug}`); }
  value.service_id = service.id;
  const editId = toInt(req.body.edit_id);
  if (editId && (await Cart.find(req.user.id, editId))) { await Cart.update(req.user.id, editId, value); req.flash('success', 'Cart item updated.'); }
  else { await Cart.add(req.user.id, value); req.flash('success', `${service.name} added to your cart.`); }
  res.redirect('/student/cart');
};

/* --------------------------------------------------------------- cart */
exports.cart = async (req, res) => {
  const [rows, settings, services] = await Promise.all([Cart.list(req.user.id), Setting.getAll(), Service.listAll()]);
  const lines = priceLines(rows, { settings, services });
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  res.render('student/cart', { title: 'Shopping cart', section: 'cart', pageCss: ['customize'], lines, subtotal });
};

exports.removeFromCart = async (req, res) => {
  await Cart.remove(req.user.id, toInt(req.params.id));
  req.flash('success', 'Item removed from your cart.');
  res.redirect('/student/cart');
};

/* ----------------------------------------------------------- checkout */
async function checkoutData(req) {
  const [rows, settings, services, queue] = await Promise.all([Cart.list(req.user.id), Setting.getAll(), Service.listAll(), Order.queuePages()]);
  const lines = priceLines(rows, { settings, services });
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const pages = lines.reduce((s, l) => s + l.pages * l.copies, 0);
  return { lines, subtotal, settings, services, estimate: estimateProcessing(queue, pages, settings.pages_per_hour), methods: settings.payment_methods.filter((m) => m.enabled) };
}

exports.checkout = async (req, res) => {
  const data = await checkoutData(req);
  if (!data.lines.length) { req.flash('warning', 'Your cart is empty.'); return res.redirect('/student/services'); }
  const suggested = toInputParts(new Date(Date.now() + 24 * 3600 * 1000));
  res.render('student/checkout', {
    title: 'Checkout', section: 'cart', pageCss: ['customize'], pageJs: ['checkout'], ...data,
    urgentPct: Number(data.settings.urgent_surcharge_pct), urgentAmount: urgentFee(data.subtotal, data.settings),
    minDate: toInputParts(new Date()).date, form: { date: suggested.date, time: '14:00', method: data.methods[0] && data.methods[0].code },
  });
};

exports.placeOrder = async (req, res) => {
  const data = await checkoutData(req);
  if (!data.lines.length) { req.flash('warning', 'Your cart is empty.'); return res.redirect('/student/cart'); }
  const urgent = req.body.urgent === 'on';
  const method = data.methods.find((m) => m.code === req.body.payment_method);
  const deadline = fromBhutanLocal(req.body.deadline_date, req.body.deadline_time);
  const reference = clean(req.body.payment_reference, 80);
  const errors = [];
  const leadMin = urgent ? Math.min(30, Number(data.settings.min_lead_minutes)) : Number(data.settings.min_lead_minutes);

  if (!deadline) errors.push('Please choose a collection date and time.');
  else if (deadline.getTime() < Date.now() + leadMin * 60000) errors.push(`The collection time must be at least ${leadMin} minutes from now.`);
  else if (deadline.getTime() > Date.now() + 90 * 24 * 3600 * 1000) errors.push('The collection date cannot be more than 90 days away.');
  if (!method) errors.push('Please choose a payment method.');
  else if (method.needs_reference && reference.length < 4) errors.push(`Please enter the transaction reference for ${method.label}.`);
  if (data.lines.some((l) => !l.service_active)) errors.push('A service in your cart is no longer available. Please remove it and try again.');

  if (errors.length) {
    const suggested = toInputParts(new Date(Date.now() + 24 * 3600 * 1000));
    return res.status(400).render('student/checkout', {
      title: 'Checkout', section: 'cart', pageCss: ['customize'], pageJs: ['checkout'], ...data, errors,
      urgentPct: Number(data.settings.urgent_surcharge_pct), urgentAmount: urgentFee(data.subtotal, data.settings),
      minDate: toInputParts(new Date()).date,
      form: { date: req.body.deadline_date || suggested.date, time: req.body.deadline_time || '14:00', method: req.body.payment_method, reference, urgent, notes: req.body.notes },
    });
  }

  const fee = urgent ? urgentFee(data.subtotal, data.settings) : 0;
  const order = await Order.create({
    userId: req.user.id, subtotal: data.subtotal, urgentFee: fee, total: round2(data.subtotal + fee), deadline, urgent,
    notes: clean(req.body.notes, 500), method: method.code, reference,
    lines: data.lines.map((l) => ({ ...l, service_name: l.service_name })),
  });
  req.flash('success', `Order ${order.order_number} placed! Collection deadline: ${fmtFull(deadline)}.`);
  res.redirect(`/student/orders/${order.id}`);
};

/* ------------------------------------------------------------- orders */
exports.list = async (req, res) => {
  const f = { q: clean(req.query.q, 40), status: C.ORDER_STATUSES.includes(req.query.status) ? req.query.status : '', service: toInt(req.query.service) || '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '', to: /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '',
    deadline: ['upcoming', 'today', 'urgent', 'overdue'].includes(req.query.deadline) ? req.query.deadline : '' };
  const [orders, services] = await Promise.all([Order.listForUser(req.user.id, f), Service.listAll()]);
  res.render('student/orders', { title: 'My orders', section: 'orders', orders, services, f });
};

/** Loads an order only if it belongs to the logged-in student. */
async function ownOrder(req, res) {
  const order = await Order.findById(toInt(req.params.id));
  if (!order || order.user_id !== req.user.id) {
    res.status(404).render('public/error', { title: 'Order not found', code: 404, message: 'We could not find that order in your account.' });
    return null;
  }
  return order;
}

exports.detail = async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  const [items, history, payment, collection, feedback] = await Promise.all([Order.items(order.id), Order.history(order.id), Order.payment(order.id), Order.collection(order.id), Feedback.forOrder(order.id)]);
  res.render('student/order-detail', {
    title: `Order ${order.order_number}`, section: 'orders', pageCss: ['tracking'], order, items, history, payment, collection, feedback,
    canCancel: C.STUDENT_CANCELLABLE.includes(order.status),
  });
};

exports.cancel = async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  if (!C.STUDENT_CANCELLABLE.includes(order.status)) { req.flash('danger', 'Printing has already started, so this order can no longer be cancelled. Please contact the print shop.'); return res.redirect(`/student/orders/${order.id}`); }
  await Order.cancel(order, req.user.id);
  req.flash('success', `Order ${order.order_number} was cancelled.`);
  res.redirect(`/student/orders/${order.id}`);
};

exports.qr = async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  res.type('png').set('Cache-Control', 'private, max-age=60');
  res.send(await QRCode.toBuffer(`${baseUrl(req)}/admin/collect/${order.qr_token}`, { margin: 1, width: 280, color: { dark: '#0b2a5b' } }));
};

exports.receipt = async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  await sendInvoice(req, res, order, req.user);
};

/** Shared with the admin controller. */
async function sendInvoice(req, res, order, student) {
  const [items, payment, settings] = await Promise.all([Order.items(order.id), Order.payment(order.id), Setting.getAll()]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${order.order_number}.pdf"`);
  await buildInvoice({ order, items, payment, student, settings, qrUrl: `${baseUrl(req)}/admin/collect/${order.qr_token}` }, res);
}
exports.sendInvoice = sendInvoice;
