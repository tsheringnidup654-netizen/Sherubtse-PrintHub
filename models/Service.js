const db = require('../config/db');

const BASE = `SELECT s.*, c.name AS category_name, c.slug AS category_slug,
       (SELECT ROUND(AVG(f.rating),1) FROM feedback f JOIN order_items oi ON oi.order_id = f.order_id
         WHERE oi.service_id = s.id AND f.is_visible) AS avg_rating
  FROM services s JOIN categories c ON c.id = s.category_id`;

async function listActive({ q, category } = {}) {
  const params = [];
  let where = 'WHERE s.is_active';
  if (q) { params.push(`%${q}%`); where += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`; }
  if (category) { params.push(category); where += ` AND c.slug = $${params.length}`; }
  return (await db.query(`${BASE} ${where} ORDER BY s.sort_order, s.id`, params)).rows;
}
const listAll = async () => (await db.query(`${BASE} ORDER BY s.sort_order, s.id`)).rows;
const findById = async (id) => (await db.query(`${BASE} WHERE s.id = $1`, [id])).rows[0];
const findBySlug = async (slug) => (await db.query(`${BASE} WHERE s.slug = $1`, [slug])).rows[0];
const categories = async () => (await db.query('SELECT * FROM categories ORDER BY sort_order')).rows;

const COLS = ['category_id', 'name', 'slug', 'description', 'icon', 'pricing_type', 'base_price', 'price', 'colour_price', 'unit_label', 'options_text', 'sort_order'];
const values = (d) => COLS.map((c) => (c === 'price' ? d.base_price : d[c]));

async function create(d) {
  const { rows } = await db.query(
    `INSERT INTO services (${COLS.join(',')}) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    values(d));
  return rows[0].id;
}

async function update(id, d) {
  await db.query(`UPDATE services SET ${COLS.map((c, i) => `${c}=$${i + 2}`).join(',')} WHERE id=$1`, [id, ...values(d)]);
}

const setActive = (id, active) => db.query('UPDATE services SET is_active=$2 WHERE id=$1', [id, active]);

module.exports = { listActive, listAll, findById, findBySlug, categories, create, update, setActive };
