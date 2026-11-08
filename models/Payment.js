const db = require('../config/db');

async function listAll(status) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE p.status = $1'; }
  return (await db.query(
    `SELECT p.*, o.order_number, o.status AS order_status, u.full_name, u.student_id
       FROM payments p JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.user_id ${where}
      ORDER BY p.created_at DESC LIMIT 300`, params)).rows;
}

const totals = async () => (await db.query(
  `SELECT COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS paid,
          COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) AS pending FROM payments`)).rows[0];

async function setStatus(id, status, reference) {
  await db.query(
    `UPDATE payments SET status=$2::varchar, reference=COALESCE(NULLIF($3::varchar,''), reference),
            paid_at = CASE WHEN $2::varchar='paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END WHERE id=$1`, [id, status, reference || null]);
}

module.exports = { listAll, totals, setStatus };
