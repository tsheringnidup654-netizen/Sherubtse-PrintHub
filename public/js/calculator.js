/* Live price calculator. All prices come from the server (GET /api/price) - nothing is hard-coded here. */
(function () {
  'use strict';
  const form = document.getElementById('calc-form');
  if (!form) return;
  const $ = (sel) => document.querySelector(sel);
  const money = (n) => 'Nu ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const panel = $('#price-panel');
  let timer = null;
  let seq = 0;

  function params() {
    const f = new FormData(form);
    const q = new URLSearchParams();
    ['pages', 'copies', 'paper_size', 'colour_mode', 'sided', 'quality', 'binding'].forEach((k) => { if (f.get(k)) q.set(k, f.get(k)); });
    q.set('service', f.get('service_id'));
    return q;
  }

  function applySupport(s) {
    // Hide print-only option groups for services like binding / lamination, disable colour when unsupported
    document.querySelectorAll('[data-print-only]').forEach((el) => { el.hidden = !s.print; });
    const colour = form.querySelector('input[name=colour_mode][value=colour]');
    if (colour) {
      colour.disabled = !s.colour;
      if (!s.colour && colour.checked) form.querySelector('input[name=colour_mode][value=bw]').checked = true;
    }
  }

  async function update() {
    const my = ++seq;
    panel && panel.classList.add('loading');
    try {
      const res = await fetch('/api/price?' + params(), { headers: { Accept: 'application/json' } });
      const d = await res.json();
      if (my !== seq) return;
      const err = $('#price-error');
      if (!d.ok) { if (err) { err.textContent = d.error; err.hidden = false; } return; }
      if (err) err.hidden = true;
      applySupport(d.supports);
      $('[data-price-total]').textContent = money(d.total);
      const lines = $('[data-price-lines]');
      lines.innerHTML = '';
      d.lines.forEach((l) => { const li = document.createElement('li'); li.textContent = l; lines.appendChild(li); });
      const urgent = $('[data-price-urgent]');
      if (urgent) urgent.textContent = 'Urgent printing adds ' + money(d.urgentFee) + ' (' + d.urgentPct + '%), subject to admin approval.';
      const est = $('[data-est]');
      if (est) est.textContent = d.estimate.label + ' (workload: ' + d.estimate.workload + ')';
    } catch (_) { /* network hiccup - keep last price */ } finally { panel && panel.classList.remove('loading'); }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 200); };

  // The public calculator is preview-only: Enter must not submit it (CSP forbids inline onsubmit)
  if (form.hasAttribute('data-calc-only')) form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('input', schedule);
  form.addEventListener('change', (e) => {
    // picking a stored document fills in its page count
    if (e.target.name === 'document_id') {
      const pages = e.target.selectedOptions[0] && e.target.selectedOptions[0].dataset.pages;
      if (pages) form.elements.pages.value = pages;
    }
    // changing service on the customise page reloads with that service's own options
    if (e.target.name === 'service_id' && form.dataset.reloadOnService) {
      const slug = e.target.selectedOptions[0].dataset.slug;
      window.location.href = form.dataset.reloadOnService + '?service=' + encodeURIComponent(slug);
      return;
    }
    schedule();
  });
  const selectedDocument = form.elements.document_id;
  if (selectedDocument && !form.elements.edit_id) {
    const pages = selectedDocument.selectedOptions[0] && selectedDocument.selectedOptions[0].dataset.pages;
    if (pages) form.elements.pages.value = pages;
  }
  update();
})();
