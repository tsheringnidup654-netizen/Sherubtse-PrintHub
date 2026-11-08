/**
 * Background job: every minute create "deadline approaching" notifications.
 * NOTE: it only creates notifications - it NEVER changes an order's status.
 * Printing status is controlled by the administrator alone.
 */
const Notification = require('../models/Notification');

function start() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await Notification.scanDeadlines();
    } catch (e) {
      console.error('Deadline scan failed:', e.message);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(run, 60 * 1000);
}

module.exports = { start };
