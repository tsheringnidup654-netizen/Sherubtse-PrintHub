/**
 * Shared constants: order statuses, allowed transitions and labels.
 * The admin controls real progress; a student can only cancel before printing starts.
 */
const STATUS = {
  pending:   { label: 'Pending',              badge: 'warning',   icon: 'bi-hourglass-split' },
  accepted:  { label: 'Accepted',             badge: 'info',      icon: 'bi-check2-circle' },
  printing:  { label: 'Printing in Progress', badge: 'primary',   icon: 'bi-printer' },
  ready:     { label: 'Ready for Collection', badge: 'success',   icon: 'bi-box-seam' },
  collected: { label: 'Collected',            badge: 'secondary', icon: 'bi-bag-check' },
  rejected:  { label: 'Rejected',             badge: 'danger',    icon: 'bi-x-octagon' },
  cancelled: { label: 'Cancelled',            badge: 'dark',      icon: 'bi-slash-circle' },
};

/** Steps shown in the visual progress tracker (rejected/cancelled are terminal side-branches). */
const FLOW = ['pending', 'accepted', 'printing', 'ready', 'collected'];

/** Statuses that count as "still being worked on" (countdown applies). */
const ACTIVE = ['pending', 'accepted', 'printing', 'ready'];

/** What an administrator may change a status into. */
const ADMIN_TRANSITIONS = {
  pending:  ['accepted', 'rejected'],
  accepted: ['printing', 'rejected'],
  printing: ['ready'],
  ready:    ['collected'],
};

/** Students may only cancel before printing has started. */
const STUDENT_CANCELLABLE = ['pending', 'accepted'];

const PAYMENT_STATUS = {
  unpaid:   { label: 'Unpaid',   badge: 'warning' },
  paid:     { label: 'Paid',     badge: 'success' },
  refunded: { label: 'Refunded', badge: 'secondary' },
};

module.exports = { STATUS, FLOW, ACTIVE, ADMIN_TRANSITIONS, STUDENT_CANCELLABLE, PAYMENT_STATUS };
