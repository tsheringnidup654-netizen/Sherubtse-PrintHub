/**
 * Server-side inspection of uploaded files: verifies the real file signature
 * (not just the extension / MIME type sent by the browser) and guesses PDF page counts.
 */
const fs = require('fs');

const SIG = {
  pdf: Buffer.from('%PDF'),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),                      // docx / pptx
  ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), // doc / ppt
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  jpg: Buffer.from([0xff, 0xd8, 0xff]),
};

function head(file, n = 8) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, 0);
  fs.closeSync(fd);
  return buf;
}
const starts = (buf, sig) => buf.slice(0, sig.length).equals(sig);

/** True when the file content matches the claimed extension. */
function signatureMatches(file, ext) {
  const h = head(file);
  switch (ext) {
    case '.pdf': return starts(h, SIG.pdf);
    case '.docx': case '.pptx': return starts(h, SIG.zip);
    case '.doc': case '.ppt': return starts(h, SIG.ole);
    case '.png': return starts(h, SIG.png);
    case '.jpg': case '.jpeg': return starts(h, SIG.jpg);
    default: return false;
  }
}

/** Best-effort PDF page counter (returns null when it cannot tell). */
function countPdfPages(file) {
  try {
    const txt = fs.readFileSync(file, 'latin1');
    const counts = [...txt.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    if (counts.length) return Math.max(...counts);
    const n = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
    return n || null;
  } catch (_) { return null; }
}

module.exports = { signatureMatches, countPdfPages };
