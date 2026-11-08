const db = require('../config/db');

const FIELDS = ['service_id', 'document_id', 'pages', 'copies', 'paper_size', 'colour_mode', 'sided', 'orientation', 'quality', 'binding', 'instructions'];

async function list(userId) {
  const { rows } = await db.query(
    `SELECT ci.*, s.name AS service_name, s.slug, s.icon, s.pricing_type, s.base_price, s.colour_price, s.is_active AS service_active, d.original_name AS document_name
       FROM cart_items ci JOIN services s ON s.id = ci.service_id
       LEFT JOIN documents d ON d.id = ci.document_id
      WHERE ci.user_id = $1 ORDER BY ci.id`, [userId]);
  return rows;
}

const find = async (userId, id) => (await db.query('SELECT * FROM cart_items WHERE id=$1 AND user_id=$2', [id, userId])).rows[0];
const count = async (userId) => (await db.query('SELECT COUNT(*)::int AS n FROM cart_items WHERE user_id=$1', [userId])).rows[0].n;

async function add(userId, d) {
  await db.query(`INSERT INTO cart_items (user_id, ${FIELDS.join(',')}) VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(',')})`,
    [userId, ...FIELDS.map((f) => d[f] ?? null)]);
}

async function update(userId, id, d) {
  await db.query(`UPDATE cart_items SET ${FIELDS.map((f, i) => `${f}=$${i + 3}`).join(',')} WHERE id=$1 AND user_id=$2`,
    [id, userId, ...FIELDS.map((f) => d[f] ?? null)]);
}

const remove = (userId, id) => db.query('DELETE FROM cart_items WHERE id=$1 AND user_id=$2', [id, userId]);

module.exports = { list, find, count, add, update, remove };
