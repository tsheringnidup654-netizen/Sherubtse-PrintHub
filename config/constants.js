/** Application-wide constants (single source of truth for labels and rules). */
const path = require('path');

module.exports = {
  APP_NAME: 'Sherubtse PrintHub',
  TAGLINE: 'Print Smart. Save Time. Collect with Ease.',
  TIMEZONE: 'Asia/Thimphu',
  UTC_OFFSET: '+06:00', // Bhutan has no daylight saving time

  UPLOAD_ROOT: path.join(__dirname, '..', 'uploads'),
  DOC_DIR: path.join(__dirname, '..', 'uploads', 'documents'),
  AVATAR_DIR: path.join(__dirname, '..', 'uploads', 'avatars'),

  ORDER_STATUSES: ['pending', 'accepted', 'printing', 'ready', 'collected', 'rejected', 'cancelled'],
  STATUS_LABELS: {
    pending: 'Pending',
    accepted: 'Accepted',
    printing: 'Printing in Progress',
    ready: 'Ready for Collection',
    collected: 'Collected',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  },
  // Statuses in which an order is still "live" (countdown is shown)
  ACTIVE_STATUSES: ['pending', 'accepted', 'printing', 'ready'],
  // Allowed admin transitions. "collected" is only set through the collection flow (QR / manual).
  TRANSITIONS: {
    pending: ['accepted', 'rejected'],
    accepted: ['printing', 'rejected'],
    printing: ['ready'],
    ready: [],
    collected: [],
    rejected: [],
    cancelled: [],
  },
  STUDENT_CANCELLABLE: ['pending', 'accepted'],

  PAPER_SIZES: ['A4', 'A3'],
  COLOUR_MODES: ['bw', 'colour'],
  SIDES: ['single', 'double'],
  ORIENTATIONS: ['portrait', 'landscape'],
  QUALITIES: ['normal', 'high'],
  BINDINGS: ['none', 'spiral', 'project'],

  ALLOWED_EXT: ['.pdf', '.doc', '.docx', '.ppt', '.pptx'],
  ALLOWED_MIME: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
  ],
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
  MAX_AVATAR_BYTES: 2 * 1024 * 1024,
};
