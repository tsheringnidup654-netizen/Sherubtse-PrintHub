const db = require('../config/db');

/** Collected orders the student has not reviewed yet. */
const pendingForUser = async (userId) => (await db.query(
  `SELECT o.id, o.order_number, o.created_at,
          (SELECT string_agg(service_name, ', ') FROM order_items WHERE order_id=o.id) AS services
     FROM orders o LEFT JOIN feedback f ON f.order_id=o.id
    WHERE o.user_id=$1 AND o.status='collected' AND f.id IS NULL ORDER BY o.created_at DESC`, [userId])).rows;

const listForUser = async (userId) => (await db.query(
  `SELECT f.*, o.order_number FROM feedback f JOIN orders o ON o.id=f.order_id WHERE f.user_id=$1 ORDER BY f.created_at DESC`, [userId])).rows;

const create = (d) => db.query('INSERT INTO feedback (user_id, order_id, rating, comment) VALUES ($1,$2,$3,$4)', [d.user_id, d.order_id, d.rating, d.comment || null]);
const forOrder = async (orderId) => (await db.query('SELECT * FROM feedback WHERE order_id=$1', [orderId])).rows[0];

const listAll = async () => (await db.query(
  `SELECT f.*, o.order_number, u.full_name, u.student_id FROM feedback f
     JOIN orders o ON o.id=f.order_id JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC`)).rows;
const summary = async () => (await db.query('SELECT COUNT(*)::int AS n, COALESCE(ROUND(AVG(rating),2),0) AS avg FROM feedback')).rows[0];
const moderate = (id, visible, reply) => db.query('UPDATE feedback SET is_visible=$2, admin_reply=$3 WHERE id=$1', [id, visible, reply || null]);

const addMessage = (d) => db.query('INSERT INTO contact_messages (name,email,subject,message) VALUES ($1,$2,$3,$4)', [d.name, d.email, d.subject, d.message]);
const messages = async () => (await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100')).rows;
const markMessageRead = (id) => db.query('UPDATE contact_messages SET is_read=TRUE WHERE id=$1', [id]);

module.exports = { pendingForUser, listForUser, create, forOrder, listAll, summary, moderate, addMessage, messages, markMessageRead };
