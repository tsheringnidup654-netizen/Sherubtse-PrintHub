/** Small shared helpers: validation, option sanitising, view formatters. */
const C = require('../config/constants');
const T = require('./time');
const { TextDecoder } = require('util');

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const clean = (s, max = 255) => String(s == null ? '' : s).trim().slice(0, max);
const toInt = (v, def = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

function decodeUploadFilename(filename) {
  const name = String(filename || '');
  if (!name || /[^\u0000-\u00ff]/.test(name)) return name;

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'));
  } catch {
    return name;
  }
}

function strongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

/**
 * Validate print options coming from a form / query string.
 * Returns { value, errors } where value is a clean object safe to store.
 */
function parseItemOptions(body, service) {
  const errors = [];
  const pages = toInt(body.pages);
  const copies = toInt(body.copies);
  if (!pages || pages < 1 || pages > 5000) errors.push('Pages must be between 1 and 5000.');
  if (!copies || copies < 1 || copies > 1000) errors.push('Copies must be between 1 and 1000.');
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const value = {
    pages, copies,
    paper_size: pick(body.paper_size, C.PAPER_SIZES, 'A4'),
    colour_mode: pick(body.colour_mode, C.COLOUR_MODES, 'bw'),
    sided: pick(body.sided, C.SIDES, 'single'),
    orientation: pick(body.orientation, C.ORIENTATIONS, 'portrait'),
    quality: pick(body.quality, C.QUALITIES, 'normal'),
    binding: pick(body.binding, C.BINDINGS, 'none'),
    instructions: clean(body.instructions, 500) || null,
    document_id: toInt(body.document_id),
  };
  if (service) {
    // Options a service does not support are forced to their defaults.
    if (service.colour_price == null) value.colour_mode = 'bw';
    if (service.pricing_type !== 'print') { value.binding = 'none'; value.sided = 'single'; value.quality = 'normal'; value.colour_mode = 'bw'; }
    if (service.pricing_type === 'per_set') value.pages = value.pages || 1;
  }
  return { value, errors };
}

const OPTION_LABELS = {
  bw: 'Black & White', colour: 'Colour', single: 'Single-sided', double: 'Double-sided',
  portrait: 'Portrait', landscape: 'Landscape', normal: 'Normal quality', high: 'High quality',
  none: 'No binding', spiral: 'Spiral binding', project: 'Project binding',
};

/** One-line summary of an item's options, e.g. "A4 · Colour · Double-sided · Portrait". */
function optionSummary(it) {
  const bits = [it.paper_size, OPTION_LABELS[it.colour_mode], OPTION_LABELS[it.sided], OPTION_LABELS[it.orientation], OPTION_LABELS[it.quality]];
  if (it.binding && it.binding !== 'none') bits.push(OPTION_LABELS[it.binding]);
  return bits.join(' · ');
}

const money = (n) => `Nu ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NOTIF_ICONS = {
  order_placed: 'bi-bag-check', accepted: 'bi-check-circle', printing: 'bi-printer', ready: 'bi-box-seam',
  collected: 'bi-check2-all', rejected: 'bi-x-circle', cancelled: 'bi-slash-circle', delayed: 'bi-hourglass-split',
  deadline_approaching: 'bi-alarm', deadline_risk: 'bi-exclamation-triangle', urgent_approved: 'bi-lightning-charge',
  urgent_rejected: 'bi-lightning', new_order: 'bi-inbox', schedule: 'bi-calendar-event',
};

/** Variables available in every EJS template. */
const viewHelpers = {
  fmtFull: T.fmtFull, fmtShort: T.fmtShort, fmtDate: T.fmtDate, dayName: T.dayName,
  fmtDuration: T.fmtDuration, deadlineState: T.deadlineState, toInputParts: T.toInputParts,
  money, optionSummary, OPTION_LABELS, NOTIF_ICONS,
  STATUS_LABELS: C.STATUS_LABELS, ACTIVE_STATUSES: C.ACTIVE_STATUSES,
};

module.exports = { isEmail, clean, toInt, strongPassword, parseItemOptions, optionSummary, money, decodeUploadFilename, viewHelpers };
