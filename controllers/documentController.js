/** Document upload library (students) + secure file streaming (owner or admin only). */
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const C = require('../config/constants');
const { signatureMatches } = require('../utils/fileCheck');
const { toInt, decodeUploadFilename } = require('../utils/helpers');
const { countDocumentPages, refreshSinglePageDocuments } = require('../utils/documentPageCount');

const diskPath = (doc) => path.join(C.DOC_DIR, String(doc.user_id), doc.stored_name);

exports.library = async (req, res) => {
  const documents = await refreshSinglePageDocuments(
    await Document.listByUser(req.user.id),
    req.user.id,
    Document.setPages
  );
  res.render('student/documents', {
    title: 'Upload document', section: 'documents', pageCss: ['customize'], pageJs: ['upload'],
    documents, maxMb: Math.round(C.MAX_UPLOAD_BYTES / 1048576),
  });
};

exports.upload = async (req, res) => {
  const wantsJson = (req.get('accept') || '').includes('application/json');
  const fail = (msg, status = 400, code = undefined) => {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (wantsJson) return res.status(status).json({ ok: false, error: msg, code });
    req.flash('danger', msg);
    return res.redirect('/student/documents');
  };
  if (req.uploadError) return fail(req.uploadError);
  if (!req.file) return fail('Please choose a file to upload.');
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!signatureMatches(req.file.path, ext)) return fail('The file content does not match its type. Upload a genuine PDF, Word or PowerPoint file.');

  const rawPageCount = String(req.body.page_count || '').trim();
  const manualPages = rawPageCount ? toInt(rawPageCount) : null;
  const pages = await countDocumentPages(req.file.path, ext) || manualPages;
  if (rawPageCount && (!/^\d+$/.test(rawPageCount) || !pages || pages > 5000)) {
    return fail('Page count must be a whole number between 1 and 5000.');
  }
  if (!pages) {
    return fail('Could not detect the page count automatically. Enter the total pages and upload the file again.', 422, 'PAGE_COUNT_REQUIRED');
  }
  if (pages && pages > 5000) {
    return fail('Page count must be between 1 and 5000.');
  }

  const doc = await Document.create({
    user_id: req.user.id,
    original_name: path.basename(decodeUploadFilename(req.file.originalname).replace(/[\\/]/g, '/')).slice(0, 255),
    stored_name: req.file.filename,
    mime_type: req.file.mimetype, extension: ext, size_bytes: req.file.size, page_count: pages,
  });
  if (wantsJson) return res.json({ ok: true, document: { id: doc.id, name: doc.original_name, pages: doc.page_count } });
  req.flash('success', `"${doc.original_name}" uploaded.`);
  res.redirect('/student/documents');
};

exports.setPages = async (req, res) => {
  const pages = toInt(req.body.page_count);
  if (!pages || pages < 1 || pages > 5000) req.flash('danger', 'Pages must be between 1 and 5000.');
  else { await Document.setPages(toInt(req.params.id), req.user.id, pages); req.flash('success', 'Page count saved.'); }
  res.redirect('/student/documents');
};

exports.remove = async (req, res) => {
  const result = await Document.removeOwned(toInt(req.params.id), req.user.id);
  if (result.status === 'not_found') { req.flash('danger', 'Document not found.'); return res.redirect('/student/documents'); }
  if (result.status === 'in_use') { req.flash('warning', 'This document is attached to an active order and cannot be deleted until the order is complete.'); return res.redirect('/student/documents'); }
  const file = path.join(C.DOC_DIR, String(req.user.id), result.stored_name);
  fs.unlink(file, (err) => {
    if (err && err.code !== 'ENOENT') console.error('Could not remove uploaded document file:', err.message);
  });
  req.flash('success', 'Document deleted. Any cart items using it were removed too.');
  res.redirect('/student/documents');
};

/** Streams a stored file. `doc` must already have passed an ownership/role check. */
function send(doc, res, next) {
  const file = diskPath(doc);
  if (!fs.existsSync(file)) return res.status(404).render('public/error', { title: 'File missing', code: 404, message: 'The stored file could not be found.' });
  const inline = doc.mime_type === 'application/pdf';
  res.setHeader('Content-Type', inline ? 'application/pdf' : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file, (err) => err && next(err));
}
exports.send = send;

/** GET /student/documents/:id/file - the query itself is scoped to the owner. */
exports.file = async (req, res, next) => {
  const doc = await Document.findOwned(toInt(req.params.id), req.user.id);
  if (!doc) return res.status(404).render('public/error', { title: 'Not found', code: 404, message: 'Document not found.' });
  send(doc, res, next);
};
