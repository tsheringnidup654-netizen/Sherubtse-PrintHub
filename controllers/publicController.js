const Service = require('../models/Service');
const Setting = require('../models/Setting');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const db = require('../config/db');
const Order = require('../models/Order');
const { calculateItem, urgentFee } = require('../utils/pricing');
const { parseItemOptions, clean, isEmail } = require('../utils/helpers');
const { estimateProcessing } = require('../utils/estimate');

exports.home = async (req, res) => {
  const [services, students, orders, rating] = await Promise.all([
    Service.listActive(),
    User.countStudents(),
    db.query("SELECT COUNT(*)::int AS n FROM orders WHERE status='collected'"),
    Feedback.summary(),
  ]);
  res.render('public/home', {
    title: 'Online Printing & Photocopy E-Store', pageCss: ['home'], services: services.slice(0, 8),
    stats: { students, collected: orders.rows[0].n, rating: rating.avg, reviews: rating.n },
  });
};

exports.about = async (req, res) => res.render('public/about', { title: 'About us', pageCss: ['home'], settings: await Setting.getAll() });

exports.services = async (req, res) => {
  const q = clean(req.query.q, 60);
  const category = clean(req.query.category, 60);
  const [services, categories, settings] = await Promise.all([Service.listActive({ q, category }), Service.categories(), Setting.getAll()]);
  const all = await Service.listAll();
  res.render('public/services', {
    title: 'Printing services', pageCss: ['services', 'customize'], pageJs: ['calculator'],
    services, categories, q, category, settings, allServices: all.filter((s) => s.is_active),
  });
};

exports.showContact = async (req, res) => res.render('public/contact', { title: 'Contact us', pageCss: ['home'], settings: await Setting.getAll(), form: {} });

exports.contact = async (req, res) => {
  const f = { name: clean(req.body.name, 120), email: clean(req.body.email, 160), subject: clean(req.body.subject, 160), message: clean(req.body.message, 2000) };
  const errors = [];
  if (f.name.length < 2) errors.push('Please enter your name.');
  if (!isEmail(f.email)) errors.push('Please enter a valid e-mail.');
  if (f.subject.length < 3) errors.push('Please enter a subject.');
  if (f.message.length < 10) errors.push('Your message is too short.');
  if (errors.length) return res.status(400).render('public/contact', { title: 'Contact us', pageCss: ['home'], settings: await Setting.getAll(), errors, form: f });
  await Feedback.addMessage(f);
  req.flash('success', 'Thank you! Your message has been sent to the print shop.');
  res.redirect('/contact');
};

/**
 * JSON price calculator used by the public calculator, the customise page and checkout.
 * GET /api/price?service=<id>&pages=..&copies=..&paper_size=..&colour_mode=..&sided=..&quality=..&binding=..
 */
exports.price = async (req, res) => {
  const service = await Service.findById(Number(req.query.service));
  if (!service || !service.is_active) return res.status(404).json({ ok: false, error: 'Service not found.' });
  const { value, errors } = parseItemOptions(req.query, service);
  if (errors.length) return res.status(422).json({ ok: false, error: errors[0] });
  const [settings, services, queue] = await Promise.all([Setting.getAll(), Service.listAll(), Order.queuePages()]);
  const calc = calculateItem(service, value, { settings, services });
  const urgent = urgentFee(calc.total, settings);
  const est = estimateProcessing(queue, value.pages * value.copies, settings.pages_per_hour);
  res.json({
    ok: true, ...calc, urgentFee: urgent, urgentPct: Number(settings.urgent_surcharge_pct),
    estimate: { label: est.label, workload: est.workload },
    supports: { colour: service.colour_price != null, print: service.pricing_type === 'print' },
  });
};
