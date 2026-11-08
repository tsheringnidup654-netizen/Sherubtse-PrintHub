/**
 * Server-side validation. The browser performs the same checks for convenience,
 * but nothing is trusted until it passes through here.
 */
const config = require('../config/env');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const clean = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const toInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

function validateRegistration(body) {
  const errors = [];
  const data = {
    full_name: clean(body.full_name, 100),
    email: clean(body.email, 150).toLowerCase(),
    student_no: clean(body.student_no, 30),
    department: clean(body.department, 100),
    phone: clean(body.phone, 20),
    role: pick(body.role, ['student', 'staff'], 'student'),
  };
  if (data.full_name.length < 3) errors.push('Please enter your full name.');
  if (!EMAIL_RE.test(data.email)) errors.push('Please enter a valid email address.');
  else if (config.requireCollegeEmail && !data.email.endsWith(`@${config.emailDomain}`)) {
    errors.push(`Please use your college email (@${config.emailDomain}).`);
  }
  if (data.phone && !/^[0-9+\-\s]{7,20}$/.test(data.phone)) errors.push('Phone number looks invalid.');
  const pwError = validatePassword(body.password);
  if (pwError) errors.push(pwError);
  if (body.password !== body.confirm_password) errors.push('Passwords do not match.');
  return { errors, data };
}

/** Normalise one print item coming from the customise form (never trust raw values). */
function normalizeItem(body) {
  const item = {
    service_id: toInt(body.service_id, 0),
    document_id: toInt(body.document_id, 0) || null,
    pages: Math.min(Math.max(toInt(body.pages, 1), 1), 10000),
    copies: Math.min(Math.max(toInt(body.copies, 1), 1), 1000),
    paper_size: pick(body.paper_size, ['A4', 'A3'], 'A4'),
    colour_mode: pick(body.colour_mode, ['bw', 'colour'], 'bw'),
    sides: pick(body.sides, ['single', 'double'], 'single'),
    orientation: pick(body.orientation, ['portrait', 'landscape'], 'portrait'),
    quality: pick(body.quality, ['normal', 'high'], 'normal'),
    binding_service_id: toInt(body.binding_service_id, 0) || null,
    instructions: clean(body.instructions, 1000),
  };
  return item;
}

module.exports = { validateRegistration, validatePassword, normalizeItem, clean, toInt, pick, EMAIL_RE };
