const db = require('../config/db');
const { decodeUploadFilename } = require('../utils/helpers');

const withDisplayName = (doc) => doc && ({
  ...doc,
  original_name: decodeUploadFilename(doc.original_name),
});

async function create({
  user_id,
  original_name,
  stored_name,
  mime_type,
  extension,
  size_bytes,
  page_count,
}) {
  const { rows } = await db.query(
    `INSERT INTO documents
       (user_id, original_name, stored_name, mime_type, extension, file_size, page_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      user_id,
      original_name,
      stored_name,
      mime_type,
      extension,
      size_bytes,
      page_count,
    ]
  );

  return withDisplayName(rows[0]);
}

const listByUser = async (userId) =>
  (
    await db.query(
      `SELECT d.*, d.file_size AS size_bytes, d.created_at AS uploaded_at
         FROM documents d
        WHERE d.user_id = $1
        ORDER BY d.created_at DESC`,
      [userId]
    )
  ).rows.map(withDisplayName);

/** Ownership check: students can only load their own documents. */
const findOwned = async (id, userId) => {
  const { rows } = await db.query(
    'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return withDisplayName(rows[0]);
};

const findById = async (id) => {
  const { rows } = await db.query(
    'SELECT * FROM documents WHERE id = $1',
    [id]
  );
  return withDisplayName(rows[0]);
};

const setPages = (id, userId, pages) =>
  db.query(
    'UPDATE documents SET page_count = $3 WHERE id = $1 AND user_id = $2',
    [id, userId, pages]
  );

const remove = (id) =>
  db.query('DELETE FROM documents WHERE id = $1', [id]);

/** A document is in use while it is in a cart or live order. */
async function inUse(id) {
  const { rows } = await db.query(
    `SELECT (
       EXISTS (
         SELECT 1
           FROM cart_items
          WHERE document_id = $1
       )
       OR EXISTS (
         SELECT 1
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.document_id = $1
            AND o.status IN ('pending','accepted','printing','ready')
       )
     ) AS used`,
    [id]
  );

  return rows[0].used;
}

/** Admin view of all uploads and the orders that use them. */
async function listAll(q) {
  const params = [];
  let where = '';

  if (q) {
    params.push(`%${q}%`);
    where = 'WHERE d.original_name ILIKE $1 OR u.full_name ILIKE $1';
  }

  return (
    await db.query(
      `SELECT d.*,
              u.full_name,
              u.student_id,
              d.file_size AS size_bytes,
              d.created_at AS uploaded_at,
              (
                SELECT string_agg(DISTINCT o.order_no, ', ')
                  FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                 WHERE oi.document_id = d.id
              ) AS orders
         FROM documents d
         JOIN users u ON u.id = d.user_id
         ${where}
        ORDER BY d.created_at DESC
        LIMIT 300`,
      params
    )
  ).rows.map(withDisplayName);
}

module.exports = {
  create,
  listByUser,
  findOwned,
  findById,
  setPages,
  remove,
  inUse,
  listAll,
};