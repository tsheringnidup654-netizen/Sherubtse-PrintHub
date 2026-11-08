const db = require('../config/db');
const User = require('./User');

/** Insert a notification. `client` lets callers join an open transaction. Duplicate one-off alerts are ignored. */
async function create({ user_id, order_id = null, type, title, message }, client = db) {
  await client.query(
    'INSERT INTO notifications (user_id, order_id, type, title, message) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [user_id, order_id, type, title, message]);
}

async function notifyAdmins(data, client = db) {
  for (const id of await User.adminIds()) await create({ ...data, user_id: id }, client);
}

const list = async (userId, limit = 100) =>
  (await db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).rows;
const unreadCount = async (userId) =>
  (await db.query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT is_read', [userId])).rows[0].n;
const markRead = (userId, id) => db.query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [id, userId]);
const markAllRead = (userId) => db.query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [userId]);

/** Text for each status change shown to the student. */
function statusNotice(order, status) {
  const n = order.order_number;
  const map = {
    accepted: ['accepted', 'Order accepted', `Order ${n} has been accepted by the print shop.`],
    printing: ['printing', 'Printing has begun', `Order ${n} is now being printed.`],
    ready: ['ready', 'Order ready for collection', `Order ${n} is ready. Please collect it with your QR code.`],
    collected: ['collected', 'Order collected', `Order ${n} was collected. Please rate your experience!`],
    rejected: ['rejected', 'Order rejected', `Order ${n} could not be accepted. See the order page for details.`],
    cancelled: ['cancelled', 'Order cancelled', `Order ${n} was cancelled.`],
  };
  const m = map[status];
  return m ? { type: m[0], title: m[1], message: m[2] } : null;
}

/**
 * Deadline alerts (run by the scheduler and when dashboards load):
 *  - student gets ONE alert when a live order is due within 3 hours
 *  - admins get ONE alert when such an order is still not ready
 */
async function scanDeadlines() {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.user_id, o.status, o.collection_deadline, u.full_name
       FROM orders o JOIN users u ON u.id=o.user_id
      WHERE o.status IN ('pending','accepted','printing','ready')
        AND o.collection_deadline > NOW() AND o.collection_deadline <= NOW() + INTERVAL '3 hours'`);
  for (const o of rows) {
    await create({
      user_id: o.user_id, order_id: o.id, type: 'deadline_approaching', title: 'Collection deadline approaching',
      message: o.status === 'ready'
        ? `Order ${o.order_number} is ready - please collect it within the next 3 hours.`
        : `Order ${o.order_number} is due in under 3 hours (status: ${o.status}).`,
    });
    if (o.status !== 'ready') {
      await notifyAdmins({
        order_id: o.id, type: 'deadline_risk', title: 'Urgent: deadline within 3 hours',
        message: `Order ${o.order_number} (${o.full_name}) is due in under 3 hours and is still "${o.status}".`,
      });
    }
  }
}

module.exports = { create, notifyAdmins, list, unreadCount, markRead, markAllRead, statusNotice, scanDeadlines };
