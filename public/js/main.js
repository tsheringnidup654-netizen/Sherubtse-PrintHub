/* Sherubtse PrintHub - shared behaviour (vanilla JS, no jQuery) */
(function () {
  'use strict';
  const body = document.body;
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // Hide the loading overlay once the page is ready
  window.addEventListener('load', () => document.getElementById('page-loader')?.classList.add('hide'));
  setTimeout(() => document.getElementById('page-loader')?.classList.add('hide'), 2500); // safety net

  // Toast notifications for server flash messages
  const ICONS = { success: 'success', danger: 'error', warning: 'warning', info: 'info' };
  function toast(type, message) {
    if (!window.Swal) return;
    window.Swal.fire({ toast: true, position: 'top-end', icon: ICONS[type] || 'info', title: message, showConfirmButton: false, timer: 4200, timerProgressBar: true });
  }
  window.PrintHub = { toast, csrf: body.dataset.csrf };
  if (body.dataset.flash) {
    try { const f = JSON.parse(body.dataset.flash); toast(f.type, f.message); } catch (_) { /* ignore */ }
  }

  // Confirmation dialogs: <form data-confirm="Are you sure?" data-confirm-btn="Yes, cancel it">
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.confirmed === '1') return;
    const msg = form.dataset.confirm;
    if (msg && window.Swal) {
      e.preventDefault();
      window.Swal.fire({ title: 'Please confirm', text: msg, icon: 'question', showCancelButton: true, confirmButtonText: form.dataset.confirmBtn || 'Yes, continue', confirmButtonColor: '#0b2a5b', cancelButtonText: 'Go back' })
        .then((r) => { if (r.isConfirmed) { form.dataset.confirmed = '1'; form.requestSubmit(e.submitter || undefined); } });
      return;
    }
    // loading state on the submit button (prevents double submits)
    const btn = e.submitter || form.querySelector('button[type=submit]');
    if (btn && !form.hasAttribute('data-no-loading')) setTimeout(() => btn.classList.add('btn-loading'), 0);
  });

  // Print button (CSP forbids inline onclick): <button data-print>
  $$('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));

  // Show / hide password
  $$('[data-toggle-password]').forEach((btn) => btn.addEventListener('click', () => {
    const input = document.querySelector(btn.dataset.togglePassword);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.querySelector('i').className = input.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
  }));

  // Reveal-on-scroll animation
  const reveal = $$('.reveal');
  if ('IntersectionObserver' in window && reveal.length) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    reveal.forEach((el) => io.observe(el));
  } else reveal.forEach((el) => el.classList.add('in'));

  // Live unread-notification badge (polls every 60 s)
  const url = body.dataset.unreadUrl;
  const bell = document.getElementById('bell-count');
  if (url && bell) {
    setInterval(() => {
      if (document.hidden) return;
      fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) { bell.textContent = d.count; bell.hidden = !d.count; } })
        .catch(() => {});
    }, 60000);
  }
})();
