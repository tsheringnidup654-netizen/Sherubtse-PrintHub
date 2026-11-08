/** Shop-wide settings stored as key/value rows (prices modifiers, payment methods, shop info). */
const db = require('../config/db');

const DEFAULTS = {
  shop_name: 'Sherubtse PrintHub', shop_location: 'Sherubtse College, Kanglung, Bhutan', shop_phone: '', shop_email: '',
  shop_hours: 'Mon - Sat, 9:00 AM - 5:00 PM', a3_multiplier: '2', hq_multiplier: '1.25', duplex_discount: '10',
  urgent_surcharge_pct: '25', pages_per_hour: '300', min_lead_minutes: '60',
  payment_methods: '[{"code":"cash","label":"Cash on collection","enabled":true,"needs_reference":false}]',
};

/** Returns all settings as an object; `payment_methods` is parsed to an array. */
async function getAll() {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const s = { ...DEFAULTS };
  rows.forEach((r) => { s[r.key] = r.value; });
  try { s.payment_methods = JSON.parse(s.payment_methods); } catch (_) { s.payment_methods = JSON.parse(DEFAULTS.payment_methods); }
  return s;
}

async function set(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await db.query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, v]);
}

module.exports = { getAll, set };
