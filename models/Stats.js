/** Aggregated numbers for the admin dashboard, student analytics and reports. */
const db = require('../config/db');
const { TIMEZONE } = require('../config/constants');

const one = async (sql, p) => (await db.query(sql, p)).rows[0];

async function adminDashboard() {
  const counts = await one(`
    SELECT (SELECT COUNT(*)::int FROM users WHERE role='student') AS students,
           COUNT(*)::int AS orders,
           COUNT(*) FILTER (WHERE status='pending')::int   AS pending,
           COUNT(*) FILTER (WHERE status='printing')::int  AS printing,
           COUNT(*) FILTER (WHERE status='ready')::int     AS ready,
           COUNT(*) FILTER (WHERE status='collected')::int AS completed,
           COUNT(*) FILTER (WHERE status IN ('pending','accepted','printing','ready') AND collection_deadline <= NOW() + INTERVAL '3 hours')::int AS urgent
      FROM orders`);
  const sales = await one("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status='paid'");
  const daily = (await db.query(
    `SELECT to_char(d::date,'DD Mon') AS label, COALESCE(SUM(p.amount),0)::float AS value
       FROM generate_series((NOW() AT TIME ZONE '${TIMEZONE}')::date - 13, (NOW() AT TIME ZONE '${TIMEZONE}')::date, '1 day') d
       LEFT JOIN payments p ON p.status='paid' AND (p.paid_at AT TIME ZONE '${TIMEZONE}')::date = d::date
      GROUP BY d ORDER BY d`)).rows;
  const monthly = (await db.query(
    `SELECT to_char(m,'Mon YYYY') AS label, COALESCE(SUM(p.amount),0)::float AS value
       FROM generate_series(date_trunc('month', NOW() AT TIME ZONE '${TIMEZONE}') - INTERVAL '5 months', date_trunc('month', NOW() AT TIME ZONE '${TIMEZONE}'), '1 month') m
       LEFT JOIN payments p ON p.status='paid' AND date_trunc('month', p.paid_at AT TIME ZONE '${TIMEZONE}') = m
      GROUP BY m ORDER BY m`)).rows;
  const popular = (await db.query(
    `SELECT oi.service_name AS label, COUNT(*)::int AS value
       FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status NOT IN ('cancelled','rejected')
      GROUP BY oi.service_name ORDER BY value DESC LIMIT 6`)).rows;
  return { counts, sales: Number(sales.total), daily, monthly, popular };
}

async function studentSummary(userId) {
  const totals = await one(
    `SELECT COUNT(DISTINCT oi.document_id)::int AS documents, COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(oi.copies),0)::int AS copies, COALESCE(SUM(oi.pages*oi.copies),0)::int AS pages
       FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=$1 AND o.status NOT IN ('cancelled','rejected')`, [userId]);
  const spent = await one("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE user_id=$1 AND status NOT IN ('cancelled','rejected')", [userId]);
  const monthly = (await db.query(
    `SELECT to_char(m,'Mon YY') AS label, COALESCE(SUM(o.total),0)::float AS value
       FROM generate_series(date_trunc('month', NOW() AT TIME ZONE '${TIMEZONE}') - INTERVAL '11 months', date_trunc('month', NOW() AT TIME ZONE '${TIMEZONE}'), '1 month') m
       LEFT JOIN orders o ON o.user_id=$1 AND o.status NOT IN ('cancelled','rejected') AND date_trunc('month', o.created_at AT TIME ZONE '${TIMEZONE}') = m
      GROUP BY m ORDER BY m`, [userId])).rows;
  return { ...totals, spent: Number(spent.n), monthly };
}

/** Reports page: totals + breakdowns for a Bhutan-local date range. */
async function report(from, to) {
  const range = `(o.created_at AT TIME ZONE '${TIMEZONE}')::date BETWEEN $1::date AND $2::date`;
  const summary = await one(
    `SELECT COUNT(*)::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled','rejected')),0) AS order_value,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status='paid'),0) AS paid,
            COUNT(*) FILTER (WHERE o.status='collected')::int AS collected,
            COUNT(*) FILTER (WHERE o.status IN ('cancelled','rejected'))::int AS lost
       FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE ${range}`, [from, to]);
  const byStatus = (await db.query(`SELECT o.status, COUNT(*)::int AS n FROM orders o WHERE ${range} GROUP BY o.status ORDER BY n DESC`, [from, to])).rows;
  const byService = (await db.query(
    `SELECT oi.service_name, COUNT(*)::int AS lines, SUM(oi.pages*oi.copies)::int AS pages, SUM(oi.line_total) AS revenue
       FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${range} AND o.status NOT IN ('cancelled','rejected')
      GROUP BY oi.service_name ORDER BY revenue DESC`, [from, to])).rows;
  const byDay = (await db.query(
    `SELECT to_char((o.created_at AT TIME ZONE '${TIMEZONE}')::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled','rejected')),0) AS value
       FROM orders o WHERE ${range} GROUP BY 1 ORDER BY 1`, [from, to])).rows;
  const topStudents = (await db.query(
    `SELECT u.full_name, u.student_id, COUNT(*)::int AS orders, SUM(o.total) AS spent
       FROM orders o JOIN users u ON u.id=o.user_id WHERE ${range} AND o.status NOT IN ('cancelled','rejected')
      GROUP BY u.id ORDER BY spent DESC LIMIT 5`, [from, to])).rows;
  return { summary, byStatus, byService, byDay, topStudents };
}

module.exports = { adminDashboard, studentSummary, report };
