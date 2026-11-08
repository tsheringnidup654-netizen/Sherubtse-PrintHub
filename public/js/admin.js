/* Admin: services modal (create / edit). */
(function () {
  'use strict';
  const modalEl = document.getElementById('service-modal');
  if (!modalEl) return;
  const form = document.getElementById('service-form');
  const modal = new bootstrap.Modal(modalEl);
  const title = document.getElementById('service-modal-title');

  function fill(d) {
    ['name', 'description', 'icon', 'base_price', 'colour_price', 'unit_label', 'options_text', 'sort_order', 'category_id', 'pricing_type']
      .forEach((k) => { if (form.elements[k]) form.elements[k].value = d[k] == null ? '' : d[k]; });
  }

  document.getElementById('new-service').addEventListener('click', () => {
    form.action = '/admin/services';
    title.textContent = 'Add new service';
    fill({ icon: 'bi-printer', pricing_type: 'print', unit_label: 'per page', sort_order: 99, base_price: '', category_id: form.elements.category_id.options[0].value });
    modal.show();
  });
  document.querySelectorAll('[data-edit-service]').forEach((btn) => btn.addEventListener('click', () => {
    const d = JSON.parse(btn.dataset.editService);
    form.action = '/admin/services/' + d.id;
    title.textContent = 'Edit ' + d.name;
    fill(d);
    modal.show();
  }));
})();
