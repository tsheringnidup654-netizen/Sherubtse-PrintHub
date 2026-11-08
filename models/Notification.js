const db = require('../config/db');
const User = require('./User');

/** Insert a notification. */
async function create(
  { user_id, order_id = null, type, title, message },
  client = db
) {
  await client.query(
    `INSERT INTO notifications
       (user_id, order_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [user_id, order_id, type, title, message]
  );
}

async function notifyAdmins(data, client = db) {
  for (const id of await User.adminIds()) {
    await create({ ...data, user_id: id }, client);
  }
}

const list = async (userId, limit = 100) =>
  (
    await db.query(
      `SELECT *
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    )
  ).rows;

const unreadCount = async (userId) =>
  (
    await db.query(
      `SELECT COUNT(*)::int AS n
         FROM notifications
        WHERE user_id = $1 AND NOT is_read`,
      [userId]
    )
  ).rows[0].n;

const markRead = (userId, id) =>
  db.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

const markAllRead = (userId) =>
  db.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
    [userId]
  );

/** Text for each status change shown to the student. */
function statusNotice(order, status) {
  const n = order.order_number;

  const map = {
    accepted: [
      'accepted',
      'Order accepted',
      `Order ${n} has been accepted by the print shop.`,
    ],
    printing: [
      'printing',
      'Printing has begun',
      `Order ${n} is now being printed.`,
    ],
    ready: [
      'ready',
      'Order ready for collection',
      `Order ${n} is ready. Please collect it with your QR code.`,
    ],
    collected: [
      'collected',
      'Order collected',
      `Order ${n} was collected. Please rate your experience!`,
    ],
    rejected: [
      'rejected',
      'Order rejected',
      `Order ${n} could not be accepted. See the order page for details.`,
    ],
    cancelled: [
      'cancelled',
      'Order cancelled',
      `Order ${n} was cancelled.`,
    ],
  };

  const m = map[status];

  return m
    ? { type: m[0], title: m[1], message: m[2] }
    : null;
}

/**
 * Deadline alerts:
 * - Students receive one alert when an active order is due within 3 hours.
 * - Admins receive one alert when an order due within 3 hours is not ready.
 */
async function scanDeadlines() {
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, order_id, type, title, message)
     SELECT o.user_id,
            o.id,
            'deadline_approaching',
            'Collection deadline approaching',
            CASE WHEN o.status = 'ready'
              THEN 'Order ' || o.order_no || ' is ready for collection within 3 hours.'
              ELSE 'Order ' || o.order_no || ' is due for collection within 3 hours.'
            END
       FROM orders o
      WHERE o.status IN ('pending', 'accepted', 'printing', 'ready')
        AND o.requested_deadline > NOW()
        AND o.requested_deadline <= NOW() + INTERVAL '3 hours'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = o.user_id
             AND n.order_id = o.id
             AND n.type = 'deadline_approaching'
        )
     ON CONFLICT DO NOTHING
     RETURNING id`
  );

  await db.query(
    `INSERT INTO notifications (user_id, order_id, type, title, message)
     SELECT admin.id,
            o.id,
            'deadline_risk',
            'Order deadline approaching',
            'Order ' || o.order_no || ' for ' || student.full_name ||
              ' is due within 3 hours and is not ready.'
       FROM orders o
       JOIN users student ON student.id = o.user_id
       CROSS JOIN users admin
      WHERE o.status IN ('pending', 'accepted', 'printing')
        AND o.requested_deadline > NOW()
        AND o.requested_deadline <= NOW() + INTERVAL '3 hours'
        AND admin.role = 'admin'
        AND admin.is_active
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = admin.id
             AND n.order_id = o.id
             AND n.type = 'deadline_risk'
        )
     ON CONFLICT DO NOTHING`
  );

  return rows;
}

module.exports = {
  create,
  notifyAdmins,
  list,
  unreadCount,
  markRead,
  markAllRead,
  statusNotice,
  scanDeadlines,
};