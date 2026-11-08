/**
 * Order model: creation, listing/filtering, status workflow, scheduling,
 * urgent-request decisions and collection records.
 */

const crypto = require('crypto');
const db = require('../config/db');
const Notification = require('./Notification');
const { TIMEZONE, ACTIVE_STATUSES } = require('../config/constants');
const { decodeUploadFilename } = require('../utils/helpers');
const BINDING_SLUGS = { spiral: 'spiral-binding', project: 'project-binding' };

const LIST_SELECT = `
  SELECT o.*,
         o.order_no AS order_number,
         o.requested_deadline AS collection_deadline,
         o.urgent_surcharge AS urgent_fee,
         o.delay_reason AS delay_note,
         u.full_name,
         u.student_id,
         u.email,
         (SELECT string_agg(oi.service_name, ', ' ORDER BY oi.id)
            FROM order_items oi
           WHERE oi.order_id = o.id) AS services,
         (SELECT COALESCE(SUM(oi.pages * oi.copies), 0)::int
            FROM order_items oi
           WHERE oi.order_id = o.id) AS total_pages,
         p.status AS payment_status,
         p.method AS payment_method
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN payments p ON p.order_id = o.id`;

/** Builds a parameterised WHERE clause from the search/filter form. */
function buildFilter(f = {}, base = {}) {
  const where = [...(base.where || [])];
  const params = [...(base.params || [])];

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(
      `(o.order_no ILIKE $${params.length}
        OR u.full_name ILIKE $${params.length}
        OR u.student_id ILIKE $${params.length})`
    );
  }

  if (f.status) add('o.status = ?', f.status);

  if (f.service) {
    add(
      'EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.service_id = ?)',
      Number(f.service)
    );
  }

  if (f.from) {
    add(
      `(o.created_at AT TIME ZONE '${TIMEZONE}')::date >= ?::date`,
      f.from
    );
  }

  if (f.to) {
    add(
      `(o.created_at AT TIME ZONE '${TIMEZONE}')::date <= ?::date`,
      f.to
    );
  }

  const live = `o.status IN ('${ACTIVE_STATUSES.join("','")}')`;

  if (f.deadline === 'upcoming') {
    where.push(`${live} AND o.requested_deadline > NOW()`);
  }

  if (f.deadline === 'today') {
    where.push(
      `${live} AND (o.requested_deadline AT TIME ZONE '${TIMEZONE}')::date =
       (NOW() AT TIME ZONE '${TIMEZONE}')::date`
    );
  }

  if (f.deadline === 'urgent') {
    where.push(
      `${live} AND o.requested_deadline <= NOW() + INTERVAL '3 hours'`
    );
  }

  if (f.deadline === 'overdue') {
    where.push(`${live} AND o.requested_deadline < NOW()`);
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

async function listForUser(userId, filters = {}) {
  const { sql, params } = buildFilter(filters, {
    where: ['o.user_id = $1'],
    params: [userId],
  });

  return (
    await db.query(
      `${LIST_SELECT} ${sql} ORDER BY o.created_at DESC LIMIT 200`,
      params
    )
  ).rows;
}

async function listAll(filters = {}, sort = 'newest') {
  const { sql, params } = buildFilter(filters);

  const order =
    sort === 'deadline'
      ? `CASE WHEN o.status IN ('pending','accepted','printing','ready')
                THEN 0 ELSE 1 END,
         o.requested_deadline ASC`
      : 'o.created_at DESC';

  return (
    await db.query(
      `${LIST_SELECT} ${sql} ORDER BY ${order} LIMIT 300`,
      params
    )
  ).rows;
}

/** Live orders sorted by nearest deadline. */
async function upcomingDeadlines() {
  return (
    await db.query(
      `${LIST_SELECT}
        WHERE o.status IN ('pending','accepted','printing','ready')
        ORDER BY o.requested_deadline ASC
        LIMIT 200`
    )
  ).rows;
}

async function findById(id) {
  return (
    await db.query(`${LIST_SELECT} WHERE o.id = $1`, [id])
  ).rows[0];
}

const findByToken = async (token) =>
  (
    await db.query(`${LIST_SELECT} WHERE o.qr_token = $1`, [token])
  ).rows[0];

const findByNumber = async (n) =>
  (
    await db.query(`${LIST_SELECT} WHERE o.order_no = $1`, [n])
  ).rows[0];

const items = async (orderId) => {
  const { rows } = await db.query(
    `SELECT oi.*,
            COALESCE(d.original_name, oi.document_name) AS document_name,
            oi.sides AS sided,
            CASE bs.slug
              WHEN 'spiral-binding' THEN 'spiral'
              WHEN 'project-binding' THEN 'project'
              ELSE 'none'
            END AS binding
       FROM order_items oi
       LEFT JOIN documents d ON d.id = oi.document_id
       LEFT JOIN services bs ON bs.id = oi.binding_service_id
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
    [orderId]
  );
  return rows.map((item) => ({
    ...item,
    document_name: item.document_name
      ? decodeUploadFilename(item.document_name)
      : item.document_name,
  }));
};

const history = async (orderId) =>
  (
    await db.query(
      `SELECT h.*,
              u.full_name AS changed_by_name
         FROM order_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.order_id = $1
        ORDER BY h.changed_at, h.id`,
      [orderId]
    )
  ).rows;

const payment = async (orderId) =>
  (
    await db.query(
      'SELECT * FROM payments WHERE order_id = $1',
      [orderId]
    )
  ).rows[0];

const collection = async (orderId) =>
  (
    await db.query(
      `SELECT c.*,
              c.method AS verified_via,
              u.full_name AS handed_by_name
         FROM collection_records c
         LEFT JOIN users u ON u.id = c.collected_by
        WHERE c.order_id = $1`,
      [orderId]
    )
  ).rows[0];

/** Pages currently waiting in the shop queue. */
async function queuePages() {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(oi.pages * oi.copies), 0)::int AS n
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ('pending','accepted','printing')`
  );

  return rows[0].n;
}

/** Create an order from priced cart lines in a single transaction. */
async function create(d) {
  return db.tx(async (c) => {
    const seq = (
      await c.query("SELECT nextval('order_no_seq') AS n")
    ).rows[0].n;

    const year = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
    }).format(new Date());

    const orderNumber = `SH${year}${String(seq).padStart(3, '0')}`;

    const { rows } = await c.query(
      `INSERT INTO orders
         (order_no, user_id, is_urgent, urgent_status, payment_method,
          subtotal, urgent_surcharge, total,
          requested_deadline, notes, qr_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *,
                 order_no AS order_number,
                 requested_deadline AS collection_deadline,
                 urgent_surcharge AS urgent_fee`,
      [
        orderNumber,
        d.userId,
        d.urgent,
        d.urgent ? 'requested' : 'none',
        d.method,
        d.subtotal,
        d.urgentFee,
        d.total,
        d.deadline,
        d.notes || null,
        crypto.randomBytes(20).toString('hex'),
      ]
    );

    const order = rows[0];

    for (const l of d.lines) {
      let bindingService = null;
      if (l.binding && l.binding !== 'none') {
        const slug = BINDING_SLUGS[l.binding];
        if (!slug) throw new Error(`Unsupported binding option: ${l.binding}`);
        const result = await c.query(
          'SELECT id, name FROM services WHERE slug = $1',
          [slug]
        );
        bindingService = result.rows[0];
        if (!bindingService) throw new Error(`Binding service "${slug}" is not configured.`);
      }

      await c.query(
        `INSERT INTO order_items
           (order_id, service_id, document_id, service_name, document_name,
            pages, copies, paper_size, colour_mode, sides,
            orientation, quality, binding_service_id, binding_name,
            instructions, unit_price, binding_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          order.id,
          l.service_id,
          l.document_id,
          l.service_name,
          l.document_name || null,
          l.pages,
          l.copies,
          l.paper_size,
          l.colour_mode,
          l.sided,
          l.orientation,
          l.quality,
          bindingService ? bindingService.id : null,
          bindingService ? bindingService.name : null,
          l.instructions,
          l.unit,
          l.bindingCost,
          l.line_total,
        ]
      );
    }

    await c.query(
      `INSERT INTO payments (order_id, method, amount, reference)
       VALUES ($1,$2,$3,$4)`,
      [order.id, d.method, d.total, d.reference || null]
    );

    await c.query(
      `INSERT INTO order_status_history
         (order_id, status, note, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [
        order.id,
        'pending',
        d.urgent
          ? 'Order placed (urgent printing requested)'
          : 'Order placed',
        d.userId,
      ]
    );

    await c.query(
      'DELETE FROM cart_items WHERE user_id = $1',
      [d.userId]
    );

    await Notification.create(
      {
        user_id: d.userId,
        order_id: order.id,
        type: 'order_placed',
        title: 'Order received',
        message: `Order ${orderNumber} was placed. ${
          d.urgent
            ? 'Your urgent request is awaiting admin review.'
            : 'We will confirm it shortly.'
        }`,
      },
      c
    );

    await Notification.notifyAdmins(
      {
        order_id: order.id,
        type: 'new_order',
        title: d.urgent ? 'New URGENT order' : 'New order',
        message: `Order ${orderNumber} has been placed${
          d.urgent ? ' with an urgent request' : ''
        }.`,
      },
      c
    );

    return order;
  });
}

/** Change status and notify the student. */
async function setStatus(order, status, adminId, note) {
  return db.tx(async (c) => {
    await c.query(
      'UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1',
      [order.id, status]
    );

    await c.query(
      `INSERT INTO order_status_history
         (order_id, status, note, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [order.id, status, note || null, adminId]
    );

    const notice = Notification.statusNotice(order, status);

    if (notice) {
      await Notification.create(
        {
          ...notice,
          user_id: order.user_id,
          order_id: order.id,
          message:
            note && status === 'rejected'
              ? `${notice.message} Reason: ${note}`
              : notice.message,
        },
        c
      );
    }

    if (status === 'rejected') {
      await c.query(
        `UPDATE payments
            SET status = 'failed'
          WHERE order_id = $1 AND status = 'pending'`,
        [order.id]
      );
    }
  });
}

/** Student cancellation. */
async function cancel(order, userId) {
  return db.tx(async (c) => {
    await c.query(
      `UPDATE orders
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1`,
      [order.id]
    );

    await c.query(
      `INSERT INTO order_status_history
         (order_id, status, note, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [order.id, 'cancelled', 'Cancelled by student', userId]
    );

    await c.query(
      `UPDATE payments
          SET status = 'failed'
        WHERE order_id = $1 AND status = 'pending'`,
      [order.id]
    );

    await Notification.create(
      {
        ...Notification.statusNotice(order, 'cancelled'),
        user_id: userId,
        order_id: order.id,
      },
      c
    );

    await Notification.notifyAdmins(
      {
        order_id: order.id,
        type: 'cancelled',
        title: 'Order cancelled',
        message: `${order.full_name} cancelled order ${order.order_number}.`,
      },
      c
    );
  });
}

/** Admin scheduling. */
async function schedule(
  order,
  { estimated, deadline, delayed, delayNote },
  adminId
) {
  return db.tx(async (c) => {
    const msgs = [];

    if (estimated !== undefined) {
      await c.query(
        'UPDATE orders SET estimated_completion = $2 WHERE id = $1',
        [order.id, estimated]
      );

      msgs.push(
        estimated
          ? 'Estimated completion time was updated.'
          : 'Estimated completion time was cleared.'
      );
    }

    if (deadline) {
      await c.query(
        'UPDATE orders SET requested_deadline = $2 WHERE id = $1',
        [order.id, deadline]
      );

      await c.query(
        `DELETE FROM notifications
          WHERE order_id = $1
            AND type IN ('deadline_approaching','deadline_risk')`,
        [order.id]
      );

      msgs.push('Collection deadline was updated.');
    }

    if (delayed) {
      await c.query(
        'UPDATE orders SET is_delayed = TRUE, delay_reason = $2 WHERE id = $1',
        [order.id, delayNote]
      );

      await c.query(
        `INSERT INTO order_status_history
           (order_id, status, note, changed_by)
         VALUES ($1,$2,$3,$4)`,
        [order.id, order.status, `Delay notice: ${delayNote}`, adminId]
      );

      await Notification.create(
        {
          user_id: order.user_id,
          order_id: order.id,
          type: 'delayed',
          title: 'Your order is delayed',
          message: `Order ${order.order_number} is delayed: ${delayNote}`,
        },
        c
      );
    } else if (msgs.length) {
      await Notification.create(
        {
          user_id: order.user_id,
          order_id: order.id,
          type: 'schedule',
          title: 'Order schedule updated',
          message: `Order ${order.order_number}: ${msgs.join(' ')}`,
        },
        c
      );
    }

    if (order.is_delayed && delayed === false) {
      await c.query(
        'UPDATE orders SET is_delayed = FALSE, delay_reason = NULL WHERE id = $1',
        [order.id]
      );
    }

    await c.query(
      'UPDATE orders SET updated_at = NOW() WHERE id = $1',
      [order.id]
    );
  });
}

/** Approve or reject an urgent-printing request. */
async function decideUrgent(order, approve, adminId, { urgentFee }) {
  return db.tx(async (c) => {
    if (approve) {
      await c.query(
        `UPDATE orders
            SET urgent_status = 'approved', updated_at = NOW()
          WHERE id = $1`,
        [order.id]
      );
    } else {
      await c.query(
        `UPDATE orders
            SET urgent_status = 'rejected',
                is_urgent = FALSE,
                urgent_surcharge = 0,
                total = subtotal,
                updated_at = NOW()
          WHERE id = $1`,
        [order.id]
      );

      await c.query(
        'UPDATE payments SET amount = $2 WHERE order_id = $1',
        [order.id, order.subtotal]
      );
    }

    await c.query(
      `INSERT INTO order_status_history
         (order_id, status, note, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [
        order.id,
        order.status,
        approve
          ? 'Urgent printing approved'
          : 'Urgent printing declined - processed as a normal order',
        adminId,
      ]
    );

    await Notification.create(
      {
        user_id: order.user_id,
        order_id: order.id,
        type: approve ? 'urgent_approved' : 'urgent_rejected',
        title: approve
          ? 'Urgent printing approved'
          : 'Urgent printing declined',
        message: approve
          ? `Order ${order.order_number} will be handled as a priority.`
          : `Order ${order.order_number} will be processed normally and the urgent fee was removed.`,
      },
      c
    );
  });
}

/** Hand-over and collection record. */
async function collect(order, adminId, via, note) {
  return db.tx(async (c) => {
    await c.query(
      `INSERT INTO collection_records
         (order_id, collected_by, method, note)
       VALUES ($1,$2,$3,$4)`,
      [order.id, adminId, via, note || null]
    );

    await c.query(
      `UPDATE orders
          SET status = 'collected', updated_at = NOW()
        WHERE id = $1`,
      [order.id]
    );

    await c.query(
      `INSERT INTO order_status_history
         (order_id, status, note, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [
        order.id,
        'collected',
        `Collected (${
          via === 'qr' ? 'QR code verified' : 'manual verification'
        })`,
        adminId,
      ]
    );

    await c.query(
      `UPDATE payments
          SET status = 'paid', paid_at = NOW()
        WHERE order_id = $1
          AND status = 'pending'
          AND method = 'cash'`,
      [order.id]
    );

    await Notification.create(
      {
        ...Notification.statusNotice(order, 'collected'),
        user_id: order.user_id,
        order_id: order.id,
      },
      c
    );
  });
}

module.exports = {
  listForUser,
  listAll,
  upcomingDeadlines,
  findById,
  findByToken,
  findByNumber,
  items,
  history,
  payment,
  collection,
  queuePages,
  create,
  setStatus,
  cancel,
  schedule,
  decideUrgent,
  collect,
};