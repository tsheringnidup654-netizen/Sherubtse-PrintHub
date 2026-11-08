/* Drag-and-drop document upload with validation, preview and progress. */
(function () {
  'use strict';
  const zone = document.getElementById('dropzone');
  if (!zone) return;
  const input = document.getElementById('file-input');
  const maxBytes = Number(zone.dataset.maxBytes);
  const ALLOWED = ['pdf', 'doc', 'docx', 'ppt', 'pptx'];
  const $ = (id) => document.getElementById(id);
  let chosen = null;

  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const fail = (msg) => window.PrintHub.toast('danger', msg);

  function guessPdfPages(file) {
    if (file.size > 15 * 1048576) return;
    const r = new FileReader();
    r.onload = () => {
      const counts = [...String(r.result).matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
      if (counts.length && !$('page-count').value) $('page-count').value = Math.max(...counts);
    };
    r.readAsBinaryString(file);
  }

  function choose(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED.includes(ext)) return fail('Only PDF, DOC, DOCX, PPT and PPTX files are allowed.');
    if (file.size > maxBytes) return fail('File is too large. Maximum size is ' + fmtSize(maxBytes) + '.');
    if (file.size === 0) return fail('That file is empty.');
    chosen = file;
    $('file-name').textContent = file.name;
    $('file-size').textContent = fmtSize(file.size) + ' · ' + ext.toUpperCase();
    $('chosen').hidden = false;
    zone.hidden = true;
    $('page-count').value = '';
    const autoPageCount = ['pdf', 'docx'].includes(ext);
    $('page-count').required = !autoPageCount;
    $('page-count').placeholder = autoPageCount ? 'Detected automatically' : 'Enter total pages';
    const frame = $('preview-frame');
    if (ext === 'pdf') {
      frame.src = URL.createObjectURL(file);
      frame.hidden = false; $('no-preview').hidden = true;
      guessPdfPages(file);
    } else { frame.hidden = true; frame.removeAttribute('src'); $('no-preview').hidden = false; }
  }

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => choose(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => choose(e.dataTransfer.files[0]));

  $('cancel-choice').addEventListener('click', () => { chosen = null; input.value = ''; $('chosen').hidden = true; zone.hidden = false; });

  $('upload-btn').addEventListener('click', () => {
    if (!chosen) return;
    const pageValue = $('page-count').value.trim();
    const ext = chosen.name.split('.').pop().toLowerCase();
    const autoPageCount = ['pdf', 'docx'].includes(ext);
    if ((!autoPageCount || pageValue) && (!/^\d+$/.test(pageValue) || Number(pageValue) < 1 || Number(pageValue) > 5000)) {
      fail('Enter a page count between 1 and 5000.');
      $('page-count').focus();
      return;
    }
    const fd = new FormData();
    fd.append('document', chosen);
    if (pageValue) fd.append('page_count', pageValue);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/student/documents');
    xhr.setRequestHeader('x-csrf-token', window.PrintHub.csrf);
    xhr.setRequestHeader('Accept', 'application/json');
    const bar = $('upload-bar');
    bar.parentElement.hidden = false;
    $('upload-btn').disabled = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%'; };
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText); } catch (_) { /* ignore */ }
      if (xhr.status === 200 && d.ok) { sessionStorage.setItem('ph-toast', 'Document uploaded successfully.'); window.location.reload(); }
      else {
        fail(d.error || 'Upload failed. Please try again.');
        if (d.code === 'PAGE_COUNT_REQUIRED') {
          $('page-count').required = true;
          $('page-count').placeholder = 'Enter total pages';
          $('page-count-help').textContent = '(could not be read automatically; please enter the page count)';
          $('page-count').focus();
        }
        $('upload-btn').disabled = false;
        bar.parentElement.hidden = true;
        bar.style.width = '0';
      }
    };
    xhr.onerror = () => { fail('Network error during upload.'); $('upload-btn').disabled = false; };
    xhr.send(fd);
  });

  const msg = sessionStorage.getItem('ph-toast');
  if (msg) { sessionStorage.removeItem('ph-toast'); window.PrintHub.toast('success', msg); }

  // Preview of already-uploaded documents (PDFs open in a modal frame)
  document.querySelectorAll('[data-preview-url]').forEach((btn) => btn.addEventListener('click', () => {
    $('modal-frame').src = btn.dataset.previewUrl;
    $('modal-title').textContent = btn.dataset.previewName;
    new bootstrap.Modal($('preview-modal')).show();
  }));
  $('preview-modal')?.addEventListener('hidden.bs.modal', () => { $('modal-frame').removeAttribute('src'); });
})();
