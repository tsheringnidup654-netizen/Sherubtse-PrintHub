/**
 * File helpers: signature (magic byte) checking and PDF page counting.
 * Extension + MIME are checked by multer; the signature check stops renamed/forged files.
 */
const fs = require('fs');
const path = require('path');

const ALLOWED = {
  '.pdf':  { signature: [Buffer.from('%PDF')], preview: true },
  '.doc':  { signature: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], preview: false },
  '.ppt':  { signature: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], preview: false },
  '.docx': { signature: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], preview: false },
  '.pptx': { signature: [Buffer.from([0x50, 0x4b, 0x03, 0x04])], preview: false },
};

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream', // some browsers send this for Office files; the signature check still applies
]);

const extOf = (name) => path.extname(String(name || '')).toLowerCase();

function hasValidSignature(filePath, ext) {
  const rule = ALLOWED[ext];
  if (!rule) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    return rule.signature.some((sig) => buf.subarray(0, sig.length).equals(sig));
  } finally {
    fs.closeSync(fd);
  }
}

/** Best-effort PDF page count (no external library). Returns null when it cannot be determined. */
function countPdfPages(filePath) {
  try {
    const text = fs.readFileSync(filePath).toString('latin1');
    const typed = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (typed > 0) return typed;
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
    return counts.length ? Math.max(...counts) : null;
  } catch {
    return null;
  }
}

function removeFile(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}

module.exports = { ALLOWED, ALLOWED_MIME, extOf, hasValidSignature, countPdfPages, removeFile };
