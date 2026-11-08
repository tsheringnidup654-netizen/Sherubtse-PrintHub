/* Live countdown. Reads the deadline stored in the database (data-deadline, ISO/UTC) and ticks every second.
   It only DISPLAYS time - it never changes an order's status (the admin controls printing status).
   Server time is used as the reference so a wrong device clock does not distort the countdown. */
(function () {
  'use strict';
  const serverNow = Number(document.body.dataset.serverNow) || Date.now();
  const offset = serverNow - Date.now();
  const els = Array.from(document.querySelectorAll('[data-deadline][data-live="true"]'));
  if (!els.length) return;

  const pad = (n) => String(n).padStart(2, '0');
  const STATES = ['green', 'yellow', 'red', 'expired'];
  const LABEL = { green: 'On track', yellow: 'Under 24 hours', red: 'Under 3 hours', expired: 'Deadline passed' };
  // Same thresholds as utils/time.js -> deadlineState()
  const stateOf = (ms) => (ms <= 0 ? 'expired' : ms < 3 * 3600e3 ? 'red' : ms < 24 * 3600e3 ? 'yellow' : 'green');

  function tick() {
    const now = Date.now() + offset;
    els.forEach((el) => {
      const ms = new Date(el.dataset.deadline).getTime() - now;
      const st = stateOf(ms);
      const t = Math.max(0, ms);
      const d = Math.floor(t / 864e5), h = Math.floor((t % 864e5) / 36e5), m = Math.floor((t % 36e5) / 6e4), s = Math.floor((t % 6e4) / 1e3);

      STATES.forEach((x) => el.classList.remove('state-' + x));
      el.classList.add('state-' + st);

      if (el.dataset.compact) {
        el.textContent = ms <= 0 ? 'Deadline passed' : (d ? d + 'd ' : '') + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
        return;
      }
      const set = (u, v) => { const n = el.querySelector('[data-u="' + u + '"]'); if (n) n.textContent = v; };
      set('d', d); set('h', pad(h)); set('m', pad(m)); set('s', pad(s));
      const badge = el.querySelector('[data-cd-badge]');
      if (badge) badge.textContent = LABEL[st];
    });
  }
  tick();
  setInterval(tick, 1000);
})();
