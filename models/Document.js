const db = require('../config/db');

async function create({ user_id, original_name, stored_name, mime_type, size_bytes, page_count }) {
  const { rows } = await db.query(
    `INSERT INTO documents (user_id, original_name, stored_name, mime_type, size_bytes, page_count)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [user_id, original_name, stored_name, mime_type, size_bytes, page_count]);
  return rows[0];
}

const listByUser = async (userId) => (await db.query('SELECT * FROM documents WHERE user_id=$1 ORDER BY uploaded_at DESC', [userId])).rows;
/** Ownership check built into the query: a student can never load another student's document. */
const findOwned = async (id, userId) => (await db.query('SELECT * FROM documents WHERE id=$1 AND user_id=$2', [id, userId])).rows[0];
const findById = async (id) => (await db.query('SELECT * FROM documents WHERE id=$1', [id])).rows[0];
const setPages = (id, userId, pages) => db.query('UPDATE documents SET page_count=$3 WHERE id=$1 AND user_id=$2', [id, userId, pages]);
const remove = (id) => db.query('DELETE FROM documents WHERE id=$1', [id]);

/** A document is "in use" while it is in a cart or in a live order. */
async function inUse(id) {
  const { rows } = await db.query(
    `SELECT (EXISTS (SELECT 1 FROM cart_items WHERE document_id=$1)
         OR EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
                     WHERE oi.document_id=$1 AND o.status IN ('pending','accepted','printing','ready'))) AS used`, [id]);
  return rows[0].used;
}

/** Admin view of all uploads, with the orders that use them. */
async function listAll(q) {
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = 'WHERE d.original_name ILIKE $1 OR u.full_name ILIKE $1'; }
  return (await db.query(
    `SELECT d.*, u.full_name, u.student_id,
            (SELECT string_agg(DISTINCT o.order_number, ', ') FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.document_id=d.id) AS orders
       FROM documents d JOIN users u ON u.id=d.user_id ${where} ORDER BY d.uploaded_at DESC LIMIT 300`, params)).rows;
}

module.exports = { create, listByUser, findOwned, findById, setPages, remove, inUse, listAll };
