/* Checkout: day-of-week display, live "time until collection", urgent fee and payment reference toggle. */
(function () {
  'use strict';
  const form = document.getElementById('checkout-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const money = (n) => 'Nu ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const serverOffset = (Number(document.body.dataset.serverNow) || Date.now()) - Date.now();
  const subtotal = Number(form.dataset.subtotal);
  const pct = Number(form.dataset.urgentPct);
  const minLead = Number(form.dataset.minLead);

  function deadline() {
    const d = $('deadline_date').value, t = $('deadline_time').value;
    if (!d || !t) return null;
    const dt = new Date(d + 'T' + t + ':00+06:00'); // Bhutan time (UTC+6, no DST)
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function renderDeadline() {
    const dt = deadline();
    const dayEl = $('day-name'), remain = $('time-remaining');
    if (!dt) { dayEl.textContent = '—'; remain.textContent = 'Choose a date and time'; return; }
    dayEl.textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Asia/Thimphu' }).format(dt);
    const ms = dt.getTime() - (Date.now() + serverOffset);
    if (ms <= 0) { remain.textContent = 'This time has already passed'; remain.className = 'text-danger fw-bold'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    remain.textContent = d + ' day' + (d === 1 ? '' : 's') + ' ' + h + ' h ' + m + ' min from now';
    remain.className = ms < minLead * 60000 ? 'text-danger fw-bold' : 'text-success fw-bold';
  }

  function renderTotals() {
    const urgent = $('urgent').checked;
    const fee = urgent ? Math.round(subtotal * pct) / 100 : 0;
    $('row-urgent').hidden = !urgent;
    $('urgent-amount').textContent = money(fee);
    $('grand-total').textContent = money(subtotal + fee);
  }

  function renderPayment() {
    const sel = form.querySelector('input[name=payment_method]:checked');
    $('ref-wrap').hidden = !(sel && sel.dataset.needsRef === 'true');
  }

  ['deadline_date', 'deadline_time'].forEach((id) => $(id).addEventListener('input', renderDeadline));
  $('urgent').addEventListener('change', renderTotals);
  form.querySelectorAll('input[name=payment_method]').forEach((r) => r.addEventListener('change', renderPayment));
  renderDeadline(); renderTotals(); renderPayment();
  setInterval(renderDeadline, 30000);
})();
